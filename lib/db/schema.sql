-- ══════════════════════════════════════════════════════════════════════
--  SmartSpend — Full MySQL Schema + Seed Data
--  Run once on a fresh database: mysql -u root -p smartspend < schema.sql
-- ══════════════════════════════════════════════════════════════════════

CREATE DATABASE IF NOT EXISTS smartspend
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE smartspend;

-- ──────────────────────────────────────────────────────────────────────
-- 1. USERS
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id             BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  email          VARCHAR(255)     NOT NULL,
  full_name      VARCHAR(150)     NOT NULL,
  password_hash  VARCHAR(255)     NULL,
  avatar_url     VARCHAR(500)     NULL,
  currency_code  CHAR(3)          NOT NULL DEFAULT 'USD',
  monthly_income DECIMAL(12,2)    NOT NULL DEFAULT 0.00,
  plan           ENUM('free','pro','enterprise') NOT NULL DEFAULT 'free',
  is_active      TINYINT(1)       NOT NULL DEFAULT 1,
  created_at     DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  INDEX idx_users_plan   (plan)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ──────────────────────────────────────────────────────────────────────
-- 2. CATEGORIES
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id          INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED  NULL COMMENT 'NULL = system-wide',
  name        VARCHAR(100)     NOT NULL,
  icon        VARCHAR(10)      NOT NULL DEFAULT '📌',
  color_hex   CHAR(7)          NOT NULL DEFAULT '#6B7280',
  is_system   TINYINT(1)       NOT NULL DEFAULT 0,
  created_at  DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT fk_categories_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  UNIQUE KEY uq_categories_user_name (user_id, name),
  INDEX idx_categories_user_id  (user_id),
  INDEX idx_categories_is_system (is_system)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ──────────────────────────────────────────────────────────────────────
-- 3. EXPENSES
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  id              BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  user_id         BIGINT UNSIGNED  NOT NULL,
  category_id     INT UNSIGNED     NOT NULL,
  amount          DECIMAL(12,2)    NOT NULL,
  expense_date    DATE             NOT NULL,
  description     VARCHAR(500)     NOT NULL DEFAULT '',
  category_source ENUM('manual','auto') NOT NULL DEFAULT 'manual',
  source          ENUM('manual','receipt_scan','bank_import') NOT NULL DEFAULT 'manual',
  receipt_url     VARCHAR(1000)    NULL,
  created_at      DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT fk_expenses_user
    FOREIGN KEY (user_id)     REFERENCES users(id)      ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_expenses_category
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  INDEX idx_expenses_user_date     (user_id, expense_date),
  INDEX idx_expenses_user_category (user_id, category_id),
  INDEX idx_expenses_date          (expense_date),
  INDEX idx_expenses_source        (source)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ──────────────────────────────────────────────────────────────────────
