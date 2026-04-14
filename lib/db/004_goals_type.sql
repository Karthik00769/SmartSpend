-- file:///c:/Users/Karthik/Downloads/smartspend/lib/db/004_goals_type.sql
-- ══════════════════════════════════════════════════════════════════════
-- 1. ADD GOAL_TYPE COLUMN
-- ══════════════════════════════════════════════════════════════════════

USE smartspend;

DELIMITER //

CREATE PROCEDURE IF NOT EXISTS AddGoalTypeColumn()
BEGIN
    IF NOT EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'goals' AND COLUMN_NAME = 'goal_type') THEN
        ALTER TABLE goals ADD COLUMN goal_type ENUM('short_term', 'long_term') NOT NULL DEFAULT 'short_term' AFTER status;
    END IF;
END //

DELIMITER ;

CALL AddGoalTypeColumn();
DROP PROCEDURE AddGoalTypeColumn;

-- ══════════════════════════════════════════════════════════════════════
-- 2. ENSURE SAVED_AMOUNT IS POSITIVE
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE goals MODIFY COLUMN saved_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00;
