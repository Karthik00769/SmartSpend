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
