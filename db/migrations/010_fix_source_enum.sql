-- ══════════════════════════════════════════════════════════════════════
--  010_fix_source_enum.sql
--  Fix the expenses.source ENUM to match the application's expected values.
--
--  Migration 003 created: ENUM('manual','auto','api')
--  Application expects:   ENUM('manual','receipt_scan','bank_import')
--
--  Safe migration:
--    1. Remap existing values before altering the column
--    2. Alter the ENUM
-- ══════════════════════════════════════════════════════════════════════

-- Step 1: Remap any existing 'auto' or 'api' rows to 'manual'
-- (these were never set to meaningful values in production)
UPDATE expenses
SET source = 'manual'
WHERE source IN ('auto', 'api');

-- Step 2: Alter the ENUM to the correct values
ALTER TABLE expenses
  MODIFY COLUMN source ENUM('manual','receipt_scan','bank_import') NOT NULL DEFAULT 'manual';
