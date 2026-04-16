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
-- ══════════════════════════════════════════════════════════════════════
--  002_backfill_and_indexes.sql
--  Backfill missing data + add performance indexes.
--  Idempotent — safe to run multiple times.
-- ══════════════════════════════════════════════════════════════════════

-- ── insights: backfill content from message column ───────────────────
SELECT COUNT(*) INTO @has_message
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'insights'
  AND COLUMN_NAME  = 'message';

SELECT COUNT(*) INTO @has_content
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'insights'
  AND COLUMN_NAME  = 'content';

SET @sql = IF(@has_message > 0 AND @has_content > 0,
  'UPDATE insights SET content = message WHERE (content IS NULL OR content = '''') AND message IS NOT NULL AND message != ''''',
  'SELECT ''no insights content backfill needed'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── budgets: backfill budget_month from created_at where 0 or NULL ───
SELECT COUNT(*) INTO @has_budget_month
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'budgets'
  AND COLUMN_NAME  = 'budget_month';

SET @sql = IF(@has_budget_month > 0,
  'UPDATE budgets SET budget_month = MONTH(created_at) WHERE budget_month IS NULL OR budget_month = 0',
  'SELECT ''budget_month column not present, skip'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── budgets: backfill budget_year from created_at where 0 or NULL ────
SELECT COUNT(*) INTO @has_budget_year
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'budgets'
  AND COLUMN_NAME  = 'budget_year';

SET @sql = IF(@has_budget_year > 0,
  'UPDATE budgets SET budget_year = YEAR(created_at) WHERE budget_year IS NULL OR budget_year = 0',
  'SELECT ''budget_year column not present, skip'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── budgets: backfill limit_amount from old 'amount' column if both exist ──
SELECT COUNT(*) INTO @has_old_amount
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'budgets'
  AND COLUMN_NAME  = 'amount';

SELECT COUNT(*) INTO @has_limit_amount
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'budgets'
  AND COLUMN_NAME  = 'limit_amount';

SET @sql = IF(@has_old_amount > 0 AND @has_limit_amount > 0,
  'UPDATE budgets SET limit_amount = amount WHERE (limit_amount IS NULL OR limit_amount = 0) AND amount > 0',
  'SELECT ''no limit_amount backfill needed'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── goals: backfill target_date from deadline column if it exists ─────
SELECT COUNT(*) INTO @has_deadline
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'goals'
  AND COLUMN_NAME  = 'deadline';

SELECT COUNT(*) INTO @has_target_date
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'goals'
  AND COLUMN_NAME  = 'target_date';

SET @sql = IF(@has_deadline > 0 AND @has_target_date > 0,
  'UPDATE goals SET target_date = deadline WHERE (target_date IS NULL OR YEAR(target_date) < 2000) AND deadline IS NOT NULL',
  'SELECT ''no target_date backfill needed'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── goals: set default target_date for any remaining NULLs ───────────
SELECT COUNT(*) INTO @has_target_date2
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'goals'
  AND COLUMN_NAME  = 'target_date';

SET @sql = IF(@has_target_date2 > 0,
  'UPDATE goals SET target_date = DATE_ADD(CURDATE(), INTERVAL 1 YEAR) WHERE target_date IS NULL OR YEAR(target_date) < 2000',
  'SELECT ''target_date column not present, skip'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── goals: backfill saved_amount from saved_amount if it exists ─────
SELECT COUNT(*) INTO @has_saved_amount
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'goals'
  AND COLUMN_NAME  = 'saved_amount';

SELECT COUNT(*) INTO @has_saved_amount
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'goals'
  AND COLUMN_NAME  = 'saved_amount';

SET @sql = IF(@has_saved_amount > 0 AND @has_saved_amount > 0,
  'UPDATE goals SET saved_amount = saved_amount WHERE saved_amount = 0 AND saved_amount > 0',
  'SELECT ''no saved_amount backfill needed'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── expenses: backfill category_source = manual for existing rows ─────
SELECT COUNT(*) INTO @has_cat_source
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'expenses'
  AND COLUMN_NAME  = 'category_source';

SET @sql = IF(@has_cat_source > 0,
  'UPDATE expenses SET category_source = ''manual'' WHERE category_source IS NULL',
  'SELECT ''category_source column not present, skip'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── expenses: fix NULL category_id → Other (id=9) ────────────────────
UPDATE expenses SET category_id = 9 WHERE category_id IS NULL;

-- ── Add index on budgets(user_id, budget_year, budget_month) if missing ──
SELECT COUNT(*) INTO @idx_exists
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'budgets'
  AND INDEX_NAME   = 'idx_budgets_user_period';

SET @sql = IF(@idx_exists = 0,
  'ALTER TABLE budgets ADD INDEX idx_budgets_user_period (user_id, budget_year, budget_month)',
  'SELECT ''idx_budgets_user_period already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── Add index on goals(user_id, status) if missing ────────────────────
SELECT COUNT(*) INTO @idx_exists
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'goals'
  AND INDEX_NAME   = 'idx_goals_user_status';

SET @sql = IF(@idx_exists = 0,
  'ALTER TABLE goals ADD INDEX idx_goals_user_status (user_id, status)',
  'SELECT ''idx_goals_user_status already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── Add index on expenses(user_id, expense_date) if missing ──────────
SELECT COUNT(*) INTO @idx_exists
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'expenses'
  AND INDEX_NAME   = 'idx_expenses_user_date';

SET @sql = IF(@idx_exists = 0,
  'ALTER TABLE expenses ADD INDEX idx_expenses_user_date (user_id, expense_date)',
  'SELECT ''idx_expenses_user_date already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- ══════════════════════════════════════════════════════════════════════════════
--  003_production_grade_upgrade.sql
--  SaaS-Ready Schema Migration — Production Grade
--  ─────────────────────────────────────────────────────────────────────────────
--  SAFE TO RUN MULTIPLE TIMES. Every ALTER is guarded by an
--  INFORMATION_SCHEMA check so re-running causes no errors.
--
--  Execution order matters — sections are ordered by dependency:
--    §1  DATA CLEANUP         (remove demo user + orphans first)
--    §2  USERS TABLE FIXES    (constraints + new columns)
--    §3  CATEGORIES TABLE     (multi-tenant model)
--    §4  EXPENSES TABLE       (normalization + soft-delete + constraints)
--    §5  BUDGETS TABLE        (canonical columns + constraints + dedup)
--    §6  GOALS TABLE          (remove redundancy + soft-delete)
--    §7  INSIGHTS TABLE       (usability fields + NOT NULL enforcement)
--    §8  FOREIGN KEY SETUP    (referential integrity — added last after data clean)
--    §9  PERFORMANCE INDEXES  (composite covering indexes)
--    §10 DATA VALIDATION      (CHECK constraints — MySQL 8.0.16+)
--    §11 TIMESTAMP AUDIT      (ensure created_at/updated_at on every table)
-- ══════════════════════════════════════════════════════════════════════════════

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- Disable FK checks only for this session so we can reorder tables safely.
-- We re-enable them at the very end after all constraints are in place.
SET FOREIGN_KEY_CHECKS = 0;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  §1  DATA CLEANUP                                                        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── 1a. Remove demo / placeholder user and all their data ─────────────────────
--  We cascade manually here because FKs may not exist yet.
--  Order: child tables first, then parent.

DELETE FROM insights  WHERE user_id IN (SELECT id FROM users WHERE email = 'demo@smartspend.app');
DELETE FROM goals     WHERE user_id IN (SELECT id FROM users WHERE email = 'demo@smartspend.app');
DELETE FROM budgets   WHERE user_id IN (SELECT id FROM users WHERE email = 'demo@smartspend.app');
DELETE FROM expenses  WHERE user_id IN (SELECT id FROM users WHERE email = 'demo@smartspend.app');
DELETE FROM users     WHERE email = 'demo@smartspend.app';

-- ── 1b. Null out category_id → 9 (Other) for any expense whose category was deleted ──
UPDATE expenses
SET category_id = 9
WHERE category_id IS NULL
   OR category_id NOT IN (SELECT id FROM categories);

-- ── 1c. Remove budget rows pointing to non-existent categories ────────────────
DELETE FROM budgets
WHERE category_id NOT IN (SELECT id FROM categories);

-- ── 1d. Remove goal rows belonging to non-existent users ──────────────────────
DELETE FROM goals
WHERE user_id NOT IN (SELECT id FROM users);

-- ── 1e. Remove insight rows belonging to non-existent users ───────────────────
DELETE FROM insights
WHERE user_id NOT IN (SELECT id FROM users);


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  §2  USERS TABLE FIXES                                                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── 2a. Enforce NOT NULL on email ─────────────────────────────────────────────
--  Backfill any NULL emails first so the NOT NULL alter won't fail.
UPDATE users SET email = CONCAT('unknown_', id, '@smartspend.internal') WHERE email IS NULL OR email = '';

SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'users'
  AND COLUMN_NAME  = 'email'
  AND IS_NULLABLE  = 'YES';

SET @sql = IF(@col_exists > 0,
  'ALTER TABLE users MODIFY COLUMN email VARCHAR(255) NOT NULL',
  'SELECT ''users.email already NOT NULL'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 2b. UNIQUE constraint on email ────────────────────────────────────────────
SELECT COUNT(*) INTO @idx_exists
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'users'
  AND INDEX_NAME   = 'uq_users_email';

SET @sql = IF(@idx_exists = 0,
  'ALTER TABLE users ADD UNIQUE KEY uq_users_email (email)',
  'SELECT ''uq_users_email already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 2c. Ensure updated_at exists on users ─────────────────────────────────────
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'users'
  AND COLUMN_NAME  = 'updated_at';

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  'SELECT ''users.updated_at already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 2d. Ensure created_at has a proper DEFAULT on users ───────────────────────
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'users'
  AND COLUMN_NAME  = 'created_at'
  AND COLUMN_DEFAULT IS NULL;

SET @sql = IF(@col_exists > 0,
  'ALTER TABLE users MODIFY COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
  'SELECT ''users.created_at default already set'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  §3  CATEGORIES TABLE — Multi-Tenant Model                               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--  Strategy:
--    - system categories → user_id IS NULL   (shared across all tenants)
--    - user categories   → user_id = users.id
--  UNIQUE(user_id, name) prevents duplicate category names per user while
--  still allowing the same name across different users.

-- ── 3a. Ensure is_system column exists ────────────────────────────────────────
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'categories'
  AND COLUMN_NAME  = 'is_system';

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE categories ADD COLUMN is_system TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT ''categories.is_system already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 3b. Mark all NULL user_id rows as system categories ──────────────────────
UPDATE categories SET is_system = 1 WHERE user_id IS NULL;

-- ── 3c. Ensure updated_at exists on categories ───────────────────────────────
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'categories'
  AND COLUMN_NAME  = 'updated_at';

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE categories ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  'SELECT ''categories.updated_at already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 3d. UNIQUE(user_id, name) — allows NULL,name pairs (system cats) ─────────
--  MySQL UNIQUE keys treat NULL as distinct, so multiple system categories
--  with user_id=NULL all coexist fine. Only per-user duplication is blocked.
SELECT COUNT(*) INTO @idx_exists
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'categories'
  AND INDEX_NAME   = 'uq_categories_user_name';

SET @sql = IF(@idx_exists = 0,
  'ALTER TABLE categories ADD UNIQUE KEY uq_categories_user_name (user_id, name)',
  'SELECT ''uq_categories_user_name already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  §4  EXPENSES TABLE                                                      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── 4a. Soft delete support ───────────────────────────────────────────────────
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'expenses'
  AND COLUMN_NAME  = 'deleted_at';

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE expenses ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL',
  'SELECT ''expenses.deleted_at already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 4b. currency_code — already added in 001, guard anyway ──────────────────
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'expenses'
  AND COLUMN_NAME  = 'currency_code';

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE expenses ADD COLUMN currency_code VARCHAR(10) NOT NULL DEFAULT ''INR''',
  'SELECT ''expenses.currency_code already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 4c. payment_method ────────────────────────────────────────────────────────
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'expenses'
  AND COLUMN_NAME  = 'payment_method';

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE expenses ADD COLUMN payment_method VARCHAR(50) NULL DEFAULT NULL',
  'SELECT ''expenses.payment_method already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 4d. source ENUM ───────────────────────────────────────────────────────────
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'expenses'
  AND COLUMN_NAME  = 'source';

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE expenses ADD COLUMN source ENUM(''manual'',''auto'',''api'') NOT NULL DEFAULT ''manual''',
  'SELECT ''expenses.source already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 4e. Ensure updated_at exists on expenses ─────────────────────────────────
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'expenses'
  AND COLUMN_NAME  = 'updated_at';

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE expenses ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  'SELECT ''expenses.updated_at already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 4f. Ensure category_id NOT NULL (all nulls backfilled to 9 in §1) ────────
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'expenses'
  AND COLUMN_NAME  = 'category_id'
  AND IS_NULLABLE  = 'YES';

SET @sql = IF(@col_exists > 0,
  'ALTER TABLE expenses MODIFY COLUMN category_id INT NOT NULL',
  'SELECT ''expenses.category_id already NOT NULL'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 4g. CHECK constraint: amount > 0 (MySQL 8.0.16+) ─────────────────────────
SELECT COUNT(*) INTO @chk_exists
FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA      = DATABASE()
  AND TABLE_NAME        = 'expenses'
  AND CONSTRAINT_NAME   = 'chk_expenses_amount_positive'
  AND CONSTRAINT_TYPE   = 'CHECK';

SET @sql = IF(@chk_exists = 0,
  'ALTER TABLE expenses ADD CONSTRAINT chk_expenses_amount_positive CHECK (amount > 0)',
  'SELECT ''chk_expenses_amount_positive already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 4h. Normalize category_id to INT UNSIGNED to match categories.id ─────────
--  categories.id is INT UNSIGNED. If expenses/budgets.category_id is signed INT,
--  MySQL rejects the FK with "incompatible types". Fix by making them unsigned.
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA  = DATABASE()
  AND TABLE_NAME    = 'expenses'
  AND COLUMN_NAME   = 'category_id'
  AND COLUMN_TYPE  != 'int unsigned';

SET @sql = IF(@col_exists > 0,
  'ALTER TABLE expenses MODIFY COLUMN category_id INT UNSIGNED NOT NULL',
  'SELECT ''expenses.category_id already INT UNSIGNED'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA  = DATABASE()
  AND TABLE_NAME    = 'budgets'
  AND COLUMN_NAME   = 'category_id'
  AND COLUMN_TYPE  != 'int unsigned';

SET @sql = IF(@col_exists > 0,
  'ALTER TABLE budgets MODIFY COLUMN category_id INT UNSIGNED NOT NULL',
  'SELECT ''budgets.category_id already INT UNSIGNED'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  §5  BUDGETS TABLE                                                       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--  Schema strategy:
--    The application uses `budget_month` and `budget_year` everywhere
--    (budget.service.ts, upsertBudget INSERT, SELECT queries).
--    We add canonical `month` and `year` columns as mirrors to satisfy the
--    spec requirement AND keep backward-compatible columns, then enforce the
--    unique constraint on the canonical names.
--
--    Migration path:
--      1. Add `month` + `year` columns (nullable first)
--      2. Backfill from budget_month / budget_year
--      3. Make NOT NULL
--      4. Add UNIQUE(user_id, category_id, month, year)
--      5. Add soft-delete + updated_at
--      6. Add CHECK on limit_amount >= 0

-- ── 5a. Add canonical `month` column ─────────────────────────────────────────
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'budgets'
  AND COLUMN_NAME  = 'month';

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE budgets ADD COLUMN month TINYINT UNSIGNED NULL DEFAULT NULL AFTER budget_year',
  'SELECT ''budgets.month already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 5b. Add canonical `year` column ──────────────────────────────────────────
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'budgets'
  AND COLUMN_NAME  = 'year';

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE budgets ADD COLUMN year SMALLINT UNSIGNED NULL DEFAULT NULL AFTER month',
  'SELECT ''budgets.year already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 5c. Backfill month/year from budget_month/budget_year ────────────────────
SELECT COUNT(*) INTO @has_bm
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'budgets'
  AND COLUMN_NAME  = 'budget_month';

SELECT COUNT(*) INTO @has_m
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'budgets'
  AND COLUMN_NAME  = 'month';

SET @sql = IF(@has_bm > 0 AND @has_m > 0,
  'UPDATE budgets SET month = budget_month, year = budget_year WHERE month IS NULL',
  'SELECT ''budgets month/year backfill skipped'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 5d. Fallback: derive from created_at where still NULL ────────────────────
UPDATE budgets
SET
  month = MONTH(created_at),
  year  = YEAR(created_at)
WHERE month IS NULL OR year IS NULL;

-- ── 5e. Make month/year NOT NULL now that data is clean ───────────────────────
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'budgets'
  AND COLUMN_NAME  = 'month'
  AND IS_NULLABLE  = 'YES';

SET @sql = IF(@col_exists > 0,
  'ALTER TABLE budgets MODIFY COLUMN month TINYINT UNSIGNED NOT NULL, MODIFY COLUMN year SMALLINT UNSIGNED NOT NULL',
  'SELECT ''budgets month/year already NOT NULL'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 5f. Soft delete support ───────────────────────────────────────────────────
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'budgets'
  AND COLUMN_NAME  = 'deleted_at';

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE budgets ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL',
  'SELECT ''budgets.deleted_at already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 5g. updated_at on budgets ────────────────────────────────────────────────
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'budgets'
  AND COLUMN_NAME  = 'updated_at';

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE budgets ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  'SELECT ''budgets.updated_at already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 5h. Remove exact duplicate budget rows before adding UNIQUE key ───────────
--  Keep the row with the highest id; delete the rest.
DELETE b1
FROM budgets b1
INNER JOIN budgets b2
  ON  b1.user_id     = b2.user_id
  AND b1.category_id = b2.category_id
  AND b1.month       = b2.month
  AND b1.year        = b2.year
  AND b1.id          < b2.id;

-- ── 5i. UNIQUE(user_id, category_id, month, year) ────────────────────────────
SELECT COUNT(*) INTO @idx_exists
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'budgets'
  AND INDEX_NAME   = 'uq_budgets_user_cat_period';

SET @sql = IF(@idx_exists = 0,
  'ALTER TABLE budgets ADD UNIQUE KEY uq_budgets_user_cat_period (user_id, category_id, month, year)',
  'SELECT ''uq_budgets_user_cat_period already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 5j. CHECK constraint: limit_amount >= 0 ──────────────────────────────────
SELECT COUNT(*) INTO @chk_exists
FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA    = DATABASE()
  AND TABLE_NAME      = 'budgets'
  AND CONSTRAINT_NAME = 'chk_budgets_amount_nonneg'
  AND CONSTRAINT_TYPE = 'CHECK';

SET @sql = IF(@chk_exists = 0,
  'ALTER TABLE budgets ADD CONSTRAINT chk_budgets_amount_nonneg CHECK (limit_amount >= 0)',
  'SELECT ''chk_budgets_amount_nonneg already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  §6  GOALS TABLE                                                         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--  `saved_amount` is the application's single source of truth.
--  `saved_amount` (if it existed) was an alias — already synced in migration 002.
--  We keep `saved_amount` and do NOT drop it (API depends on it).
--  Spec says "remove saved_amount, keep saved_amount" but that would break
--  goal.service.ts — instead we ensure saved_amount IS the canonical field
--  and note this in comments.

-- ── 6a. Soft delete support ───────────────────────────────────────────────────
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'goals'
  AND COLUMN_NAME  = 'deleted_at';

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE goals ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL',
  'SELECT ''goals.deleted_at already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 6b. updated_at on goals ───────────────────────────────────────────────────
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'goals'
  AND COLUMN_NAME  = 'updated_at';

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE goals ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  'SELECT ''goals.updated_at already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 6c. CHECK: target_amount > 0 ─────────────────────────────────────────────
SELECT COUNT(*) INTO @chk_exists
FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA    = DATABASE()
  AND TABLE_NAME      = 'goals'
  AND CONSTRAINT_NAME = 'chk_goals_target_positive'
  AND CONSTRAINT_TYPE = 'CHECK';

SET @sql = IF(@chk_exists = 0,
  'ALTER TABLE goals ADD CONSTRAINT chk_goals_target_positive CHECK (target_amount > 0)',
  'SELECT ''chk_goals_target_positive already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 6d. CHECK: saved_amount >= 0 ───────────────────────────────────────────
SELECT COUNT(*) INTO @chk_exists
FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA    = DATABASE()
  AND TABLE_NAME      = 'goals'
  AND CONSTRAINT_NAME = 'chk_goals_current_nonneg'
  AND CONSTRAINT_TYPE = 'CHECK';

SET @sql = IF(@chk_exists = 0,
  'ALTER TABLE goals ADD CONSTRAINT chk_goals_current_nonneg CHECK (saved_amount >= 0)',
  'SELECT ''chk_goals_current_nonneg already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 6e. Drop the legacy `saved_amount` column if it still exists ──────────────
--  saved_amount is the authoritative field; saved_amount was the old alias.
--  Data was synced to saved_amount in migration 002.
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'goals'
  AND COLUMN_NAME  = 'saved_amount';

SET @sql = IF(@col_exists > 0,
  'ALTER TABLE goals DROP COLUMN saved_amount',
  'SELECT ''goals.saved_amount already absent'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  §7  INSIGHTS TABLE                                                      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── 7a. generated_for_month — already added in 001, make it NOT NULL ─────────
--  Backfill nulls first.
UPDATE insights
SET generated_for_month = MONTH(created_at)
WHERE generated_for_month IS NULL;

UPDATE insights
SET generated_for_year = YEAR(created_at)
WHERE generated_for_year IS NULL;

-- Promote to NOT NULL
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'insights'
  AND COLUMN_NAME  = 'generated_for_month'
  AND IS_NULLABLE  = 'YES';

SET @sql = IF(@col_exists > 0,
  'ALTER TABLE insights MODIFY COLUMN generated_for_month TINYINT UNSIGNED NOT NULL, MODIFY COLUMN generated_for_year SMALLINT UNSIGNED NOT NULL',
  'SELECT ''insights month/year already NOT NULL'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 7b. updated_at on insights ────────────────────────────────────────────────
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'insights'
  AND COLUMN_NAME  = 'updated_at';

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE insights ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  'SELECT ''insights.updated_at already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  §8  FOREIGN KEY CONSTRAINTS                                             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--  All child data has been cleaned in §1, so FK additions are now safe.
--  Each FK is guarded by an INFORMATION_SCHEMA check for idempotency.

-- ── 8a. expenses → users ──────────────────────────────────────────────────────
--  Drop any old FK with alternate naming convention first
SELECT COUNT(*) INTO @fk_exists
FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA    = DATABASE()
  AND TABLE_NAME      = 'expenses'
  AND CONSTRAINT_NAME = 'fk_expenses_user_id'
  AND CONSTRAINT_TYPE = 'FOREIGN KEY';

SET @sql = IF(@fk_exists > 0,
  'ALTER TABLE expenses DROP FOREIGN KEY fk_expenses_user_id',
  'SELECT ''fk_expenses_user_id not present'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @fk_exists
FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA    = DATABASE()
  AND TABLE_NAME      = 'expenses'
  AND CONSTRAINT_NAME = 'fk_expenses_user'
  AND CONSTRAINT_TYPE = 'FOREIGN KEY';

SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE expenses ADD CONSTRAINT fk_expenses_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE',
  'SELECT ''fk_expenses_user already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 8b. expenses → categories ─────────────────────────────────────────────────
--  First drop any pre-existing FK with wrong name or type that may block addition.
SELECT COUNT(*) INTO @fk_exists
FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA    = DATABASE()
  AND TABLE_NAME      = 'expenses'
  AND CONSTRAINT_NAME = 'fk_expenses_category_id'
  AND CONSTRAINT_TYPE = 'FOREIGN KEY';

SET @sql = IF(@fk_exists > 0,
  'ALTER TABLE expenses DROP FOREIGN KEY fk_expenses_category_id',
  'SELECT ''fk_expenses_category_id not present'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @fk_exists
FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA    = DATABASE()
  AND TABLE_NAME      = 'expenses'
  AND CONSTRAINT_NAME = 'fk_expenses_category'
  AND CONSTRAINT_TYPE = 'FOREIGN KEY';

SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE expenses ADD CONSTRAINT fk_expenses_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT ''fk_expenses_category already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 8c. budgets → users ───────────────────────────────────────────────────────
SELECT COUNT(*) INTO @fk_exists
FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA    = DATABASE()
  AND TABLE_NAME      = 'budgets'
  AND CONSTRAINT_NAME = 'fk_budgets_user'
  AND CONSTRAINT_TYPE = 'FOREIGN KEY';

SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE budgets ADD CONSTRAINT fk_budgets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE',
  'SELECT ''fk_budgets_user already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 8d. budgets → categories ──────────────────────────────────────────────────
SELECT COUNT(*) INTO @fk_exists
FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA    = DATABASE()
  AND TABLE_NAME      = 'budgets'
  AND CONSTRAINT_NAME = 'fk_budgets_category'
  AND CONSTRAINT_TYPE = 'FOREIGN KEY';

SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE budgets ADD CONSTRAINT fk_budgets_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT ''fk_budgets_category already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 8e. goals → users ─────────────────────────────────────────────────────────
SELECT COUNT(*) INTO @fk_exists
FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA    = DATABASE()
  AND TABLE_NAME      = 'goals'
  AND CONSTRAINT_NAME = 'fk_goals_user'
  AND CONSTRAINT_TYPE = 'FOREIGN KEY';

SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE goals ADD CONSTRAINT fk_goals_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE',
  'SELECT ''fk_goals_user already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 8f. insights → users ──────────────────────────────────────────────────────
SELECT COUNT(*) INTO @fk_exists
FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA    = DATABASE()
  AND TABLE_NAME      = 'insights'
  AND CONSTRAINT_NAME = 'fk_insights_user'
  AND CONSTRAINT_TYPE = 'FOREIGN KEY';

SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE insights ADD CONSTRAINT fk_insights_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE',
  'SELECT ''fk_insights_user already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  §9  PERFORMANCE INDEXES                                                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── 9a. expenses(user_id, expense_date) — already in 002, guard anyway ────────
SELECT COUNT(*) INTO @idx_exists
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'expenses'
  AND INDEX_NAME   = 'idx_expenses_user_date';

SET @sql = IF(@idx_exists = 0,
  'ALTER TABLE expenses ADD INDEX idx_expenses_user_date (user_id, expense_date)',
  'SELECT ''idx_expenses_user_date already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 9b. expenses(user_id, category_id) ───────────────────────────────────────
SELECT COUNT(*) INTO @idx_exists
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'expenses'
  AND INDEX_NAME   = 'idx_expenses_user_cat';

SET @sql = IF(@idx_exists = 0,
  'ALTER TABLE expenses ADD INDEX idx_expenses_user_cat (user_id, category_id)',
  'SELECT ''idx_expenses_user_cat already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 9c. expenses: soft-delete filter index ────────────────────────────────────
SELECT COUNT(*) INTO @idx_exists
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'expenses'
  AND INDEX_NAME   = 'idx_expenses_deleted_at';

SET @sql = IF(@idx_exists = 0,
  'ALTER TABLE expenses ADD INDEX idx_expenses_deleted_at (deleted_at)',
  'SELECT ''idx_expenses_deleted_at already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 9d. budgets(user_id, month, year) — canonical period index ───────────────
SELECT COUNT(*) INTO @idx_exists
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'budgets'
  AND INDEX_NAME   = 'idx_budgets_user_period_canonical';

SET @sql = IF(@idx_exists = 0,
  'ALTER TABLE budgets ADD INDEX idx_budgets_user_period_canonical (user_id, month, year)',
  'SELECT ''idx_budgets_user_period_canonical already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 9e. goals(user_id) — already covered by idx_goals_user_status in 002 ─────
SELECT COUNT(*) INTO @idx_exists
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'goals'
  AND INDEX_NAME   = 'idx_goals_user';

SET @sql = IF(@idx_exists = 0,
  'ALTER TABLE goals ADD INDEX idx_goals_user (user_id)',
  'SELECT ''idx_goals_user already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 9f. goals: soft-delete filter index ──────────────────────────────────────
SELECT COUNT(*) INTO @idx_exists
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'goals'
  AND INDEX_NAME   = 'idx_goals_deleted_at';

SET @sql = IF(@idx_exists = 0,
  'ALTER TABLE goals ADD INDEX idx_goals_deleted_at (deleted_at)',
  'SELECT ''idx_goals_deleted_at already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 9g. insights(user_id, generated_for_month, generated_for_year) ───────────
SELECT COUNT(*) INTO @idx_exists
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'insights'
  AND INDEX_NAME   = 'idx_insights_user_period';

SET @sql = IF(@idx_exists = 0,
  'ALTER TABLE insights ADD INDEX idx_insights_user_period (user_id, generated_for_month, generated_for_year)',
  'SELECT ''idx_insights_user_period already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 9h. insights(user_id) — simple lookup ────────────────────────────────────
SELECT COUNT(*) INTO @idx_exists
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'insights'
  AND INDEX_NAME   = 'idx_insights_user';

SET @sql = IF(@idx_exists = 0,
  'ALTER TABLE insights ADD INDEX idx_insights_user (user_id)',
  'SELECT ''idx_insights_user already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 9i. categories(user_id) — for multi-tenant category lookups ──────────────
SELECT COUNT(*) INTO @idx_exists
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'categories'
  AND INDEX_NAME   = 'idx_categories_user';

SET @sql = IF(@idx_exists = 0,
  'ALTER TABLE categories ADD INDEX idx_categories_user (user_id)',
  'SELECT ''idx_categories_user already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  §10  DATA VALIDATION — FINAL INTEGRITY PASS                             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- Reject any expenses with amount = 0 or negative now that the CHECK is in place.
-- Zero-amount expenses are invalid; update them to 0.01 as a safe floor rather
-- than deleting so no historical audit trail is lost.
UPDATE expenses SET amount = 0.01 WHERE amount <= 0;

-- Reject any budgets with negative limit_amount.
UPDATE budgets SET limit_amount = 0 WHERE limit_amount < 0;

-- Reject any goals with zero or negative target_amount.
UPDATE goals SET target_amount = 0.01 WHERE target_amount <= 0;

-- Ensure no goal's saved_amount exceeds its target_amount.
UPDATE goals SET saved_amount = target_amount WHERE saved_amount > target_amount;

-- ── §10b. budget_month/budget_year kept in sync with month/year ──────────────
--  Keep old columns consistent so old queries don't break during transition.
SELECT COUNT(*) INTO @has_bm
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'budgets'
  AND COLUMN_NAME  = 'budget_month';

SET @sql = IF(@has_bm > 0,
  'UPDATE budgets SET budget_month = month, budget_year = year WHERE budget_month != month OR budget_year != year',
  'SELECT ''budget_month sync not needed'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  §11  TIMESTAMP AUDIT — ensure created_at on all tables                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- expenses.created_at default
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'expenses'
  AND COLUMN_NAME  = 'created_at'
  AND COLUMN_DEFAULT IS NULL;

SET @sql = IF(@col_exists > 0,
  'ALTER TABLE expenses MODIFY COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
  'SELECT ''expenses.created_at default ok'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- budgets.created_at default
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'budgets'
  AND COLUMN_NAME  = 'created_at'
  AND COLUMN_DEFAULT IS NULL;

SET @sql = IF(@col_exists > 0,
  'ALTER TABLE budgets MODIFY COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
  'SELECT ''budgets.created_at default ok'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- goals.created_at default
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'goals'
  AND COLUMN_NAME  = 'created_at'
  AND COLUMN_DEFAULT IS NULL;

SET @sql = IF(@col_exists > 0,
  'ALTER TABLE goals MODIFY COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
  'SELECT ''goals.created_at default ok'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- insights.created_at default
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'insights'
  AND COLUMN_NAME  = 'created_at'
  AND COLUMN_DEFAULT IS NULL;

SET @sql = IF(@col_exists > 0,
  'ALTER TABLE insights MODIFY COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
  'SELECT ''insights.created_at default ok'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- categories.created_at default (add if missing)
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'categories'
  AND COLUMN_NAME  = 'created_at';

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE categories ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
  'SELECT ''categories.created_at already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ══════════════════════════════════════════════════════════════════════════════
--  Re-enable foreign key checks.
-- ══════════════════════════════════════════════════════════════════════════════
SET FOREIGN_KEY_CHECKS = 1;

-- ══════════════════════════════════════════════════════════════════════════════
--  Final sanity check — surfaces row counts & FK health.
--  These SELECTs are read-only and safe in production.
-- ══════════════════════════════════════════════════════════════════════════════
SELECT
  'users'    AS tbl, COUNT(*) AS rows FROM users    UNION ALL
SELECT 'expenses', COUNT(*) FROM expenses           UNION ALL
SELECT 'budgets',  COUNT(*) FROM budgets            UNION ALL
SELECT 'goals',    COUNT(*) FROM goals              UNION ALL
SELECT 'insights', COUNT(*) FROM insights           UNION ALL
SELECT 'categories', COUNT(*) FROM categories;
-- Seed system categories safely
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
-- 005_settings_and_security.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- SAFE TO RUN MULTIPLE TIMES. Guards are in place.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 5a. Ensure two_factor_pin exists ──────────────────────────────────────────
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'users'
  AND COLUMN_NAME  = 'two_factor_pin';

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN two_factor_pin VARCHAR(6) NULL DEFAULT NULL AFTER password_hash',
  'SELECT ''users.two_factor_pin already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 5b. Ensure preferences exists (JSON) ──────────────────────────────────────
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'users'
  AND COLUMN_NAME  = 'preferences';

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN preferences JSON NOT NULL DEFAULT (JSON_OBJECT()) AFTER currency_code',
  'SELECT ''users.preferences already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 5c. Ensure session_version exists for Force Logout ────────────────────────
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'users'
  AND COLUMN_NAME  = 'session_version';

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN session_version INT UNSIGNED NOT NULL DEFAULT 1 AFTER is_active',
  'SELECT ''users.session_version already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 5d. Ensure deleted_at exists for soft delete ──────────────────────────────
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'users'
  AND COLUMN_NAME  = 'deleted_at';

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL AFTER updated_at',
  'SELECT ''users.deleted_at already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- 006_audit_logs.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Step 1: Create table without FK to ensure it exists for logging.
-- Step 2: Attempt FK in a separate statement.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_logs (
  id           BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  user_id      BIGINT UNSIGNED  NOT NULL,
  action       VARCHAR(50)      NOT NULL,
  entity_type  VARCHAR(50)      NOT NULL,
  entity_id    VARCHAR(255)     NULL,
  metadata     JSON             NULL,
  hash         CHAR(64)         NOT NULL,
  created_at   DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  INDEX idx_audit_user_action (user_id, action),
  INDEX idx_audit_created      (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Note: The FK is handled via a separate migration or manual fix 
-- to avoid blocking the application if types are subtly different.
-- 007_cleanup_categories.sql
-- Goal: Remove all redundant categories and establish a unique, broad set of system categories.

-- 1. Identify and remove any duplicate system categories by name (keep lowest ID)
DELETE c1 FROM categories c1
INNER JOIN categories c2 
WHERE c1.id > c2.id 
  AND c1.name = c2.name 
  AND c1.is_system = 1 
  AND c2.is_system = 1;

-- 2. Clear known system categories to rebuild from scratch (safely)
-- We use a temporary update for expenses/budgets to avoid FK violations if we were to drop IDs
-- But instead, we will just UPDATE the existing ones to match our new standard names/icons.

-- 🍔 Food & Drinks
INSERT IGNORE INTO categories (id, name, icon, color_hex, is_system) 
VALUES (1, 'Food & Drinks', '🍔', '#F97316', 1)
ON DUPLICATE KEY UPDATE name='Food & Drinks', icon='🍔', color_hex='#F97316', is_system=1;

-- 🚗 Travel & Commute
INSERT IGNORE INTO categories (id, name, icon, color_hex, is_system) 
VALUES (2, 'Travel & Commute', '🚗', '#3B82F6', 1)
ON DUPLICATE KEY UPDATE name='Travel & Commute', icon='🚗', color_hex='#3B82F6', is_system=1;

-- 🏠 Home & Living (Merging Utilities into this)
INSERT IGNORE INTO categories (id, name, icon, color_hex, is_system) 
VALUES (3, 'Home & Living', '🏠', '#EAB308', 1)
ON DUPLICATE KEY UPDATE name='Home & Living', icon='🏠', color_hex='#EAB308', is_system=1;

-- 🎭 Entertainment
INSERT IGNORE INTO categories (id, name, icon, color_hex, is_system) 
VALUES (4, 'Entertainment', '🎭', '#A855F7', 1)
ON DUPLICATE KEY UPDATE name='Entertainment', icon='🎭', color_hex='#A855F7', is_system=1;

-- 🛍️ Shopping & Retail
INSERT IGNORE INTO categories (id, name, icon, color_hex, is_system) 
VALUES (5, 'Shopping & Retail', '🛍️', '#EC4899', 1)
ON DUPLICATE KEY UPDATE name='Shopping & Retail', icon='🛍️', color_hex='#EC4899', is_system=1;

-- 🏥 Health & Wellness
INSERT IGNORE INTO categories (id, name, icon, color_hex, is_system) 
VALUES (6, 'Health & Wellness', '🏥', '#EF4444', 1)
ON DUPLICATE KEY UPDATE name='Health & Wellness', icon='🏥', color_hex='#EF4444', is_system=1;

-- 🎓 Education
INSERT IGNORE INTO categories (id, name, icon, color_hex, is_system) 
VALUES (7, 'Education', '🎓', '#22C55E', 1)
ON DUPLICATE KEY UPDATE name='Education', icon='🎓', color_hex='#22C55E', is_system=1;

-- 📱 Subscriptions
INSERT IGNORE INTO categories (id, name, icon, color_hex, is_system) 
VALUES (8, 'Subscriptions', '📱', '#6366F1', 1)
ON DUPLICATE KEY UPDATE name='Subscriptions', icon='📱', color_hex='#6366F1', is_system=1;

-- 💼 Work & Business
UPDATE categories SET name='Work & Business', icon='💼', color_hex='#6B7280' WHERE id=9;
INSERT IGNORE INTO categories (id, name, icon, color_hex, is_system) 
VALUES (9, 'Work & Business', '💼', '#6B7280', 1);

-- 📌 Others (New ID 10)
INSERT IGNORE INTO categories (id, name, icon, color_hex, is_system) 
VALUES (10, 'Others', '📌', '#9CA3AF', 1)
ON DUPLICATE KEY UPDATE name='Others', icon='📌', color_hex='#9CA3AF', is_system=1;

-- 3. Cleanup: Remove any other system categories that aren't in our core list (1-10)
DELETE FROM categories WHERE is_system = 1 AND id > 10;

-- 4. Re-map expenses that might have been lost
UPDATE expenses SET category_id = 10 WHERE category_id IS NULL;
-- 008_add_oauth_id.sql
-- Safely add oauth_id column to users table if it doesn't already exist.

SET @col_exists = 0;
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'users'
  AND COLUMN_NAME  = 'oauth_id';

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN oauth_id VARCHAR(255) NULL UNIQUE AFTER id',
  'SELECT "users.oauth_id already exists" AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Ensure avatar_url exists too, as it is used in the auth logic
SET @col_exists = 0;
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'users'
  AND COLUMN_NAME  = 'avatar_url';

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN avatar_url VARCHAR(500) NULL',
  'SELECT "users.avatar_url already exists" AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Create index on oauth_id for faster lookup
SET @idx_exists = 0;
SELECT COUNT(*) INTO @idx_exists
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'users'
  AND INDEX_NAME   = 'idx_oauth_id';

SET @sql = IF(@idx_exists = 0,
  'CREATE INDEX idx_oauth_id ON users(oauth_id)',
  'SELECT "Index idx_oauth_id already exists" AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- ══════════════════════════════════════════════════════════════════════════════
--  009_harden_database.sql
--  Database Hardening — User Isolation, Cascade Deletion, Referential Integrity
--  ─────────────────────────────────────────────────────────────────────────────
--  SAFE TO RUN MULTIPLE TIMES. Every operation is guarded by INFORMATION_SCHEMA.
--  Picks up exactly where 001–008 left off. Does NOT duplicate prior work.
--
--  What this migration adds:
--    §1  DATA CLEANUP          — orphan purge before FK enforcement
--    §2  CATEGORY FK FIX       — expenses/budgets category FK → SET NULL
--    §3  AUDIT LOGS FK         — add missing FK audit_logs.user_id → users.id
--    §4  CATEGORIES USER FK    — guard fk_categories_user on older DBs
--    §5  INSIGHTS UNIQUE       — UNIQUE(user_id, insight_type, month, year)
--    §6  MISSING INDEXES       — covering index with deleted_at, audit_logs idx
--    §7  NOT NULL ENFORCEMENT  — final pass on required columns
--    §8  CATEGORY OWNERSHIP    — system categories user_id = NULL (canonical)
--    §9  FINAL INTEGRITY PASS  — zero orphan verification
-- ══════════════════════════════════════════════════════════════════════════════

SET NAMES utf8mb4;
SET time_zone = '+00:00';
SET FOREIGN_KEY_CHECKS = 0;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  §1  DATA CLEANUP — purge orphans before adding FKs                      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- Purge audit_logs rows whose user no longer exists
DELETE FROM audit_logs
WHERE user_id NOT IN (SELECT id FROM users);

-- Remap expenses with NULL or missing category_id → 10 (Others)
UPDATE expenses
SET category_id = 10
WHERE category_id IS NULL
   OR category_id NOT IN (SELECT id FROM categories);

-- Remap budgets with missing category_id → delete (no safe fallback for budgets)
DELETE FROM budgets
WHERE category_id NOT IN (SELECT id FROM categories);

-- Purge any remaining orphaned child rows
DELETE FROM expenses  WHERE user_id NOT IN (SELECT id FROM users);
DELETE FROM budgets   WHERE user_id NOT IN (SELECT id FROM users);
DELETE FROM goals     WHERE user_id NOT IN (SELECT id FROM users);
DELETE FROM insights  WHERE user_id NOT IN (SELECT id FROM users);


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  §2  CATEGORY FK FIX — change RESTRICT → SET NULL on expenses & budgets  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--  Spec requirement: deleting a category must NOT delete expense/budget history.
--  SET NULL preserves history; RESTRICT blocks category deletion entirely.
--  We must: DROP old FK → re-add with SET NULL.
--  category_id must be nullable first.

-- ── 2a. Make expenses.category_id nullable (required for SET NULL FK) ─────────
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'expenses'
  AND COLUMN_NAME  = 'category_id'
  AND IS_NULLABLE  = 'NO';

SET @sql = IF(@col_exists > 0,
  'ALTER TABLE expenses MODIFY COLUMN category_id INT UNSIGNED NULL DEFAULT NULL',
  'SELECT ''expenses.category_id already nullable'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 2b. Make budgets.category_id nullable ─────────────────────────────────────
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'budgets'
  AND COLUMN_NAME  = 'category_id'
  AND IS_NULLABLE  = 'NO';

SET @sql = IF(@col_exists > 0,
  'ALTER TABLE budgets MODIFY COLUMN category_id INT UNSIGNED NULL DEFAULT NULL',
  'SELECT ''budgets.category_id already nullable'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 2c. Drop old expenses → categories FK (RESTRICT) ─────────────────────────
SELECT COUNT(*) INTO @fk_exists
FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA    = DATABASE()
  AND TABLE_NAME      = 'expenses'
  AND CONSTRAINT_NAME = 'fk_expenses_category'
  AND CONSTRAINT_TYPE = 'FOREIGN KEY';

SET @sql = IF(@fk_exists > 0,
  'ALTER TABLE expenses DROP FOREIGN KEY fk_expenses_category',
  'SELECT ''fk_expenses_category not present, skip drop'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 2d. Re-add expenses → categories FK with SET NULL ─────────────────────────
SELECT COUNT(*) INTO @fk_exists
FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA    = DATABASE()
  AND TABLE_NAME      = 'expenses'
  AND CONSTRAINT_NAME = 'fk_expenses_category'
  AND CONSTRAINT_TYPE = 'FOREIGN KEY';

SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE expenses ADD CONSTRAINT fk_expenses_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT ''fk_expenses_category already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 2e. Drop old budgets → categories FK (RESTRICT / CASCADE) ────────────────
SELECT COUNT(*) INTO @fk_exists
FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA    = DATABASE()
  AND TABLE_NAME      = 'budgets'
  AND CONSTRAINT_NAME = 'fk_budgets_category'
  AND CONSTRAINT_TYPE = 'FOREIGN KEY';

SET @sql = IF(@fk_exists > 0,
  'ALTER TABLE budgets DROP FOREIGN KEY fk_budgets_category',
  'SELECT ''fk_budgets_category not present, skip drop'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 2f. Re-add budgets → categories FK with SET NULL ──────────────────────────
SELECT COUNT(*) INTO @fk_exists
FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA    = DATABASE()
  AND TABLE_NAME      = 'budgets'
  AND CONSTRAINT_NAME = 'fk_budgets_category'
  AND CONSTRAINT_TYPE = 'FOREIGN KEY';

SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE budgets ADD CONSTRAINT fk_budgets_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT ''fk_budgets_category already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 2g. Drop old UNIQUE on budgets that includes category_id (now nullable) ───
--  MySQL does not enforce uniqueness on NULL values, so the existing unique key
--  uq_budgets_user_cat_period still works correctly with nullable category_id.
--  No change needed here.


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  §3  AUDIT LOGS FK — audit_logs.user_id → users.id CASCADE               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--  Migration 006 explicitly skipped this FK. We add it now.

-- ── 3a. Ensure user_id column type matches users.id (BIGINT UNSIGNED) ─────────
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA  = DATABASE()
  AND TABLE_NAME    = 'audit_logs'
  AND COLUMN_NAME   = 'user_id'
  AND COLUMN_TYPE  != 'bigint unsigned';

SET @sql = IF(@col_exists > 0,
  'ALTER TABLE audit_logs MODIFY COLUMN user_id BIGINT UNSIGNED NOT NULL',
  'SELECT ''audit_logs.user_id type already correct'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 3b. Add FK audit_logs → users ─────────────────────────────────────────────
SELECT COUNT(*) INTO @fk_exists
FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA    = DATABASE()
  AND TABLE_NAME      = 'audit_logs'
  AND CONSTRAINT_NAME = 'fk_audit_logs_user'
  AND CONSTRAINT_TYPE = 'FOREIGN KEY';

SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE audit_logs ADD CONSTRAINT fk_audit_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE',
  'SELECT ''fk_audit_logs_user already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  §4  CATEGORIES USER FK — guard for older DBs missing fk_categories_user ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--  schema.sql defines this FK but older DBs created before schema.sql may lack it.

SELECT COUNT(*) INTO @fk_exists
FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA    = DATABASE()
  AND TABLE_NAME      = 'categories'
  AND CONSTRAINT_NAME = 'fk_categories_user'
  AND CONSTRAINT_TYPE = 'FOREIGN KEY';

SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE categories ADD CONSTRAINT fk_categories_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE',
  'SELECT ''fk_categories_user already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  §5  INSIGHTS UNIQUE CONSTRAINT                                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--  Prevent duplicate insight generation for the same user/type/period.
--  Dedup first, then add the unique key.

-- ── 5a. Remove duplicate insights — keep the most recent (highest id) ─────────
DELETE i1
FROM insights i1
INNER JOIN insights i2
  ON  i1.user_id              = i2.user_id
  AND i1.insight_type         = i2.insight_type
  AND i1.generated_for_month  = i2.generated_for_month
  AND i1.generated_for_year   = i2.generated_for_year
  AND i1.id                   < i2.id;

-- ── 5b. Add UNIQUE(user_id, insight_type, generated_for_month, generated_for_year) ──
SELECT COUNT(*) INTO @idx_exists
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'insights'
  AND INDEX_NAME   = 'uq_insights_user_type_period';

SET @sql = IF(@idx_exists = 0,
  'ALTER TABLE insights ADD UNIQUE KEY uq_insights_user_type_period (user_id, insight_type, generated_for_month, generated_for_year)',
  'SELECT ''uq_insights_user_type_period already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  §6  MISSING INDEXES                                                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── 6a. expenses(user_id, expense_date, deleted_at) — 3-col covering index ────
--  Prior migrations only added (user_id, expense_date). The deleted_at column
--  is needed for efficient soft-delete filtering in production queries.
SELECT COUNT(*) INTO @idx_exists
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'expenses'
  AND INDEX_NAME   = 'idx_expenses_user_date_deleted';

SET @sql = IF(@idx_exists = 0,
  'ALTER TABLE expenses ADD INDEX idx_expenses_user_date_deleted (user_id, expense_date, deleted_at)',
  'SELECT ''idx_expenses_user_date_deleted already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 6b. audit_logs(user_id, created_at) — time-range queries per user ─────────
--  Migration 006 only added (user_id, action). Add the time-range index.
SELECT COUNT(*) INTO @idx_exists
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'audit_logs'
  AND INDEX_NAME   = 'idx_audit_logs_user_created';

SET @sql = IF(@idx_exists = 0,
  'ALTER TABLE audit_logs ADD INDEX idx_audit_logs_user_created (user_id, created_at)',
  'SELECT ''idx_audit_logs_user_created already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 6c. budgets(user_id, month, year) — already added in 003 as             ────
--  idx_budgets_user_period_canonical. Guard only.
SELECT COUNT(*) INTO @idx_exists
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'budgets'
  AND INDEX_NAME   = 'idx_budgets_user_month_year';

SET @sql = IF(@idx_exists = 0,
  'ALTER TABLE budgets ADD INDEX idx_budgets_user_month_year (user_id, month, year)',
  'SELECT ''idx_budgets_user_month_year already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 6d. goals(user_id, status) — already added in 002/003. Guard only. ────────
SELECT COUNT(*) INTO @idx_exists
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'goals'
  AND INDEX_NAME   = 'idx_goals_user_status';

SET @sql = IF(@idx_exists = 0,
  'ALTER TABLE goals ADD INDEX idx_goals_user_status (user_id, status)',
  'SELECT ''idx_goals_user_status already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 6e. insights(user_id, generated_for_month, generated_for_year) — guard ────
SELECT COUNT(*) INTO @idx_exists
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'insights'
  AND INDEX_NAME   = 'idx_insights_user_period';

SET @sql = IF(@idx_exists = 0,
  'ALTER TABLE insights ADD INDEX idx_insights_user_period (user_id, generated_for_month, generated_for_year)',
  'SELECT ''idx_insights_user_period already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  §7  NOT NULL ENFORCEMENT — final pass                                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── 7a. expenses.amount NOT NULL ──────────────────────────────────────────────
UPDATE expenses SET amount = 0.01 WHERE amount IS NULL OR amount <= 0;

SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'expenses'
  AND COLUMN_NAME  = 'amount'
  AND IS_NULLABLE  = 'YES';

SET @sql = IF(@col_exists > 0,
  'ALTER TABLE expenses MODIFY COLUMN amount DECIMAL(12,2) NOT NULL',
  'SELECT ''expenses.amount already NOT NULL'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 7b. expenses.expense_date NOT NULL ────────────────────────────────────────
UPDATE expenses SET expense_date = DATE(created_at) WHERE expense_date IS NULL;

SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'expenses'
  AND COLUMN_NAME  = 'expense_date'
  AND IS_NULLABLE  = 'YES';

SET @sql = IF(@col_exists > 0,
  'ALTER TABLE expenses MODIFY COLUMN expense_date DATE NOT NULL',
  'SELECT ''expenses.expense_date already NOT NULL'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 7c. budgets.limit_amount NOT NULL ─────────────────────────────────────────
UPDATE budgets SET limit_amount = 0 WHERE limit_amount IS NULL;

SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'budgets'
  AND COLUMN_NAME  = 'limit_amount'
  AND IS_NULLABLE  = 'YES';

SET @sql = IF(@col_exists > 0,
  'ALTER TABLE budgets MODIFY COLUMN limit_amount DECIMAL(12,2) NOT NULL',
  'SELECT ''budgets.limit_amount already NOT NULL'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 7d. goals.target_amount NOT NULL ──────────────────────────────────────────
UPDATE goals SET target_amount = 0.01 WHERE target_amount IS NULL OR target_amount <= 0;

SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'goals'
  AND COLUMN_NAME  = 'target_amount'
  AND IS_NULLABLE  = 'YES';

SET @sql = IF(@col_exists > 0,
  'ALTER TABLE goals MODIFY COLUMN target_amount DECIMAL(12,2) NOT NULL',
  'SELECT ''goals.target_amount already NOT NULL'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  §8  CATEGORY OWNERSHIP — canonical system category model                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--  Canonical rule: system categories → user_id IS NULL, is_system = 1
--  Any row with is_system = 1 must have user_id = NULL.
--  Any row with user_id = 0 (legacy) is treated as system and corrected.

-- Fix legacy user_id = 0 rows → NULL (system categories)
UPDATE categories SET user_id = NULL, is_system = 1 WHERE user_id = 0;

-- Ensure all is_system = 1 rows have user_id = NULL
UPDATE categories SET user_id = NULL WHERE is_system = 1 AND user_id IS NOT NULL;

-- Ensure all user_id IS NOT NULL rows have is_system = 0
UPDATE categories SET is_system = 0 WHERE user_id IS NOT NULL AND is_system = 1;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  §9  FINAL INTEGRITY PASS — zero orphan verification                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- These SELECTs surface any remaining orphans. All counts should be 0.
-- If any are non-zero, the migration above has a gap — investigate before deploying.

SELECT 'orphaned_expenses'  AS check_name, COUNT(*) AS orphan_count
FROM expenses WHERE user_id NOT IN (SELECT id FROM users)
UNION ALL
SELECT 'orphaned_budgets',   COUNT(*)
FROM budgets  WHERE user_id NOT IN (SELECT id FROM users)
UNION ALL
SELECT 'orphaned_goals',     COUNT(*)
FROM goals    WHERE user_id NOT IN (SELECT id FROM users)
UNION ALL
SELECT 'orphaned_insights',  COUNT(*)
FROM insights WHERE user_id NOT IN (SELECT id FROM users)
UNION ALL
SELECT 'orphaned_audit_logs', COUNT(*)
FROM audit_logs WHERE user_id NOT IN (SELECT id FROM users)
UNION ALL
SELECT 'expenses_null_category_id', COUNT(*)
FROM expenses WHERE category_id IS NULL
UNION ALL
SELECT 'system_cats_with_user_id', COUNT(*)
FROM categories WHERE is_system = 1 AND user_id IS NOT NULL;


SET FOREIGN_KEY_CHECKS = 1;
-- ══════════════════════════════════════════════════════════════════════
--  010_fix_source_enum.sql
--  Fix the expenses.source ENUM to match the application's expected values.
--
--  Migration 003 created: ENUM('manual','auto','api')
--  Application expects:   ENUM('manual','receipt_scan','bank_import')
--
--  Safe migration:
--    1. Remap existing values before altering the column
--    2. Alter the ENUM
-- ══════════════════════════════════════════════════════════════════════

-- Step 1: Remap any existing 'auto' or 'api' rows to 'manual'
-- (these were never set to meaningful values in production)
UPDATE expenses
SET source = 'manual'
WHERE source IN ('auto', 'api');

-- Step 2: Alter the ENUM to the correct values
ALTER TABLE expenses
  MODIFY COLUMN source ENUM('manual','receipt_scan','bank_import') NOT NULL DEFAULT 'manual';
-- 011_add_timezone.sql
-- Add timezone column to users table (default IST)

SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'users'
  AND COLUMN_NAME  = 'timezone';

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN timezone VARCHAR(50) NOT NULL DEFAULT ''Asia/Kolkata'' AFTER currency_code',
  'SELECT ''users.timezone already exists'' AS migration_info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
