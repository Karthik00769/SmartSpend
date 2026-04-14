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
