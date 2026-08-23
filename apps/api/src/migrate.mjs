import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, transaction } from './db.mjs';
const migrationDir = resolve(dirname(fileURLToPath(import.meta.url)), '../migrations');
await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
const applied = new Set((await pool.query('SELECT version FROM schema_migrations')).rows.map((row) => row.version));
for (const file of (await readdir(migrationDir)).filter((name) => name.endsWith('.sql')).sort()) { if (applied.has(file)) continue; const sql = await readFile(resolve(migrationDir, file), 'utf8'); await transaction(async (client) => { await client.query(sql); await client.query('INSERT INTO schema_migrations(version) VALUES ($1)', [file]); }); console.log(`Applied migration ${file}`); }
await pool.end();
