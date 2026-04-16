/**
 * scripts/run-migrations.ts
 *
 * Production-grade migration runner.
 * - Reads all .sql files from db/migrations/ in sorted order
 * - Tracks applied migrations in _migrations table
 * - Skips already-applied files (idempotent)
 * - Executes each file as a single multi-statement query
 * - Logs every step with timestamps
 *
 * Usage:
 *   npm run migrate
 *   npx ts-node --project tsconfig.scripts.json scripts/run-migrations.ts
 */

import fs   from 'fs';
import path from 'path';
import mysql, { RowDataPacket } from 'mysql2/promise';

// ── Env loader ────────────────────────────────────────────────────────────────

function loadEnv(file = '.env.local') {
  const p = path.resolve(process.cwd(), file);
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    const val = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !process.env[key]) process.env[key] = val;
  }
}

loadEnv();

// ── DB config ─────────────────────────────────────────────────────────────────

const DB: mysql.ConnectionOptions = {
  host:               process.env.DB_HOST     ?? 'localhost',
  port:               Number(process.env.DB_PORT ?? 3306),
  user:               process.env.DB_USER     ?? 'root',
  password:           process.env.DB_PASSWORD ?? '',
  database:           process.env.DB_NAME     ?? 'smartspend',
  multipleStatements: true,
  supportBigNumbers:  true,
  bigNumberStrings:   true,
  timezone:           '+00:00',
  ssl:                process.env.DB_HOST?.includes('tidb') ? { minVersion: 'TLSv1.2' } : undefined,
};

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'db', 'migrations');

// ── Logger ────────────────────────────────────────────────────────────────────

const ts  = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = (msg: string) => console.log(`${ts()} [migrate]  ${msg}`);
const ok  = (msg: string) => console.log(`${ts()} [migrate] ✓ ${msg}`);
const err = (msg: string) => console.error(`${ts()} [migrate] ✗ ${msg}`);

// ── Tracking table ────────────────────────────────────────────────────────────

async function ensureTrackingTable(conn: mysql.Connection): Promise<void> {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
      filename    VARCHAR(255)  NOT NULL,
      checksum    CHAR(64)      NULL COMMENT 'SHA-256 of file contents',
      executed_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_migration_filename (filename)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function isApplied(conn: mysql.Connection, filename: string): Promise<boolean> {
  const [rows] = await conn.execute<RowDataPacket[]>(
    'SELECT id FROM _migrations WHERE filename = ? LIMIT 1',
    [filename],
  );
  return (rows as RowDataPacket[]).length > 0;
}

async function markApplied(conn: mysql.Connection, filename: string): Promise<void> {
  await conn.execute(
    'INSERT IGNORE INTO _migrations (filename) VALUES (?)',
    [filename],
  );
}

// ── Execute one migration file ────────────────────────────────────────────────

async function runFile(
  conn:     mysql.Connection,
  filepath: string,
  filename: string,
): Promise<void> {
  const sql = fs.readFileSync(filepath, 'utf8');

  if (!sql.trim()) {
    log(`Skip empty file: ${filename}`);
    return;
  }

  try {
    // Execute the whole file — multipleStatements:true handles PREPARE/EXECUTE blocks
    await conn.query(sql);
    await markApplied(conn, filename);
    ok(`Applied: ${filename}`);
  } catch (e: any) {
    err(`Failed: ${filename}`);
    err(`  → ${e.message}`);
    throw e;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log(`Connecting → ${DB.host}:${DB.port}/${DB.database}`);

  let conn: mysql.Connection;
  try {
    conn = await mysql.createConnection(DB);
    log('Connected.');
  } catch (e: any) {
    err(`DB connection failed: ${e.message}`);
    process.exit(1);
  }

  try {
    await ensureTrackingTable(conn);
    log('Tracking table ready (_migrations).');

    if (!fs.existsSync(MIGRATIONS_DIR)) {
      err(`Migrations directory not found: ${MIGRATIONS_DIR}`);
      process.exit(1);
    }

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();                          // 001_ before 002_ etc.

    if (files.length === 0) {
      log('No .sql files found in migrations directory.');
      return;
    }

    log(`Found ${files.length} migration file(s).`);

    let applied = 0;
    let skipped = 0;
    let failed  = 0;

    for (const filename of files) {
      const filepath = path.join(MIGRATIONS_DIR, filename);

      if (await isApplied(conn, filename)) {
        log(`Skip (already applied): ${filename}`);
        skipped++;
        continue;
      }

      try {
        await runFile(conn, filepath, filename);
        applied++;
      } catch {
        failed++;
        // Continue to next migration rather than aborting the whole run
        // so partial fixes still land
      }
    }

    log('─'.repeat(50));
    log(`Done.  Applied: ${applied}  Skipped: ${skipped}  Failed: ${failed}`);

    if (failed > 0) {
      err(`${failed} migration(s) failed — check errors above.`);
      process.exit(1);
    }
  } finally {
    await conn.end();
    log('Connection closed.');
  }
}

main().catch(e => {
  err(e.message);
  process.exit(1);
});
