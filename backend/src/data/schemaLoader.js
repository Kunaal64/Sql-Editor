const { readdirSync, readFileSync } = require('fs');
const { join } = require('path');

/**
 * Infers table schemas from INSERT statements in a SQL dump.
 * If CREATE TABLE statements are already present, SQLite handles creation
 * and we just read the real schema back from sqlite_schema.
 *
 * This keeps the backend generic: drop any .sql file into src/data/ and the
 * corresponding table(s) become queryable without editing code.
 */

function inferTableSchemas(sqlDump) {
  const tables = new Map();

  const insertRegex =
    /insert\s+into\s+([`"\w]+)\s*\(([^)]+)\)\s*values\s*\(([^)]+)\)/gi;

  let match;
  while ((match = insertRegex.exec(sqlDump)) !== null) {
    const tableName = stripQuotes(match[1]);
    const columns = match[2].split(',').map(stripQuotes);
    const values = splitValues(match[3]);

    if (!tables.has(tableName)) {
      tables.set(tableName, { name: tableName, columns: new Map() });
    }
    const table = tables.get(tableName);

    for (let i = 0; i < columns.length && i < values.length; i++) {
      const colName = columns[i];
      const value = values[i];
      if (!table.columns.has(colName)) {
        table.columns.set(colName, inferType(value));
      }
    }
  }

  return {
    tables: Array.from(tables.values()).map((t) => ({
      name: t.name,
      columns: Array.from(t.columns.entries()).map(([name, type]) => ({
        name,
        type,
      })),
    })),
  };
}

function splitValues(valuesText) {
  const values = [];
  let current = '';
  let inQuote = false;
  let quoteChar = null;

  for (let i = 0; i < valuesText.length; i++) {
    const char = valuesText[i];

    if (!inQuote && (char === "'" || char === '"')) {
      inQuote = true;
      quoteChar = char;
      current += char;
    } else if (inQuote && char === quoteChar) {
      inQuote = false;
      quoteChar = null;
      current += char;
    } else if (char === ',' && !inQuote) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    values.push(current.trim());
  }

  return values;
}

function createTableSql(table) {
  const columnDefs = table.columns
    .map((col) => `${quoteIdentifier(col.name)} ${col.type}`)
    .join(', ');

  return `CREATE TABLE IF NOT EXISTS ${quoteIdentifier(table.name)} (${columnDefs});`;
}

function quoteIdentifier(name) {
  return `"${name.replace(/"/g, '""')}"`;
}

function stripQuotes(raw) {
  return raw
    .trim()
    .replace(/^[`"']/, '')
    .replace(/[`"']$/, '');
}

function deriveTableName(fileName) {
  return fileName.replace(/\.sql$/i, '').replace(/[^a-zA-Z0-9_]/g, '_');
}

/**
 * Auto-generated mock data dumps often use the generic table name MOCK_DATA.
 * When a file is INSERT-only and only references MOCK_DATA, rename that table
 * to the filename so each dataset becomes its own queryable table.
 */
function normalizeMockDataTable(file, sql) {
  const hasCreate = /CREATE\s+TABLE/i.test(sql);
  if (hasCreate) {
    return { sql, renamed: false };
  }

  const tableNames = new Set();
  const insertRegex = /insert\s+into\s+([`"\w]+)/gi;
  let match;

  while ((match = insertRegex.exec(sql)) !== null) {
    tableNames.add(stripQuotes(match[1]));
  }

  if (tableNames.size !== 1) {
    return { sql, renamed: false };
  }

  const onlyTable = Array.from(tableNames)[0];
  const derived = deriveTableName(file);

  if (
    onlyTable.toLowerCase() === 'mock_data' &&
    derived.toLowerCase() !== 'mock_data'
  ) {
    const escaped = onlyTable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const renamedSql = sql.replace(
      new RegExp(`\\b${escaped}\\b`, 'g'),
      derived
    );
    return {
      sql: renamedSql,
      renamed: true,
      originalTable: onlyTable,
      newTable: derived,
    };
  }

  return { sql, renamed: false };
}

function inferType(value) {
  if (/^-?\d+\.\d+$/.test(value)) return 'REAL';
  if (/^-?\d+$/.test(value)) return 'INTEGER';
  return 'TEXT';
}

function hasCreateTableFor(sqlDump, tableName) {
  const escaped = tableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(
    `create\\s+table\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?["']?${escaped}["']?`,
    'i'
  );
  return regex.test(sqlDump);
}

function extractCreateTableStatements(sqlDump) {
  const statements = [];
  const regex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[\s\S]*?;\s*/gi;
  let match;

  while ((match = regex.exec(sqlDump)) !== null) {
    statements.push(match[0].trim());
  }

  return statements;
}

function tableExists(db, tableName) {
  const row = db
    .prepare(
      `SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ? LIMIT 1;`
    )
    .get(tableName);
  return !!row;
}

function loadSqlDumps(dataDir) {
  return readdirSync(dataDir)
    .filter((file) => file.toLowerCase().endsWith('.sql'))
    .map((file) => ({
      file,
      sql: readFileSync(join(dataDir, file), 'utf-8'),
    }));
}

module.exports = {
  inferTableSchemas,
  createTableSql,
  hasCreateTableFor,
  loadSqlDumps,
  extractCreateTableStatements,
  tableExists,
  normalizeMockDataTable,
};
