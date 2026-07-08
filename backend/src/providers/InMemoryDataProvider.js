const { join } = require('path');
const Database = require('better-sqlite3');
const {
  inferTableSchemas,
  createTableSql,
  loadSqlDumps,
  extractCreateTableStatements,
  tableExists,
  normalizeMockDataTable,
} = require('../data/schemaLoader');

const DATA_DIR = join(__dirname, '../data');

/**
 * Executes real SQL against an in-memory SQLite database seeded from every
 * .sql file in src/data/. Because SQLite runs the queries, joins, aggregations,
 * subqueries, window functions, and any other SQLite-supported SQL work out of
 * the box.
 *
 * Tables are discovered automatically: if a dump contains CREATE TABLE it is
 * used as-is; otherwise the schema is inferred from INSERT column lists and
 * value types.
 */
class InMemoryDataProvider {
  constructor() {
    this.db = new Database(':memory:');
    this.bootstrap();
  }

  async execute(query) {
    const start = Date.now();

    try {
      const statement = this.db.prepare(query);
      const rawRows = statement.all();
      const columnMetadata = this.buildColumnMetadata(statement.columns());

      // Normalize BigInt values so they serialize cleanly over JSON.
      const rows = rawRows.map((row) => this.serializeRow(row));

      return {
        columns: columnMetadata,
        rows,
        rowCount: rows.length,
        executionTimeMs: Date.now() - start,
      };
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async getSchema() {
    return this.readSchemaFromSQLite();
  }

  bootstrap() {
    const dumps = loadSqlDumps(DATA_DIR);

    if (dumps.length === 0) {
      throw new Error('No .sql dataset files found in src/data/');
    }

    // Normalize each dump: INSERT-only files that only reference MOCK_DATA
    // get renamed to the filename so multiple datasets don't collapse into
    // one table.
    const normalizedDumps = dumps.map(({ file, sql }) => ({
      file,
      ...normalizeMockDataTable(file, sql),
    }));

    // Pass 1: run CREATE TABLE statements first so we respect the schema
    // defined in the dump files. Use IF NOT EXISTS to tolerate duplicates.
    for (const { sql } of normalizedDumps) {
      const createStatements = extractCreateTableStatements(sql);
      for (const stmt of createStatements) {
        const safeStmt = stmt.replace(/\bCREATE\s+TABLE\b/gi, 'CREATE TABLE IF NOT EXISTS');
        this.db.exec(safeStmt);
      }
    }

    // Pass 2: infer schemas from INSERT statements and create any tables
    // that are still missing.
    const allSql = normalizedDumps.map((d) => d.sql).join('\n');
    const inferred = inferTableSchemas(allSql);
    for (const table of inferred.tables) {
      if (!tableExists(this.db, table.name)) {
        this.db.exec(createTableSql(table));
      }
    }

    // Pass 3: execute the full dumps (INSERTs, indexes, etc.).
    // Convert any plain CREATE TABLE to IF NOT EXISTS so overlapping tables
    // across multiple files don't crash the loader.
    for (const { file, sql, renamed, originalTable, newTable } of normalizedDumps) {
      const renameNote = renamed ? ` (${originalTable} -> ${newTable})` : '';
      console.log(`Loading dataset: ${file}${renameNote}`);
      const safeSql = sql.replace(/\bCREATE\s+TABLE\b/gi, 'CREATE TABLE IF NOT EXISTS');
      this.db.exec(safeSql);
    }
  }

  readSchemaFromSQLite() {
    const tables = this.db
      .prepare(
        `SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%';`
      )
      .all();

    return {
      tables: tables.map(({ name }) => ({
        name,
        columns: this.readColumns(name),
      })),
    };
  }

  readColumns(tableName) {
    const rows = this.db
      .prepare(`PRAGMA table_info(${this.quoteIdentifier(tableName)});`)
      .all();

    return rows.map((row) => ({
      name: row.name,
      type: row.type || 'TEXT',
    }));
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

  quoteIdentifier(name) {
    return `"${name.replace(/"/g, '""')}"`;
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

module.exports = { InMemoryDataProvider };
