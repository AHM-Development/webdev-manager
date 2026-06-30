#!/usr/bin/env node

var schema = require('../db/schema');
var db = require('../db/pool');
var redisStore = require('../lib/redis');

async function main() {
  await schema.ensureSchema();
  console.log('Database schema is ready on host:', db.getSelectedHost());

  try {
    await redisStore.getRedis();
    console.log('Redis connection is ready:', redisStore.getSelectedUrl());
  } catch (err) {
    console.warn('Redis connection check failed:', err.message);
  }
}

main()
  .then(function() {
    process.exit(0);
  })
  .catch(function(err) {
    console.error(err);
    process.exit(1);
  });
