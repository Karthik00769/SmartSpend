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
