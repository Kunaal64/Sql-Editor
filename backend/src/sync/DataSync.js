const { createHash } = require('crypto');
const { watch } = require('fs');
const { join } = require('path');
const {
  loadSqlDumps,
  extractFileSchema,
  createPostgresTableSql,
  normalizeSqlForPostgres,
  normalizeMockDataTable,
  stripDanglingDeleteStatements,
} = require('../data/schemaLoader');

const DATA_DIR = join(__dirname, '../data');
const DEBOUNCE_MS = 1000;

/**
 * Keeps the dataset files in backend/src/data/ synchronized with a PostgreSQL
 * database. Sync is incremental: files are hashed and only new or changed files
 * are uploaded. Each file is loaded inside a transaction so partial uploads are
 * rolled back on failure.
 */
class DataSync {
  constructor(pool) {
    this.pool = pool;
    this._lockPromise = Promise.resolve();
    this._watcher = null;
    this._debounceTimer = null;
  }

  /**
   * Runs an incremental sync. Call on startup and whenever the data directory
   * changes. Set force=true to re-upload every file regardless of hash.
   */
  async sync(force = false) {
    const release = await this._acquireLock();
    try {
      await this._ensureLogTable();

      const dumps = loadSqlDumps(DATA_DIR);
      if (dumps.length === 0) {
        console.log('[DataSync] No .sql dataset files found');
        return;
      }

      const logResult = await this.pool.query(
        'SELECT file_name, file_hash FROM _seed_log'
      );
      const logMap = new Map(
        logResult.rows.map((row) => [row.file_name, row.file_hash])
      );

      let synced = 0;
      let skipped = 0;
      let failed = 0;

      for (const { file, sql } of dumps) {
        const hash = this._hash(sql);
        const loggedHash = logMap.get(file);

        if (!force && loggedHash === hash) {
          skipped++;
          console.log(`[DataSync] Skipping ${file} (unchanged)`);
          continue;
        }

        try {
          console.log(
            `[DataSync] Syncing ${file}${loggedHash ? ' (changed)' : ' (new)'}`
          );
          await this._syncFile(file, sql, hash);
          synced++;
        } catch (err) {
          failed++;
          console.error(`[DataSync] Failed to sync ${file}:`, err.message);
          // Continue with the next file so one bad dump does not block the rest.
        }
      }

      console.log(
        `[DataSync] Summary: ${synced} synced, ${skipped} skipped, ${failed} failed`
      );
    } finally {
      release();
    }
  }

  /**
   * Watches the data directory and triggers an incremental sync when a .sql
   * file is added or modified. Should be disabled in production.
   */
  watch() {
    if (this._watcher) return;

    console.log('[DataSync] Watching data directory for changes');
    this._watcher = watch(DATA_DIR, (eventType, filename) => {
      if (!filename || !filename.toLowerCase().endsWith('.sql')) return;

      if (this._debounceTimer) clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(() => {
        console.log(
          `[DataSync] Detected ${eventType} in ${filename}, syncing...`
        );
        this.sync().catch((err) => {
          console.error('[DataSync] Auto-sync failed:', err.message);
        });
      }, DEBOUNCE_MS);
    });
  }

  stopWatching() {
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    if (this._watcher) {
      this._watcher.close();
      this._watcher = null;
    }
  }

  async _ensureLogTable() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS _seed_log (
        file_name TEXT PRIMARY KEY,
        file_hash TEXT NOT NULL,
        synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  async _syncFile(file, sql, hash) {
    const { tables } = extractFileSchema(file, sql);
    if (tables.length === 0) {
      throw new Error(`No tables found in ${file}`);
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Recreate tables so updates start clean.
      for (const table of tables) {
        await client.query(createPostgresTableSql(table));
      }

      // Normalize the dump for PostgreSQL. First rename generic MOCK_DATA
      // tables to the filename, then convert MySQL/SQLite syntax, strip all
      // original DDL because we generated replacements above, and drop any
      // DELETE / TRUNCATE statements that target tables we did not create.
      const mockNormalized = normalizeMockDataTable(file, sql);
      const tableNames = tables.map((t) => t.name);
      const pgSql = stripDanglingDeleteStatements(
        normalizeSqlForPostgres(mockNormalized.sql)
          .replace(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?[^;]+;/gi, '')
          .replace(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[^;]+;/gi, '')
          .replace(/ALTER\s+TABLE\s+[^;]+;/gi, '')
          // Clean up leftover empty statements from stripped directives.
          .replace(/;\s*;+/g, ';')
          .trim(),
        tableNames
      );
      await client.query(pgSql);

      await client.query(
        `INSERT INTO _seed_log (file_name, file_hash, synced_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT (file_name)
         DO UPDATE SET file_hash = $2, synced_at = CURRENT_TIMESTAMP`,
        [file, hash]
      );

      await client.query('COMMIT');
      console.log(`[DataSync] Synced ${file} (${tables.length} tables)`);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  _hash(content) {
    return createHash('sha256').update(content).digest('hex');
  }

  _acquireLock() {
    let release;
    const newLock = new Promise((resolve) => {
      release = resolve;
    });
    const oldLock = this._lockPromise;
    this._lockPromise = oldLock.then(
      () => newLock,
      () => newLock
    );
    return oldLock.then(() => release);
  }
}

module.exports = { DataSync };
