var mysql = require('mysql2/promise');
var env = require('../config/env');

var pool;
var selectedHost;

async function createPoolForHost(host) {
  var candidate = mysql.createPool({
    host: host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
    waitForConnections: true,
    connectionLimit: 10,
    namedPlaceholders: true,
    timezone: 'Z',
  });

  await candidate.query('SELECT 1');
  selectedHost = host;
  return candidate;
}

async function getPool() {
  if (pool) return pool;

  var lastError;
  for (var i = 0; i < env.db.hostCandidates.length; i += 1) {
    try {
      pool = await createPoolForHost(env.db.hostCandidates[i]);
      return pool;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError;
}

async function query(sql, params) {
  var db = await getPool();
  var result = await db.execute(sql, params || {});
  return result[0];
}

function getSelectedHost() {
  return selectedHost;
}

module.exports = {
  getPool: getPool,
  query: query,
  getSelectedHost: getSelectedHost,
};
