import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

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
  console.log('☁️ Re-syncing exact schema to TiDB Cloud Database...');
  const cloud = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 4000),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: false }
  });

  await cloud.query('SET FOREIGN_KEY_CHECKS=0');

  const droptables = [
    'DROP TABLE IF EXISTS audit_logs',
    'DROP TABLE IF EXISTS budgets',
    'DROP TABLE IF EXISTS goals',
    'DROP TABLE IF EXISTS expenses',
    'DROP TABLE IF EXISTS insights',
    'DROP TABLE IF EXISTS categories',
    'DROP TABLE IF EXISTS users',
    'DROP TABLE IF EXISTS _migrations'
  ];

  for (const drop of droptables) await cloud.query(drop);

  const ddl = `
CREATE TABLE users (
  id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
  oauth_id varchar(255) NULL UNIQUE,
  email varchar(255) NOT NULL UNIQUE,
  full_name varchar(150) NOT NULL,
  password_hash varchar(255) NULL,
  two_factor_pin varchar(6) NULL,
  avatar_url varchar(500) NULL,
  currency_code char(3) NOT NULL DEFAULT 'USD',
  timezone varchar(50) NOT NULL DEFAULT 'Asia/Kolkata',
  preferences json NOT NULL DEFAULT (json_object()),
  monthly_income decimal(12,2) NOT NULL DEFAULT 0.00,
  plan enum('free','pro','enterprise') NOT NULL DEFAULT 'free',
  is_active tinyint(1) NOT NULL DEFAULT 1,
  session_version int unsigned NOT NULL DEFAULT 1,
  deleted_at datetime NULL,
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE categories (
  id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id bigint unsigned NULL,
  name varchar(100) NOT NULL,
  icon varchar(10) NOT NULL DEFAULT '📌',
  color_hex char(7) NOT NULL DEFAULT '#6B7280',
  is_system tinyint(1) NOT NULL DEFAULT 0,
  deleted_at datetime NULL,
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cat_name (name)
);

CREATE TABLE expenses (
  id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id bigint unsigned NOT NULL,
  category_id bigint unsigned NULL,
  category_source enum('manual','auto') NULL DEFAULT 'manual',
  is_recurring tinyint(1) NULL DEFAULT 0,
  recur_frequency enum('monthly','yearly') NULL DEFAULT 'monthly',
  next_recur_date date NULL,
  amount decimal(12,2) NOT NULL,
  expense_date date NOT NULL,
  description varchar(500) NOT NULL,
  currency_code varchar(10) NOT NULL DEFAULT 'INR',
  payment_method varchar(50) NULL,
  source enum('manual','receipt_scan','bank_import') NOT NULL DEFAULT 'manual',
  deleted_at datetime NULL,
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE budgets (
  id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id bigint unsigned NOT NULL,
  category_id bigint unsigned NULL,
  amount decimal(12,2) NOT NULL DEFAULT 0.00,
  limit_amount decimal(10,2) NOT NULL DEFAULT 0.00,
  month int NOT NULL,
  year int NOT NULL,
  deleted_at datetime NULL,
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE goals (
  id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id bigint unsigned NOT NULL,
  title varchar(150) NOT NULL,
  description text NULL,
  target_amount decimal(12,2) NOT NULL,
  target_date date NOT NULL DEFAULT '2025-12-31',
  saved_amount decimal(12,2) NOT NULL DEFAULT 0.00,
  deadline date NULL,
  type enum('short','long') NULL DEFAULT 'short',
  status enum('active','paused','completed','cancelled') NOT NULL DEFAULT 'active',
  goal_type enum('short_term','long_term') NOT NULL DEFAULT 'short_term',
  priority enum('low','medium','high') NOT NULL DEFAULT 'medium',
  deleted_at datetime NULL,
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE insights (
  id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id bigint unsigned NOT NULL,
  insight_type varchar(50) NOT NULL DEFAULT 'monthly_summary',
  content text NOT NULL,
  metadata json NULL,
  is_read tinyint(1) NOT NULL DEFAULT 0,
  generated_for_month int NOT NULL,
  generated_for_year int NOT NULL,
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE audit_logs (
  id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id bigint unsigned NOT NULL,
  action varchar(50) NOT NULL,
  entity_type varchar(50) NOT NULL,
  entity_id varchar(255) NULL,
  metadata json NULL,
  hash char(64) NOT NULL,
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
);
  `;

  for (const part of ddl.split(';')) {
    if (part.trim().length > 0) {
      await cloud.query(part);
    }
  }

  await cloud.query(`INSERT IGNORE INTO categories (id, user_id, name, icon, color_hex, is_system) VALUES
    (1,  NULL, 'Food & Drinks',  '🍕', '#F97316', 1),
    (2,  NULL, 'Travel & Commute', '🚗', '#3B82F6', 1),
    (3,  NULL, 'Home & Living',      '💡', '#EAB308', 1),
    (4,  NULL, 'Entertainment',  '🎬', '#A855F7', 1),
    (5,  NULL, 'Shopping & Retail',       '🛍️', '#EC4899', 1),
    (6,  NULL, 'Health & Wellness',     '🏥', '#EF4444', 1),
    (7,  NULL, 'Education',      '📚', '#22C55E', 1),
    (8,  NULL, 'Subscriptions',  '📱', '#6366F1', 1),
    (9,  NULL, 'Work & Business',          '📌', '#6B7280', 1),
    (10, NULL, 'Others', '📝', '#9CA3AF', 1)`);

  await cloud.query('SET FOREIGN_KEY_CHECKS=1');
  console.log('🚀 Final schema synced properly!');
  process.exit(0);
}

main().catch(console.error);
