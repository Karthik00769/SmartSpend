-- ══════════════════════════════════════════════════════════════════════
--  013_minor_canonicalization.sql
--  Migrate all currency values to BIGINT Minor
-- ══════════════════════════════════════════════════════════════════════

-- Disable FK checks just in case
SET FOREIGN_KEY_CHECKS = 0;

-- ── EXPENSES ────────────────────────────────────────────────────────
-- Add amount_minor
SELECT COUNT(*) INTO @col_exists FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'expenses' AND COLUMN_NAME = 'amount_minor';
SET @sql = IF(@col_exists = 0, 'ALTER TABLE expenses ADD COLUMN amount_minor BIGINT NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill amount_minor from amount
SELECT COUNT(*) INTO @col_exists FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'expenses' AND COLUMN_NAME = 'amount';
SET @sql = IF(@col_exists > 0, 'UPDATE expenses SET amount_minor = ROUND(amount * 100) WHERE amount_minor = 0', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Drop amount
SET @sql = IF(@col_exists > 0, 'ALTER TABLE expenses DROP COLUMN amount', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ── BUDGETS ─────────────────────────────────────────────────────────
-- Add limit_minor
SELECT COUNT(*) INTO @col_exists FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'budgets' AND COLUMN_NAME = 'limit_minor';
SET @sql = IF(@col_exists = 0, 'ALTER TABLE budgets ADD COLUMN limit_minor BIGINT NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill limit_minor from limit_amount
SELECT COUNT(*) INTO @col_exists FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'budgets' AND COLUMN_NAME = 'limit_amount';
SET @sql = IF(@col_exists > 0, 'UPDATE budgets SET limit_minor = ROUND(limit_amount * 100) WHERE limit_minor = 0', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Drop limit_amount
SET @sql = IF(@col_exists > 0, 'ALTER TABLE budgets DROP COLUMN limit_amount', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ── GOALS ───────────────────────────────────────────────────────────
-- Add target_minor
SELECT COUNT(*) INTO @col_exists FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'goals' AND COLUMN_NAME = 'target_minor';
SET @sql = IF(@col_exists = 0, 'ALTER TABLE goals ADD COLUMN target_minor BIGINT NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add saved_minor
SELECT COUNT(*) INTO @col_exists FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'goals' AND COLUMN_NAME = 'saved_minor';
SET @sql = IF(@col_exists = 0, 'ALTER TABLE goals ADD COLUMN saved_minor BIGINT NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill target_minor from target_amount
SELECT COUNT(*) INTO @col_exists FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'goals' AND COLUMN_NAME = 'target_amount';
SET @sql = IF(@col_exists > 0, 'UPDATE goals SET target_minor = ROUND(target_amount * 100) WHERE target_minor = 0', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Drop target_amount
SET @sql = IF(@col_exists > 0, 'ALTER TABLE goals DROP COLUMN target_amount', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill saved_minor from saved_amount
SELECT COUNT(*) INTO @col_exists FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'goals' AND COLUMN_NAME = 'saved_amount';
SET @sql = IF(@col_exists > 0, 'UPDATE goals SET saved_minor = ROUND(saved_amount * 100) WHERE saved_minor = 0', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Drop saved_amount
SET @sql = IF(@col_exists > 0, 'ALTER TABLE goals DROP COLUMN saved_amount', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ── USERS ───────────────────────────────────────────────────────────
-- Add monthly_income_minor
SELECT COUNT(*) INTO @col_exists FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'monthly_income_minor';
SET @sql = IF(@col_exists = 0, 'ALTER TABLE users ADD COLUMN monthly_income_minor BIGINT NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill monthly_income_minor from monthly_income
SELECT COUNT(*) INTO @col_exists FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'monthly_income';
SET @sql = IF(@col_exists > 0, 'UPDATE users SET monthly_income_minor = ROUND(monthly_income * 100) WHERE monthly_income_minor = 0', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Drop monthly_income
SET @sql = IF(@col_exists > 0, 'ALTER TABLE users DROP COLUMN monthly_income', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS = 1;
