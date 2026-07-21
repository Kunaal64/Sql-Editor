const path = require('path');

// Load .env from backend/ regardless of where the process was started.
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const DEFAULTS = {
  DATA_PROVIDER: 'sqlite',
  NEON_SYNC_ON_START: 'true',
  NEON_WATCH_DATA_DIR: 'true',
  NEON_FORCE_RESEED: 'false',
  NEON_POOL_MAX: '5',
};

function getEnv(key) {
  return process.env[key] ?? DEFAULTS[key];
}

function isEnabled(key) {
  const value = getEnv(key);
  return value === '1' || value?.toLowerCase() === 'true';
}

function isProduction() {
  return process.env.NODE_ENV?.toLowerCase() === 'production';
}

module.exports = {
  dataProvider: getEnv('DATA_PROVIDER').toLowerCase(),
  databaseUrl: process.env.DATABASE_URL,
  syncOnStart: isEnabled('NEON_SYNC_ON_START'),
  watchDataDir: isEnabled('NEON_WATCH_DATA_DIR'),
  forceReseed: isEnabled('NEON_FORCE_RESEED'),
  poolMax: Math.max(1, parseInt(getEnv('NEON_POOL_MAX'), 10) || 5),
  isProduction,
};
