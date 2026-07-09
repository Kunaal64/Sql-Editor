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

/**
 * Walks through a SQL string and converts MySQL-style backslash escapes
 * inside single-quoted string literals to SQLite-style doubled quotes.
 */
function normalizeStringEscapes(sql) {
  let out = '';
  let i = 0;

  while (i < sql.length) {
    const char = sql[i];

    if (char !== "'") {
      out += char;
      i++;
      continue;
    }

    // Start of a single-quoted string literal.
    let literal = "'";
    i++;

    while (i < sql.length) {
      const c = sql[i];

      if (c === '\\' && i + 1 < sql.length) {
        const next = sql[i + 1];
        switch (next) {
          case "'":
            literal += "''";
            break;
          case '"':
            literal += '"';
            break;
          case '\\':
            literal += '\\';
            break;
          case 'n':
            literal += '\n';
            break;
          case 't':
            literal += '\t';
            break;
          case 'r':
            literal += '\r';
            break;
          default:
            // Unknown escape: drop the backslash and keep the character.
            literal += next;
        }
        i += 2;
      } else if (c === "'") {
        literal += "'";
        i++;
        if (i < sql.length && sql[i] === "'") {
          // Doubled quote is still part of the same literal.
          literal += "'";
          i++;
        } else {
          break;
        }
      } else {
        literal += c;
        i++;
      }
    }

    out += literal;
  }

  return out;
}

/**
 * Converts common MySQL / MariaDB dump syntax into SQLite-compatible SQL.
 * Applied generically so any future MySQL-style dump loads without edits.
 */
