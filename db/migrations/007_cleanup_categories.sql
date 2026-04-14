-- 007_cleanup_categories.sql
-- Goal: Remove all redundant categories and establish a unique, broad set of system categories.

-- 1. Identify and remove any duplicate system categories by name (keep lowest ID)
DELETE c1 FROM categories c1
INNER JOIN categories c2 
WHERE c1.id > c2.id 
  AND c1.name = c2.name 
  AND c1.is_system = 1 
  AND c2.is_system = 1;

-- 2. Clear known system categories to rebuild from scratch (safely)
-- We use a temporary update for expenses/budgets to avoid FK violations if we were to drop IDs
-- But instead, we will just UPDATE the existing ones to match our new standard names/icons.

-- 🍔 Food & Drinks
INSERT IGNORE INTO categories (id, name, icon, color_hex, is_system) 
VALUES (1, 'Food & Drinks', '🍔', '#F97316', 1)
ON DUPLICATE KEY UPDATE name='Food & Drinks', icon='🍔', color_hex='#F97316', is_system=1;

-- 🚗 Travel & Commute
INSERT IGNORE INTO categories (id, name, icon, color_hex, is_system) 
VALUES (2, 'Travel & Commute', '🚗', '#3B82F6', 1)
ON DUPLICATE KEY UPDATE name='Travel & Commute', icon='🚗', color_hex='#3B82F6', is_system=1;

-- 🏠 Home & Living (Merging Utilities into this)
INSERT IGNORE INTO categories (id, name, icon, color_hex, is_system) 
VALUES (3, 'Home & Living', '🏠', '#EAB308', 1)
ON DUPLICATE KEY UPDATE name='Home & Living', icon='🏠', color_hex='#EAB308', is_system=1;

-- 🎭 Entertainment
INSERT IGNORE INTO categories (id, name, icon, color_hex, is_system) 
VALUES (4, 'Entertainment', '🎭', '#A855F7', 1)
ON DUPLICATE KEY UPDATE name='Entertainment', icon='🎭', color_hex='#A855F7', is_system=1;

-- 🛍️ Shopping & Retail
INSERT IGNORE INTO categories (id, name, icon, color_hex, is_system) 
VALUES (5, 'Shopping & Retail', '🛍️', '#EC4899', 1)
ON DUPLICATE KEY UPDATE name='Shopping & Retail', icon='🛍️', color_hex='#EC4899', is_system=1;

-- 🏥 Health & Wellness
INSERT IGNORE INTO categories (id, name, icon, color_hex, is_system) 
VALUES (6, 'Health & Wellness', '🏥', '#EF4444', 1)
ON DUPLICATE KEY UPDATE name='Health & Wellness', icon='🏥', color_hex='#EF4444', is_system=1;

-- 🎓 Education
INSERT IGNORE INTO categories (id, name, icon, color_hex, is_system) 
VALUES (7, 'Education', '🎓', '#22C55E', 1)
ON DUPLICATE KEY UPDATE name='Education', icon='🎓', color_hex='#22C55E', is_system=1;

-- 📱 Subscriptions
INSERT IGNORE INTO categories (id, name, icon, color_hex, is_system) 
VALUES (8, 'Subscriptions', '📱', '#6366F1', 1)
ON DUPLICATE KEY UPDATE name='Subscriptions', icon='📱', color_hex='#6366F1', is_system=1;

-- 💼 Work & Business
UPDATE categories SET name='Work & Business', icon='💼', color_hex='#6B7280' WHERE id=9;
INSERT IGNORE INTO categories (id, name, icon, color_hex, is_system) 
VALUES (9, 'Work & Business', '💼', '#6B7280', 1);

-- 📌 Others (New ID 10)
INSERT IGNORE INTO categories (id, name, icon, color_hex, is_system) 
VALUES (10, 'Others', '📌', '#9CA3AF', 1)
ON DUPLICATE KEY UPDATE name='Others', icon='📌', color_hex='#9CA3AF', is_system=1;

-- 3. Cleanup: Remove any other system categories that aren't in our core list (1-10)
DELETE FROM categories WHERE is_system = 1 AND id > 10;

-- 4. Re-map expenses that might have been lost
UPDATE expenses SET category_id = 10 WHERE category_id IS NULL;
