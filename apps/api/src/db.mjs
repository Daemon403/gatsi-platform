import pg from 'pg';
const { Pool } = pg;
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
export const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false, max: Number(process.env.DB_POOL_SIZE || 10), connectionTimeoutMillis: 10000 });
export const query = (text, params) => pool.query(text, params);
export const transaction = async (work) => { const client = await pool.connect(); try { await client.query('BEGIN'); const result = await work(client); await client.query('COMMIT'); return result; } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); } };
