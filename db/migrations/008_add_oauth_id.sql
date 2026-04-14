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
