const { Pool } = require('pg');
const { SqliteDataProvider } = require('./SqliteDataProvider');
const { NeonDataProvider } = require('./NeonDataProvider');
const dbConfig = require('../config/database');

function createProvider() {
  if (dbConfig.dataProvider === 'neon') {
    if (!dbConfig.databaseUrl) {
      throw new Error(
        'DATA_PROVIDER=neon requires DATABASE_URL to be set in the environment'
      );
    }

    // SSL configuration is taken from the DATABASE_URL (e.g. sslmode=require).
    const pool = new Pool({
      connectionString: dbConfig.databaseUrl,
      max: dbConfig.poolMax,
    });

    return { provider: new NeonDataProvider(pool), pool };
  }

  return { provider: new SqliteDataProvider(), pool: null };
}

module.exports = { createProvider };
