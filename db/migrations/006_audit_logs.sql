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
