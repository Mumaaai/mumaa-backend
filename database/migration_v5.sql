-- Migration v5: Add created_at column to milestones table
ALTER TABLE milestones ADD COLUMN created_at DATETIME;
