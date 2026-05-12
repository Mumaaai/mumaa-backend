-- Migration to add new fields to babies table
ALTER TABLE babies ADD COLUMN delivery_type TEXT;
ALTER TABLE babies ADD COLUMN parenting_type TEXT;
ALTER TABLE babies ADD COLUMN medical_conditions TEXT;
ALTER TABLE babies ADD COLUMN birth_weight REAL;
ALTER TABLE babies ADD COLUMN mom_condition TEXT;
