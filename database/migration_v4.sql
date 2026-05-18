-- Migration v4: Add missing columns to milestones table
-- The seed function uses age_range, badge, description but schema only had category
ALTER TABLE milestones ADD COLUMN age_range TEXT;
ALTER TABLE milestones ADD COLUMN badge TEXT;
ALTER TABLE milestones ADD COLUMN description TEXT;
