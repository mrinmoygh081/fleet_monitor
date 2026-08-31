const { Pool } = require('pg');
const { DATABASE_URL } = require('./env');

const pool = new Pool({ connectionString: DATABASE_URL });

pool.on('error', (err) => {
  console.error('[pg pool] Unexpected error on idle client:', err.message);
});

module.exports = pool;
