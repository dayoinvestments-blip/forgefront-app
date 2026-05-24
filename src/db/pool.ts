import { Pool, PoolClient, QueryResult } from 'pg';

// ─── Connection Pool ──────────────────────────────────────────────────────────
// Railway provides DATABASE_URL automatically when you attach a Postgres service.
// For local dev, set DATABASE_URL in your .env file.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false } // Required for Railway/Supabase SSL
    : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

// ─── Query helper ─────────────────────────────────────────────────────────────
export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  try {
    const result = await pool.query<T>(text, params);
    if (process.env.NODE_ENV === 'development') {
      console.log(`[DB] ${text.slice(0, 60).replace(/\s+/g, ' ')} — ${Date.now() - start}ms`);
    }
    return result;
  } catch (err: any) {
    console.error('[DB] Query error:', err.message, '\nSQL:', text.slice(0, 200));
    throw err;
  }
}

// ─── Transaction helper ───────────────────────────────────────────────────────
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export { pool };
export default pool;
