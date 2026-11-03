import { pool } from '../config/database.js';

async function resetDatabase() {
  await pool.query('DROP SCHEMA public CASCADE;');
  await pool.query('CREATE SCHEMA public;');
  await pool.query('GRANT ALL ON SCHEMA public TO postgres;');
  console.log('Database reset complete.');
}

resetDatabase().catch((error) => {
  console.error('Database reset failed:', error.message);
  process.exitCode = 1;
}).finally(() => {
  pool.end();
});
