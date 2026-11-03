import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationDir = path.join(__dirname, '../migrations');

async function runMigrations() {
  const files = fs.readdirSync(migrationDir).filter((file) => file.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationDir, file), 'utf8');
    await pool.query(sql);
    console.log(`Applied migration: ${file}`);
  }
  console.log('All migrations complete.');
}

runMigrations().catch((error) => {
  console.error('Migration failed:', error.message);
  process.exitCode = 1;
}).finally(() => {
  pool.end();
});