function normalizeMySqlDump(sql) {
  const noOptions = sql
    // Remove MySQL session-variable SET statements.
    .replace(/^\s*SET\s+[^;]+;\s*$/gim, '')
    // Remove LOCK / UNLOCK TABLES directives.
    .replace(/^\s*LOCK TABLES\b[^;]+;\s*$/gim, '')
    .replace(/^\s*UNLOCK TABLES\s*;\s*$/gim, '')
    // Remove transaction statements that may be unmatched after stripping SET AUTOCOMMIT.
    .replace(/^\s*(COMMIT|ROLLBACK|START TRANSACTION|BEGIN)\s*;\s*$/gim, '')
    // Convert UNIQUE KEY `name` (cols) -> CONSTRAINT `name` UNIQUE (cols).
    .replace(/\bUNIQUE\s+KEY\s+([`"]?\w+[`"]?\s*)?(\([^)]+\))/gi, 'CONSTRAINT $1 UNIQUE $2')
    // Remove plain KEY / INDEX table constraints (not PRIMARY/FOREIGN/UNIQUE).
    .replace(/\b(KEY|INDEX)\s+[`"]?\w+[`"]?\s*\([^)]+\)\s*,?/gi, '')
    // Remove the AUTO_INCREMENT column attribute; SQLite will load the ids from INSERTs.
    .replace(/\bAUTO_INCREMENT\b/gi, '')
    // Convert MySQL function-style timestamp defaults to SQLite keywords.
    .replace(/\bDEFAULT\s+current_timestamp\(\)/gi, 'DEFAULT CURRENT_TIMESTAMP')
    .replace(/\bDEFAULT\s+current_date\(\)/gi, 'DEFAULT CURRENT_DATE')
    .replace(/\bDEFAULT\s+current_time\(\)/gi, 'DEFAULT CURRENT_TIME')
    // Strip MySQL table options after the CREATE TABLE column list.
    .replace(
      /\)\s*(ENGINE|AUTO_INCREMENT|DEFAULT CHARSET|CHARSET|COLLATE|COMMENT|ROW_FORMAT|KEY_BLOCK_SIZE|STATS_AUTO_RECALC|PACK_KEYS|DELAY_KEY_WRITE|MAX_ROWS|MIN_ROWS)\s*=[^;]*;/gi,
      ');'
    )
    // Collapse leftover multiple spaces.
    .replace(/ {2,}/g, ' ');

  // MySQL uses backslash escapes inside string literals; SQLite uses
  // doubled single quotes. Do this last so we only touch real literals.
  return normalizeStringEscapes(noOptions);
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

/**
 * Splits a string by a delimiter, respecting quoted strings and parentheses.
 */
function splitTopLevel(str, delimiter) {
  const parts = [];
  let current = '';
  let inQuote = false;
  let quoteChar = null;
  let parenDepth = 0;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    if (inQuote) {
      current += char;
      if (char === quoteChar && str[i - 1] !== '\\') {
        inQuote = false;
      }
    } else if (char === "'" || char === '"' || char === '`') {
      inQuote = true;
      quoteChar = char;
      current += char;
    } else if (char === '(') {
      parenDepth++;
      current += char;
    } else if (char === ')') {
      parenDepth--;
      current += char;
    } else if (char === delimiter && parenDepth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

/**
 * Parses a CREATE TABLE statement and returns its column definitions.
 * Handles basic SQLite CREATE TABLE syntax; table-level constraints are ignored.
 */
function parseCreateTable(stmt) {
  const nameMatch = stmt.match(
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:["'`]?)([^\s("'`]+)/i
  );
  const name = nameMatch ? stripQuotes(nameMatch[1]) : 'unknown';

  const openIdx = stmt.indexOf('(');
  const closeIdx = stmt.lastIndexOf(')');
  if (openIdx === -1 || closeIdx === -1 || closeIdx <= openIdx) {
    return { name, columns: [] };
  }

  const body = stmt.slice(openIdx + 1, closeIdx);
  const columnParts = splitTopLevel(body, ',');
  const columns = [];

  for (const part of columnParts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    // Skip table-level constraints
    if (
      /^(PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK|CONSTRAINT)\b/i.test(trimmed)
    ) {
      continue;
    }
    const tokens = trimmed.split(/\s+/);
    const colName = stripQuotes(tokens[0]);
    const colType = tokens[1] ? tokens[1].toUpperCase() : 'TEXT';
    columns.push({ name: colName, type: colType });
  }

  return { name, columns };
}

/**
 * Builds schema metadata for a single SQL file without executing INSERTs.
 */
function extractFileSchema(file, sql) {
  const mockNormalized = normalizeMockDataTable(file, sql);
  // Sanitize MySQL / MariaDB syntax so the dump runs in SQLite.
  const effectiveSql = normalizeMySqlDump(mockNormalized.sql);

  const createStatements = extractCreateTableStatements(effectiveSql);
  if (createStatements.length > 0) {
    return {
      tables: createStatements.map(parseCreateTable),
      normalizedSql: effectiveSql,
    };
  }

  // INSERT-only file: infer schema from INSERT column lists.
  return {
    tables: inferTableSchemas(effectiveSql).tables,
    normalizedSql: effectiveSql,
  };
}

/**
 * Removes SQL comments and replaces quoted string literals with placeholders
 * so regex searches don't accidentally match text inside strings.
 */
function sanitizeSqlForAnalysis(sql) {
  // Remove /* ... */ comments (non-greedy across lines)
  let cleaned = sql.replace(/\/\*[\s\S]*?\*\//g, ' ');
  // Remove -- comments until end of line
  cleaned = cleaned.replace(/--[^\n]*/g, ' ');
  // Replace '...' and "..." strings with a placeholder
  cleaned = cleaned.replace(/'([^'\\]|\\.)*'/g, "'?'");
  cleaned = cleaned.replace(/"([^"\\]|\\.)*"/g, '"?"');
  return cleaned;
}

/**
 * Extracts table names referenced by FROM / JOIN clauses in a SQL query.
 * Known table names are used to avoid false positives from aliases/column names.
 */
function extractReferencedTables(sql, knownTables) {
  const lowerKnown = knownTables.map((t) => t.toLowerCase());
  const cleaned = sanitizeSqlForAnalysis(sql);

  // Build a set of identifiers to ignore: CTE names and subquery aliases.
  const ignore = new Set();

  // WITH cte_name AS ( ... )
  const cteRegex = /\bWITH\b\s+(["`\w]+)/gi;
  let cteMatch;
  while ((cteMatch = cteRegex.exec(cleaned)) !== null) {
    ignore.add(stripQuotes(cteMatch[1]).toLowerCase());
  }

  // Also ignore aliases introduced after table names. We'll track them as we scan.
  const tokens = cleaned.match(/[\w.]+|[(),;]|\S/g) || [];
  const referenced = new Set();

  const tableKeywords = ['FROM', 'JOIN'];
  const stopWords = new Set([
    'SELECT', 'WHERE', 'GROUP', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET', 'UNION',
    'INTERSECT', 'EXCEPT', 'ON', 'USING', 'WITH', 'VALUES', 'INSERT', 'UPDATE',
    'DELETE', 'SET', 'AND', 'OR', 'NOT', 'NULL', 'IS', 'IN', 'BETWEEN', 'LIKE',
    'EXISTS', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'AS', 'DISTINCT', 'ALL',
    'LEFT', 'RIGHT', 'INNER', 'OUTER', 'CROSS', 'FULL', 'NATURAL', 'FROM', 'JOIN',
  ]);

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i].toUpperCase();
    if (!tableKeywords.includes(token)) continue;

    // Scan forward collecting table names until a stop word or comma-chain end.
    let j = i + 1;
    while (j < tokens.length) {
      const nextToken = tokens[j];
      const upperNext = nextToken.toUpperCase();

      if (upperNext === '(') {
        // Subquery: skip it entirely
        let depth = 1;
        j++;
        while (j < tokens.length && depth > 0) {
          if (tokens[j] === '(') depth++;
          if (tokens[j] === ')') depth--;
          j++;
        }
        continue;
      }

      if (upperNext === ',') {
        j++;
        continue;
      }

      if (stopWords.has(upperNext)) {
        break;
      }

      // Looks like a candidate identifier
      const candidateRaw = stripQuotes(nextToken);
      const candidate = candidateRaw.split('.').pop().toLowerCase();

      if (
        !upperNext.match(/^[A-Z_][A-Z0-9_]*$/i) ||
        stopWords.has(candidate.toUpperCase()) ||
        ignore.has(candidate)
      ) {
        j++;
        continue;
      }

      if (lowerKnown.includes(candidate)) {
        referenced.add(candidate);
      }

      // Skip an optional alias (AS alias or just alias)
      const afterAlias = j + 1;
      if (afterAlias < tokens.length && tokens[afterAlias].toUpperCase() === 'AS') {
        if (afterAlias + 1 < tokens.length) {
          ignore.add(stripQuotes(tokens[afterAlias + 1]).toLowerCase());
        }
        j = afterAlias + 2;
      } else if (
        afterAlias < tokens.length &&
        tokens[afterAlias].toUpperCase().match(/^[A-Z_][A-Z0-9_]*$/i) &&
        !stopWords.has(tokens[afterAlias].toUpperCase()) &&
        !['(', ',', '.'].includes(tokens[afterAlias])
      ) {
        ignore.add(stripQuotes(tokens[afterAlias]).toLowerCase());
        j = afterAlias + 1;
      } else {
        j++;
      }
    }
  }

  return Array.from(referenced);
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
  normalizeMySqlDump,
  extractFileSchema,
  parseCreateTable,
  splitTopLevel,
  extractReferencedTables,
  sanitizeSqlForAnalysis,
};
