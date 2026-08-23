import pg from 'pg';
import { attachDatabasePool } from '@vercel/functions';
const { Pool } = pg;
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const connectionString = process.env.DATABASE_SSL === 'false' ? process.env.DATABASE_URL : process.env.DATABASE_URL.replace(/([?&])sslmode=(prefer|require|verify-ca)(?=&|$)/, '$1sslmode=verify-full');
export const pool = new Pool({ connectionString, ssl: process.env.DATABASE_SSL === 'false' ? false : process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false, max: Number(process.env.DB_POOL_SIZE || (process.env.VERCEL ? 5 : 10)), connectionTimeoutMillis: 10000 });
if (process.env.VERCEL) attachDatabasePool(pool);
export const query = (text, params) => pool.query(text, params);
export const transaction = async (work) => { const client = await pool.connect(); try { await client.query('BEGIN'); const result = await work(client); await client.query('COMMIT'); return result; } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); } };
