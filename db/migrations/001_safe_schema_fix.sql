-- ══════════════════════════════════════════════════════════════════════
--  001_safe_schema_fix.sql
--  Idempotent schema patch — safe to run multiple times.
--  Uses INFORMATION_SCHEMA checks before every ALTER TABLE.
-- ══════════════════════════════════════════════════════════════════════

-- ── USERS: currency_code ──────────────────────────────────────────────
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'users'
  AND COLUMN_NAME  = 'currency_code';

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN currency_code VARCHAR(10) NOT NULL DEFAULT ''USD''',
  'SELECT ''users.currency_code already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── USERS: full_name — ensure default is set ──────────────────────────
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA   = DATABASE()
  AND TABLE_NAME     = 'users'
  AND COLUMN_NAME    = 'full_name'
  AND IS_NULLABLE    = 'NO'
  AND COLUMN_DEFAULT IS NULL;

SET @sql = IF(@col_exists > 0,
  'ALTER TABLE users MODIFY COLUMN full_name VARCHAR(150) NOT NULL DEFAULT ''''',
  'SELECT ''users.full_name default already set'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── EXPENSES: category_source ─────────────────────────────────────────
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'expenses'
  AND COLUMN_NAME  = 'category_source';

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE expenses ADD COLUMN category_source ENUM(''manual'',''auto'') NOT NULL DEFAULT ''manual''',
  'SELECT ''expenses.category_source already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── BUDGETS: limit_amount ─────────────────────────────────────────────
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'budgets'
  AND COLUMN_NAME  = 'limit_amount';

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE budgets ADD COLUMN limit_amount DECIMAL(10,2) NOT NULL DEFAULT 0',
  'SELECT ''budgets.limit_amount already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── BUDGETS: budget_month ─────────────────────────────────────────────
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'budgets'
  AND COLUMN_NAME  = 'budget_month';

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE budgets ADD COLUMN budget_month INT NOT NULL DEFAULT 1',
  'SELECT ''budgets.budget_month already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── BUDGETS: budget_year ──────────────────────────────────────────────
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'budgets'
  AND COLUMN_NAME  = 'budget_year';

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE budgets ADD COLUMN budget_year INT NOT NULL DEFAULT 2025',
  'SELECT ''budgets.budget_year already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── GOALS: description ────────────────────────────────────────────────
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'goals'
  AND COLUMN_NAME  = 'description';

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE goals ADD COLUMN description TEXT NULL',
  'SELECT ''goals.description already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── GOALS: saved_amount ─────────────────────────────────────────────
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'goals'
  AND COLUMN_NAME  = 'saved_amount';

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE goals ADD COLUMN saved_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00',
  'SELECT ''goals.saved_amount already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── GOALS: target_date ────────────────────────────────────────────────
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'goals'
  AND COLUMN_NAME  = 'target_date';

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE goals ADD COLUMN target_date DATE NOT NULL DEFAULT ''2025-12-31''',
  'SELECT ''goals.target_date already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── GOALS: priority ───────────────────────────────────────────────────
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'goals'
  AND COLUMN_NAME  = 'priority';

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE goals ADD COLUMN priority ENUM(''low'',''medium'',''high'') NOT NULL DEFAULT ''medium''',
  'SELECT ''goals.priority already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── GOALS: status ─────────────────────────────────────────────────────
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'goals'
  AND COLUMN_NAME  = 'status';

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE goals ADD COLUMN status ENUM(''active'',''paused'',''completed'',''cancelled'') NOT NULL DEFAULT ''active''',
  'SELECT ''goals.status already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── INSIGHTS: insight_type ────────────────────────────────────────────
-- Must be added BEFORE content since content has no AFTER anchor otherwise
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'insights'
  AND COLUMN_NAME  = 'insight_type';

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE insights ADD COLUMN insight_type VARCHAR(50) NOT NULL DEFAULT ''monthly_summary'' AFTER user_id',
  'SELECT ''insights.insight_type already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── INSIGHTS: content ─────────────────────────────────────────────────
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'insights'
  AND COLUMN_NAME  = 'content';

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE insights ADD COLUMN content TEXT NULL',
  'SELECT ''insights.content already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── INSIGHTS: metadata ────────────────────────────────────────────────
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'insights'
  AND COLUMN_NAME  = 'metadata';

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE insights ADD COLUMN metadata JSON NULL',
  'SELECT ''insights.metadata already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── INSIGHTS: is_read ─────────────────────────────────────────────────
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'insights'
  AND COLUMN_NAME  = 'is_read';

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE insights ADD COLUMN is_read TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT ''insights.is_read already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── INSIGHTS: generated_for_month ────────────────────────────────────
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'insights'
  AND COLUMN_NAME  = 'generated_for_month';

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE insights ADD COLUMN generated_for_month TINYINT UNSIGNED NULL',
  'SELECT ''insights.generated_for_month already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── INSIGHTS: generated_for_year ─────────────────────────────────────
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'insights'
  AND COLUMN_NAME  = 'generated_for_year';

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE insights ADD COLUMN generated_for_year SMALLINT UNSIGNED NULL',
  'SELECT ''insights.generated_for_year already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── Seed system categories (idempotent) ───────────────────────────────
INSERT IGNORE INTO categories (id, user_id, name, icon, color_hex, is_system) VALUES
(1, NULL, 'Food & Dining',  '🍔', '#F97316', 1),
(2, NULL, 'Transportation', '🚗', '#3B82F6', 1),
(3, NULL, 'Utilities',      '💡', '#EAB308', 1),
(4, NULL, 'Entertainment',  '🎬', '#A855F7', 1),
(5, NULL, 'Shopping',       '🛍️', '#EC4899', 1),
(6, NULL, 'Healthcare',     '🏥', '#EF4444', 1),
(7, NULL, 'Education',      '📚', '#22C55E', 1),
(8, NULL, 'Subscriptions',  '📱', '#6366F1', 1),
(9, NULL, 'Other',          '📌', '#6B7280', 1);

-- ── Fix orphaned expenses → Other ────────────────────────────────────
UPDATE expenses SET category_id = 9 WHERE category_id IS NULL;
