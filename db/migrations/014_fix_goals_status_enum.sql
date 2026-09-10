-- Fix goals status enum to include 'failed'
ALTER TABLE goals MODIFY COLUMN status ENUM('active','paused','completed','cancelled','failed') DEFAULT 'active';
