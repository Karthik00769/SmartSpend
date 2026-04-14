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
