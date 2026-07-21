const { join } = require('path');
const Database = require('better-sqlite3');
const {
  loadSqlDumps,
  extractFileSchema,
  extractReferencedTables,
  tableExists,
  createTableSql,
  stripDanglingDeleteStatements,
} = require('../data/schemaLoader');

const DATA_DIR = join(__dirname, '../data');

/**
 * Executes real SQL against an in-memory SQLite database.
 *
 * Datasets are lazy-loaded: at startup we only scan the .sql files to build a
 * registry of table schemas. When a query arrives we detect which tables it
 * references, load only those files into SQLite, and cache them for the next
 * query. This lets the backend scale to hundreds of datasets without paying the
 * memory/time cost of loading everything up front.
 */
class SqliteDataProvider {
  constructor() {
    this.db = new Database(':memory:');
    this.registry = this.buildRegistry();

    // Map each table name (case-insensitive) to its registry entry so queries
    // that reference a table can be resolved instantly.
    this.tableToEntry = new Map();
    for (const entry of this.registry) {
      for (const tableName of entry.tables) {
        this.tableToEntry.set(tableName.toLowerCase(), entry);
      }
    }
  }

  buildRegistry() {
    const dumps = loadSqlDumps(DATA_DIR);

    if (dumps.length === 0) {
      throw new Error('No .sql dataset files found in src/data/');
    }

    return dumps.map(({ file, sql }) => {
      const { tables, normalizedSql } = extractFileSchema(file, sql);
      const tableNames = tables.map((t) => t.name);
      console.log(`Registered dataset: ${file} -> ${tableNames.join(', ')}`);

      return {
        file,
        sql: normalizedSql,
        tables: tableNames,
        schema: { tables },
        loaded: false,
      };
    });
  }

  async getSchema() {
    // Return schemas from the registry without loading any data.
    return {
      tables: this.registry.flatMap((entry) => entry.schema.tables),
    };
  }

  /**
   * Loads the dataset file(s) that contain the referenced tables, if they have
   * not been loaded already. Whole files are loaded atomically because a single
   * dump can contain CREATE TABLE + INSERT for multiple interrelated tables.
   */
  ensureTablesLoaded(tableNames) {
    for (const tableName of tableNames) {
      const entry = this.tableToEntry.get(tableName.toLowerCase());
      if (!entry || entry.loaded) continue;

      // Create any tables defined by this file that do not exist yet.
      // This is needed for INSERT-only dumps where the schema was inferred
      // from INSERT column lists rather than declared with CREATE TABLE.
      for (const table of entry.schema.tables) {
        if (!tableExists(this.db, table.name)) {
          this.db.exec(createTableSql(table));
        }
      }

      console.log(`Lazy-loading dataset: ${entry.file}`);
      const tableNames = entry.schema.tables.map((t) => t.name);
      let safeSql = stripDanglingDeleteStatements(entry.sql, tableNames);
      safeSql = safeSql.replace(
        /\bCREATE\s+TABLE\b/gi,
        'CREATE TABLE IF NOT EXISTS'
      );
      this.db.exec(safeSql);
      entry.loaded = true;
    }
  }

  async execute(query, options = {}) {
    const start = Date.now();
    const { page, pageSize, includeTotalRows } = options;

    try {
      const normalizedSql = query.trim().replace(/;$/, '');
      const allKnownTables = this.registry.flatMap((entry) => entry.tables);
      const referencedTables = extractReferencedTables(
        normalizedSql,
        allKnownTables
      );
      this.ensureTablesLoaded(referencedTables);

      const isSelect = /^\s*SELECT/i.test(normalizedSql);
      const isPaginated = isSelect && page != null && pageSize != null;
      const shouldCount = isPaginated && includeTotalRows !== false;
      let totalRowCount = isPaginated ? null : undefined;

      let finalSql = normalizedSql;
      let params = [];

      if (isPaginated) {
        if (shouldCount) {
          const countStmt = this.db.prepare(
            `SELECT COUNT(*) AS c FROM (${normalizedSql})`
          );
          totalRowCount = Number(countStmt.get().c);
        }
        finalSql = `SELECT * FROM (${normalizedSql}) LIMIT ? OFFSET ?`;
        params = [pageSize, page * pageSize];
      }

      const statement = this.db.prepare(finalSql);
      const rawRows = statement.all(...params);
      const columnMetadata = this.buildColumnMetadata(statement.columns());
      const rows = rawRows.map((row) => this.serializeRow(row));

      return {
        columns: columnMetadata,
        rows,
        rowCount: rows.length,
        totalRowCount: totalRowCount === undefined ? rows.length : totalRowCount,
        page: page ?? 0,
        pageSize: pageSize ?? rows.length,
        executionTimeMs: Date.now() - start,
      };
    } catch (err) {
      throw this.mapError(err);
    }
  }

  buildColumnMetadata(columns) {
    return columns.map((col) => ({
      name: col.name,
      type: col.type || 'TEXT',
    }));
  }

  serializeRow(row) {
    const out = {};
    for (const [key, value] of Object.entries(row)) {
      out[key] = typeof value === 'bigint' ? Number(value) : value;
    }
    return out;
  }

  mapError(err) {
    const message = err instanceof Error ? err.message : String(err);
    const normalized = message.toLowerCase();

    let code = 'INTERNAL_ERROR';

    if (
      normalized.includes('syntax error') ||
      normalized.includes('unrecognized token') ||
      normalized.includes('incomplete input') ||
      normalized.includes('near')
    ) {
      code = 'SYNTAX_ERROR';
    } else if (
      normalized.includes('no such table') ||
      normalized.includes('no such column')
    ) {
      code = 'UNKNOWN_TABLE';
    } else if (
      normalized.includes('not authorized') ||
      normalized.includes('cannot')
    ) {
      code = 'UNSUPPORTED_SQL';
    }

    const wrapped = new Error(message);
    wrapped.code = code;
    return wrapped;
  }
}

module.exports = { SqliteDataProvider };
