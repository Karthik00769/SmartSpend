/**
 * lib/db.ts
 * MySQL connection pool using mysql2/promise.
 * Uses a singleton pattern to reuse the pool across hot reloads in Next.js dev mode.
 */
import mysql from 'mysql2/promise';

// Extend NodeJS global to cache the pool across HMR reloads
declare global {
  // eslint-disable-next-line no-var
  var _mysqlPool: mysql.Pool | undefined;
}

function createPool(): mysql.Pool {
  return mysql.createPool({
    host:     process.env.DB_HOST     || 'localhost',
    port:     Number(process.env.DB_PORT) || 3306,
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME     || 'smartspend',
    waitForConnections: true,
    connectionLimit:    10,
    queueLimit:         0,
    timezone:           '+00:00',
    // Return BigInt as strings so JSON.stringify doesn't throw
    supportBigNumbers:  true,
    bigNumberStrings:   true,
    // Aiven, TiDB, and other managed cloud MySQL require SSL.
    ssl: process.env.DB_SSL === 'true' || process.env.DB_HOST?.includes('tidbcloud') || process.env.DB_HOST?.includes('aiven') ? { minVersion: 'TLSv1.2', rejectUnauthorized: false } : undefined,
  });
}

// In development, reuse the pool to avoid "too many connections" on every save
const pool: mysql.Pool =
  process.env.NODE_ENV === 'production'
    ? createPool()
    : (global._mysqlPool ?? (global._mysqlPool = createPool()));

export default pool;

/**
 * Execute a parameterised query and return typed rows.
 * Usage:  const rows = await query<MyRow[]>('SELECT * FROM users WHERE id = ?', [id]);
 */
export async function query<T = unknown>(sql: string, params?: any[]): Promise<T> {
  const [rows] = await pool.execute(sql, params);
  return rows as T;
}

