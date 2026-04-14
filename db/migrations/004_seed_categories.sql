-- Seed system categories safely
INSERT IGNORE INTO categories (id, user_id, name, icon, color_hex, is_system) VALUES
(1, NULL, 'Food & Dining',  '🍔', '#F97316', 1),
(2, NULL, 'Transportation', '🚗', '#3B82F6', 1),
(3, NULL, 'Utilities',      '💡', '#EAB308', 1),
(4, NULL, 'Entertainment',  '🎬', '#A855F7', 1),
(5, NULL, 'Shopping',       '🛍️', '#EC4899', 1),
(6, NULL, 'Healthcare',     '🏥', '#EF4444', 1),
(7, NULL, 'Education',      '📚', '#22C55E', 1),
(8, NULL, 'Subscriptions',  '📱', '#6366F1', 1),
(9, NULL, 'Other',          '📌', '#6B7280', 1);
