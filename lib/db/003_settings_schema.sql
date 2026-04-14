-- ══════════════════════════════════════════════════════════════════════
--  SmartSpend — Settings & Security Schema Patch
-- ══════════════════════════════════════════════════════════════════════

USE smartspend;

-- Ensure all necessary columns exist on the users table
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS two_factor_pin VARCHAR(255) NULL AFTER password_hash,
  ADD COLUMN IF NOT EXISTS preferences JSON NULL AFTER currency_code,
  ADD COLUMN IF NOT EXISTS session_version INT UNSIGNED NOT NULL DEFAULT 1 AFTER preferences,
  ADD COLUMN IF NOT EXISTS deleted_at DATETIME NULL AFTER is_active;

-- Explicitly ensure indexes for performance on these new columns
CREATE INDEX IF NOT EXISTS idx_users_session_version ON users(session_version);
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at);

-- If preferences is NULL for existing users, set a default JSON structure
UPDATE users SET preferences = '{"budgetAlerts": true, "aiInsights": true, "weeklyDigest": false}' WHERE preferences IS NULL;
