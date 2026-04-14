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
