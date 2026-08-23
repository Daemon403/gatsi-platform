import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL_UNPOOLED or DATABASE_URL is required.');
const connectionString = process.env.DATABASE_SSL === 'false' ? databaseUrl : databaseUrl.replace(/([?&])sslmode=(prefer|require|verify-ca)(?=&|$)/, '$1sslmode=verify-full');
const pool = new Pool({ connectionString, ssl: process.env.DATABASE_SSL === 'false' ? false : process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false, max: 1, connectionTimeoutMillis: 10000 });
const transaction = async (work) => { const client = await pool.connect(); try { await client.query('BEGIN'); const result = await work(client); await client.query('COMMIT'); return result; } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); } };
const migrationDir = resolve(dirname(fileURLToPath(import.meta.url)), '../migrations');
try {
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const applied = new Set((await pool.query('SELECT version FROM schema_migrations')).rows.map((row) => row.version));
  for (const file of (await readdir(migrationDir)).filter((name) => name.endsWith('.sql')).sort()) { if (applied.has(file)) continue; const sql = await readFile(resolve(migrationDir, file), 'utf8'); await transaction(async (client) => { await client.query(sql); await client.query('INSERT INTO schema_migrations(version) VALUES ($1)', [file]); }); console.log(`Applied migration ${file}`); }
} finally {
  await pool.end();
}
