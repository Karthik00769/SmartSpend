-- ══════════════════════════════════════════════════════════════════════
--  SmartSpend — Patch Migration (NO DROP, NO RESET)
--  Run: mysql -u root -p smartspend < lib/db/migrate.sql
-- ══════════════════════════════════════════════════════════════════════

USE smartspend;

-- 1. Add currency_code to users if missing (schema uses currency_code)
ALTER TABLE users
  MODIFY COLUMN full_name VARCHAR(150) NOT NULL DEFAULT '';

-- Add currency_code if it doesn't exist
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'users'
    AND COLUMN_NAME  = 'currency_code'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN currency_code CHAR(3) NOT NULL DEFAULT ''USD'' AFTER avatar_url',
  'SELECT ''currency_code already exists'' AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. Add category_source to expenses if missing
SET @col2 = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'expenses'
    AND COLUMN_NAME  = 'category_source'
);
SET @sql2 = IF(@col2 = 0,
  'ALTER TABLE expenses ADD COLUMN category_source ENUM(''manual'',''auto'') NOT NULL DEFAULT ''manual'' AFTER description',
  'SELECT ''category_source already exists'' AS info'
);
PREPARE stmt2 FROM @sql2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;

-- 3. Ensure system categories exist (idempotent)
INSERT IGNORE INTO categories (id, user_id, name, icon, color_hex, is_system) VALUES
(1,  NULL, 'Food & Dining',  '🍔', '#F97316', 1),
(2,  NULL, 'Transportation', '🚗', '#3B82F6', 1),
(3,  NULL, 'Utilities',      '💡', '#EAB308', 1),
(4,  NULL, 'Entertainment',  '🎬', '#A855F7', 1),
(5,  NULL, 'Shopping',       '🛍️', '#EC4899', 1),
(6,  NULL, 'Healthcare',     '🏥', '#EF4444', 1),
(7,  NULL, 'Education',      '📚', '#22C55E', 1),
(8,  NULL, 'Subscriptions',  '📱', '#6366F1', 1),
(9,  NULL, 'Other',          '📌', '#6B7280', 1);

-- 4. Fix any existing expenses with NULL category_id → assign to 'Other' (id=9)
UPDATE expenses SET category_id = 9 WHERE category_id IS NULL;