-- 4. BUDGETS
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS budgets (
  id            INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  user_id       BIGINT UNSIGNED  NOT NULL,
  category_id   INT UNSIGNED     NOT NULL,
  limit_amount  DECIMAL(12,2)    NOT NULL,
  budget_month  TINYINT UNSIGNED NOT NULL,
  budget_year   SMALLINT UNSIGNED NOT NULL,
  created_at    DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_budgets_user_cat_period (user_id, category_id, budget_month, budget_year),
  CONSTRAINT fk_budgets_user
    FOREIGN KEY (user_id)     REFERENCES users(id)      ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_budgets_category
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX idx_budgets_user_period (user_id, budget_year, budget_month),
  INDEX idx_budgets_category    (category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ──────────────────────────────────────────────────────────────────────
-- 5. GOALS
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS goals (
  id             INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  user_id        BIGINT UNSIGNED  NOT NULL,
  title          VARCHAR(150)     NOT NULL,
  description    TEXT             NULL,
  target_amount  DECIMAL(12,2)    NOT NULL,
  current_amount DECIMAL(12,2)    NOT NULL DEFAULT 0.00,
  target_date    DATE             NOT NULL,
  priority       ENUM('low','medium','high')                        NOT NULL DEFAULT 'medium',
  status         ENUM('active','paused','completed','cancelled')    NOT NULL DEFAULT 'active',
  created_at     DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT fk_goals_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX idx_goals_user_status   (user_id, status),
  INDEX idx_goals_target_date   (user_id, target_date),
  INDEX idx_goals_user_priority (user_id, priority)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ──────────────────────────────────────────────────────────────────────
-- 6. INSIGHTS
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS insights (
  id                   INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  user_id              BIGINT UNSIGNED  NOT NULL,
  insight_type         ENUM(
                         'overspending_alert',
                         'budget_exceeded',
                         'goal_at_risk',
                         'savings_opportunity',
                         'unusual_transaction',
                         'monthly_summary'
                       )                NOT NULL,
  content              TEXT             NOT NULL,
  metadata             JSON             NULL,
  is_read              TINYINT(1)       NOT NULL DEFAULT 0,
  generated_for_month  TINYINT UNSIGNED NULL,
  generated_for_year   SMALLINT UNSIGNED NULL,
  created_at           DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT fk_insights_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX idx_insights_user_read       (user_id, is_read),
  INDEX idx_insights_user_created    (user_id, created_at),
  INDEX idx_insights_user_type_period (user_id, insight_type, generated_for_year, generated_for_month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ══════════════════════════════════════════════════════════════════════
--  SEED DATA
-- ══════════════════════════════════════════════════════════════════════

-- Demo user (id = 1)
INSERT IGNORE INTO users (id, email, full_name, monthly_income, plan) VALUES
(1, 'demo@smartspend.app', 'Demo User', 5000.00, 'pro');

-- System categories
INSERT IGNORE INTO categories (id, user_id, name, icon, color_hex, is_system) VALUES
(1,  NULL, 'Food & Dining',  '🍔', '#F97316', 1),
(2,  NULL, 'Transportation', '🚗', '#3B82F6', 1),
(3,  NULL, 'Utilities',      '💡', '#EAB308', 1),
(4,  NULL, 'Entertainment',  '🎬', '#A855F7', 1),
(5,  NULL, 'Shopping',       '🛍️', '#EC4899', 1),
(6,  NULL, 'Healthcare',     '🏥', '#EF4444', 1),
(7,  NULL, 'Education',      '📚', '#22C55E', 1),
(8,  NULL, 'Subscriptions',  '📱', '#6366F1', 1),
(9,  NULL, 'Other',          '📌', '#6B7280', 1);

-- Sample expenses for current month (adjust year/month as needed)
INSERT IGNORE INTO expenses (user_id, category_id, amount, expense_date, description, source) VALUES
(1, 1,  45.99, DATE_FORMAT(NOW(), '%Y-%m-15'), 'Lunch at cafe',       'manual'),
(1, 2, 120.00, DATE_FORMAT(NOW(), '%Y-%m-14'), 'Gas station fill-up', 'manual'),
(1, 4,  89.99, DATE_FORMAT(NOW(), '%Y-%m-14'), 'Movie and dinner',    'manual'),
(1, 5, 200.00, DATE_FORMAT(NOW(), '%Y-%m-13'), 'New clothes',         'manual'),
(1, 3,  50.00, DATE_FORMAT(NOW(), '%Y-%m-12'), 'Internet bill',       'manual'),
(1, 1,  32.50, DATE_FORMAT(NOW(), '%Y-%m-11'), 'Grocery shopping',    'manual'),
(1, 8,  15.99, DATE_FORMAT(NOW(), '%Y-%m-10'), 'Streaming service',   'manual'),
(1, 6,  75.00, DATE_FORMAT(NOW(), '%Y-%m-09'), 'Doctor visit',        'manual');

-- Sample budgets for current month
INSERT IGNORE INTO budgets (user_id, category_id, limit_amount, budget_month, budget_year) VALUES
(1, 1, 400, MONTH(NOW()), YEAR(NOW())),
(1, 2, 300, MONTH(NOW()), YEAR(NOW())),
(1, 3, 200, MONTH(NOW()), YEAR(NOW())),
(1, 4, 200, MONTH(NOW()), YEAR(NOW())),
(1, 5, 400, MONTH(NOW()), YEAR(NOW())),
(1, 6, 200, MONTH(NOW()), YEAR(NOW())),
(1, 7, 300, MONTH(NOW()), YEAR(NOW())),
(1, 8, 100, MONTH(NOW()), YEAR(NOW()));

-- Sample goals
INSERT IGNORE INTO goals (id, user_id, title, description, target_amount, current_amount, target_date, priority, status) VALUES
(1, 1, 'Emergency Fund',  'Build 3 months of expenses', 10000, 3500, DATE_ADD(NOW(), INTERVAL 9  MONTH), 'high',   'active'),
(2, 1, 'Vacation Fund',   'Trip to Europe',              5000,  1200, DATE_ADD(NOW(), INTERVAL 5  MONTH), 'medium', 'active'),
(3, 1, 'New Laptop',      'Gaming laptop upgrade',       2000,   800, DATE_ADD(NOW(), INTERVAL 3  MONTH), 'low',    'active');

-- Sample insights
INSERT IGNORE INTO insights (id, user_id, insight_type, content, metadata, is_read, generated_for_month, generated_for_year) VALUES
(1, 1, 'overspending_alert',  'Your spending has increased by 12% compared to last month. Consider reviewing discretionary expenses.', '{"trend_pct": 12}',                           0, MONTH(NOW()), YEAR(NOW())),
(2, 1, 'savings_opportunity', 'Great job! You''ve saved 25% of your monthly income this month.',                                        '{"savings_rate": 25}',                        0, MONTH(NOW()), YEAR(NOW())),
(3, 1, 'budget_exceeded',     'Shopping is your highest expense at 32% of total spending. Consider setting a lower limit.',              '{"category": "Shopping", "pct": 32}',         0, MONTH(NOW()), YEAR(NOW())),
(4, 1, 'goal_at_risk',        'You''re 35% towards your Emergency Fund. At this rate, you''ll reach it in 8 months.',                   '{"goal": "Emergency Fund", "progress": 35}',  0, MONTH(NOW()), YEAR(NOW())),
(5, 1, 'monthly_summary',     'You stayed within budget for 6 of 8 categories this month. Budget compliance: 92%.',                      '{"compliance_pct": 92}',                      0, MONTH(NOW()), YEAR(NOW())),
(6, 1, 'unusual_transaction', 'You have 3 active subscriptions costing $45.99/month. Review if all are still needed.',                  '{"subscription_total": 45.99, "count": 3}',   0, MONTH(NOW()), YEAR(NOW()));
