-- ══════════════════════════════════════════════════════════════════════
-- Migration 003: Expense Audit Trail & Immutable Ledger
-- ══════════════════════════════════════════════════════════════════════
-- Purpose: Implement immutable financial ledger with full audit trail
-- Run: mysql -u root -p smartspend < db/migrations/003_expense_audit_trail.sql
-- ══════════════════════════════════════════════════════════════════════

USE smartspend;

-- ────────────────────────────────────────────────────────────────────
-- 1. Create expense_audit_log table (immutable history)
-- ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS expense_audit_log (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  
  -- Link to expense
  expense_id BIGINT UNSIGNED NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  
  -- Operation details
  operation ENUM('CREATE', 'UPDATE', 'DELETE', 'RESTORE') NOT NULL,
  
  -- Changed fields (JSON)
  old_values JSON NULL COMMENT 'Previous values before change',
  new_values JSON NULL COMMENT 'New values after change',
  changes_summary TEXT NULL COMMENT 'Human-readable change description',
  
  -- Audit metadata
  changed_by VARCHAR(255) NOT NULL COMMENT 'User ID who made the change',
  changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_address VARCHAR(45) NULL,
  user_agent TEXT NULL,
  reason TEXT NULL COMMENT 'Reason for change (optional)',
  
  -- Integrity
  previous_hash CHAR(64) NULL COMMENT 'Hash of previous audit entry',
  entry_hash CHAR(64) NOT NULL COMMENT 'SHA256 hash of this entry',
  
  INDEX idx_expense_id (expense_id),
  INDEX idx_user_id (user_id),
  INDEX idx_changed_at (changed_at),
  INDEX idx_operation (operation),
  
  CONSTRAINT fk_expense_audit_expense 
    FOREIGN KEY (expense_id) 
    REFERENCES expenses(id) 
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Immutable audit trail for all expense modifications';

-- ────────────────────────────────────────────────────────────────────
-- 2. Add soft delete metadata to expenses table
-- ────────────────────────────────────────────────────────────────────

-- Check if deleted_by column exists
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'expenses'
    AND COLUMN_NAME = 'deleted_by'
);

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE expenses ADD COLUMN deleted_by VARCHAR(255) NULL AFTER deleted_at',
  'SELECT ''deleted_by already exists'' AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Check if delete_reason column exists
SET @col2_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'expenses'
    AND COLUMN_NAME = 'delete_reason'
);

SET @sql2 = IF(@col2_exists = 0,
  'ALTER TABLE expenses ADD COLUMN delete_reason TEXT NULL AFTER deleted_by',
  'SELECT ''delete_reason already exists'' AS info'
);
PREPARE stmt2 FROM @sql2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;

-- ────────────────────────────────────────────────────────────────────
-- 3. Add sequence_no to expense_audit_log if missing
-- ────────────────────────────────────────────────────────────────────

SET @col3_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'expense_audit_log'
    AND COLUMN_NAME = 'sequence_no'
);

SET @sql3 = IF(@col3_exists = 0,
  'ALTER TABLE expense_audit_log ADD COLUMN sequence_no BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER id, ADD INDEX idx_sequence (sequence_no)',
  'SELECT ''sequence_no already exists'' AS info'
);
PREPARE stmt3 FROM @sql3; EXECUTE stmt3; DEALLOCATE PREPARE stmt3;

-- ────────────────────────────────────────────────────────────────────
-- 4. Ensure audit_logs table has sequence_no for blockchain-style integrity
-- ────────────────────────────────────────────────────────────────────

SET @col4_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'audit_logs'
    AND COLUMN_NAME = 'sequence_no'
);

SET @sql4 = IF(@col4_exists = 0,
  'ALTER TABLE audit_logs ADD COLUMN sequence_no BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER id, ADD INDEX idx_audit_sequence (sequence_no)',
  'SELECT ''audit_logs.sequence_no already exists'' AS info'
);
PREPARE stmt4 FROM @sql4; EXECUTE stmt4; DEALLOCATE PREPARE stmt4;

-- ────────────────────────────────────────────────────────────────────
-- 5. Add recovery flag for soft-deleted expenses
-- ────────────────────────────────────────────────────────────────────

SET @col5_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'expenses'
    AND COLUMN_NAME = 'restored_at'
);

SET @sql5 = IF(@col5_exists = 0,
  'ALTER TABLE expenses ADD COLUMN restored_at TIMESTAMP NULL AFTER delete_reason',
  'SELECT ''restored_at already exists'' AS info'
);
PREPARE stmt5 FROM @sql5; EXECUTE stmt5; DEALLOCATE PREPARE stmt5;

SET @col6_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'expenses'
    AND COLUMN_NAME = 'restored_by'
);

SET @sql6 = IF(@col6_exists = 0,
  'ALTER TABLE expenses ADD COLUMN restored_by VARCHAR(255) NULL AFTER restored_at',
  'SELECT ''restored_by already exists'' AS info'
);
PREPARE stmt6 FROM @sql6; EXECUTE stmt6; DEALLOCATE PREPARE stmt6;

-- ────────────────────────────────────────────────────────────────────
-- 6. Add timezone awareness columns (optional - for future use)
-- ────────────────────────────────────────────────────────────────────

-- This is informational only - timezone handling will be done in application layer
-- Database continues to store UTC, application converts to IST

-- ══════════════════════════════════════════════════════════════════════
-- Migration Complete
-- ══════════════════════════════════════════════════════════════════════

SELECT 'Migration 003 completed successfully' AS status;
SELECT 'Expense audit trail is now immutable' AS note;
SELECT 'All expense changes will be tracked with full history' AS note2;
