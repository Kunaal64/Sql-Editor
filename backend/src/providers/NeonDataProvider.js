
/**
 * Executes read-only SQL against a PostgreSQL database (e.g. Neon).
 *
 * The provider is intentionally SELECT-only: any DDL/DML is rejected before
 * it reaches the database. Schema discovery is driven by information_schema.
 */
class NeonDataProvider {
  constructor(pool) {
    this.pool = pool;
  }

  async getSchema() {
    const result = await this.pool.query(
      `SELECT
         table_name,
         column_name,
         data_type
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND LEFT(table_name, 1) <> '_'
       ORDER BY table_name, ordinal_position;`
    );

    const tablesMap = new Map();
    for (const row of result.rows) {
      if (!tablesMap.has(row.table_name)) {
        tablesMap.set(row.table_name, {
          name: row.table_name,
          columns: [],
        });
      }
      tablesMap.get(row.table_name).columns.push({
        name: row.column_name,
        type: this.mapPgType(row.data_type),
      });
    }

    return { tables: Array.from(tablesMap.values()) };
  }

  async execute(query, options = {}) {
    const start = Date.now();
    const { page, pageSize, includeTotalRows } = options;

    const normalizedSql = query.trim().replace(/;$/, '');

    if (!/^\s*SELECT\b/i.test(normalizedSql)) {
      const err = new Error('Only SELECT statements are allowed');
      err.code = 'UNSUPPORTED_SQL';
      throw err;
    }

    try {
      let finalSql = normalizedSql;
      let params = [];
      const isPaginated = page != null && pageSize != null;
      const shouldCount = isPaginated && includeTotalRows !== false;
      let totalRowCount = isPaginated ? null : undefined;

      if (isPaginated) {
        if (shouldCount) {
          const countResult = await this.pool.query(
            `SELECT COUNT(*) AS c FROM (${normalizedSql}) AS _q`,
            []
          );
          totalRowCount = Number(countResult.rows[0].c);
        }
        finalSql = `SELECT * FROM (${normalizedSql}) AS _q LIMIT $1 OFFSET $2`;
        params = [pageSize, page * pageSize];
      }

      const result = await this.pool.query(finalSql, params);
      const rows = result.rows.map((row) => this.serializeRow(row));
      const columns = result.fields.map((field) => ({
        name: field.name,
        // Result-set metadata from pg only gives an OID; the accurate types
        // come from /api/schema. TEXT is a safe display default here.
        type: 'TEXT',
      }));

      return {
        columns,
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

  serializeRow(row) {
    const out = {};
    for (const [key, value] of Object.entries(row)) {
      // PostgreSQL can return bigint as string; keep it numeric when safe.
      if (typeof value === 'bigint') {
        out[key] = Number(value);
      } else {
        out[key] = value;
      }
    }
    return out;
  }

  mapPgType(pgType) {
    switch (pgType?.toLowerCase()) {
      case 'integer':
      case 'smallint':
      case 'bigint':
      case 'serial':
      case 'bigserial':
        return 'INTEGER';
      case 'real':
      case 'double precision':
      case 'numeric':
      case 'decimal':
        return 'REAL';
      case 'boolean':
        return 'BOOLEAN';
      case 'timestamp without time zone':
      case 'timestamp with time zone':
      case 'date':
      case 'time':
        return 'TEXT';
      default:
        return 'TEXT';
    }
  }

  mapError(err) {
    if (!(err instanceof Error)) {
      const wrapped = new Error(String(err));
      wrapped.code = 'INTERNAL_ERROR';
      return wrapped;
    }

    const pgCode = err.code;
    let code = 'INTERNAL_ERROR';

    // https://www.postgresql.org/docs/current/errcodes-appendix.html
    // Check specific codes first, then fall back to the broad syntax-error class.
    if (pgCode === '42P01' || /relation .* does not exist/i.test(err.message)) {
      code = 'UNKNOWN_TABLE';
    } else if (pgCode === '42703' || /column .* does not exist/i.test(err.message)) {
      code = 'UNKNOWN_TABLE';
    } else if (pgCode === '42501') {
      code = 'UNSUPPORTED_SQL';
    } else if (
      pgCode?.startsWith('42') ||
      /syntax error/i.test(err.message) ||
      /at or near/i.test(err.message)
    ) {
      code = 'SYNTAX_ERROR';
    }

    const wrapped = new Error(err.message);
    wrapped.code = code;
    wrapped.original = err;
    return wrapped;
  }
}

module.exports = { NeonDataProvider };
