-- ══════════════════════════════════════════════════════════════════════
-- SmartSpend — Final Schema Alignment Migration
-- Target: production-grade stability and backend logic synchronization
-- ══════════════════════════════════════════════════════════════════════

SET FOREIGN_KEY_CHECKS = 0;

-- 1. Align Budgets Table
ALTER TABLE budgets 
  CHANGE COLUMN IF EXISTS budget_month month TINYINT UNSIGNED NOT NULL,
  CHANGE COLUMN IF EXISTS budget_year year SMALLINT UNSIGNED NOT NULL;

-- 2. Add Soft Delete Support
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS deleted_at DATETIME NULL AFTER updated_at;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS deleted_at DATETIME NULL AFTER updated_at;

-- 3. Fix Insights Table Mismatch (Merge message into content)
-- Ensure 'content' exists
ALTER TABLE insights ADD COLUMN IF NOT EXISTS content TEXT NULL AFTER insight_type;
-- If 'message' exists (from previous turn's drift), merge and drop
SET @has_message = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'insights' AND COLUMN_NAME = 'message');
SET @sql = IF(@has_message > 0, 'UPDATE insights SET content = message WHERE content IS NULL OR content = ""', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql_drop = IF(@has_message > 0, 'ALTER TABLE insights DROP COLUMN message', 'SELECT 1');
PREPARE stmt_drop FROM @sql_drop; EXECUTE stmt_drop; DEALLOCATE PREPARE stmt_drop;
-- Final constraint
ALTER TABLE insights MODIFY COLUMN content TEXT NOT NULL;

-- 4. Add Missing Auth Columns
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS oauth_id VARCHAR(255) UNIQUE NULL AFTER email,
  ADD COLUMN IF NOT EXISTS session_version INT NOT NULL DEFAULT 1 AFTER is_active;

-- 5. Add Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
  id           BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  user_id      BIGINT UNSIGNED  NOT NULL,
  action       VARCHAR(100)     NOT NULL,
  entity_type  VARCHAR(50)      NOT NULL,
  entity_id    VARCHAR(100)     NULL,
  metadata     JSON             NULL,
  created_at   DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  hash         CHAR(64)         NULL, -- For data integrity verification

  PRIMARY KEY (id),
  CONSTRAINT fk_audit_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX idx_audit_user_action (user_id, action),
  INDEX idx_audit_created      (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Essential Indexes
CREATE INDEX IF NOT EXISTS idx_expenses_multi_tenant_lookup ON expenses(user_id, expense_date, deleted_at);
CREATE INDEX IF NOT EXISTS idx_users_session_integrity ON users(id, session_version);

-- 7. Ensure Foreign Keys (Strict Alignment)
ALTER TABLE expenses ADD CONSTRAINT fk_expenses_user_cascade 
  FOREIGN KEY IF NOT EXISTS (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE budgets ADD CONSTRAINT fk_budgets_user_cascade 
  FOREIGN KEY IF NOT EXISTS (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE goals ADD CONSTRAINT fk_goals_user_cascade 
  FOREIGN KEY IF NOT EXISTS (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE;

SET FOREIGN_KEY_CHECKS = 1;
