import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';

function loadEnv() {
  const p = path.resolve(process.cwd(), '.env.local');
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

async function main() {
  console.log('🔍 Connecting to local database to read schema...');
  const local = await mysql.createConnection({ host: 'localhost', user: 'root', password: '', database: 'smartspend' });
  
  console.log('☁️ Connecting to TiDB Cloud Database...');
  const cloud = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 4000),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: false }
  });

  const [tables] = await local.query('SHOW TABLES');
  await cloud.query('SET FOREIGN_KEY_CHECKS=0');
  
  for (const row of (tables as any[])) {
    const tableName = Object.values(row)[0] as string;
    const [createTableRows] = await local.query(`SHOW CREATE TABLE \`${tableName}\``) as any;
    let ddl = createTableRows[0]['Create Table'];
    
    await cloud.query(`DROP TABLE IF EXISTS \`${tableName}\``);
    await cloud.query(ddl);
    console.log(`[+] Dropped and Cloned table: ${tableName}`);
  }
  
  console.log('🌱 Seeding system categories...');
  await cloud.query(`INSERT IGNORE INTO categories (id, user_id, name, icon, color_hex, is_system) VALUES
    (1,  NULL, 'Food & Dining',  '🍔', '#F97316', 1),
    (2,  NULL, 'Transportation', '🚗', '#3B82F6', 1),
    (3,  NULL, 'Utilities',      '💡', '#EAB308', 1),
    (4,  NULL, 'Entertainment',  '🎬', '#A855F7', 1),
    (5,  NULL, 'Shopping',       '🛍️', '#EC4899', 1),
    (6,  NULL, 'Healthcare',     '🏥', '#EF4444', 1),
    (7,  NULL, 'Education',      '📚', '#22C55E', 1),
    (8,  NULL, 'Subscriptions',  '📱', '#6366F1', 1),
    (9,  NULL, 'Other',          '📌', '#6B7280', 1);`);

  await cloud.query('SET FOREIGN_KEY_CHECKS=1');
  console.log('🚀 Successfully copied full production database schema to TiDB Cloud!');
  process.exit(0);
}

main().catch(e => {
  console.error("❌ clone failed: ", e.message);
  process.exit(1);
});
