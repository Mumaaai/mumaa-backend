CREATE TABLE IF NOT EXISTS user_diets (
    user_id TEXT PRIMARY KEY,
    target TEXT DEFAULT 'baby',
    diet_type TEXT DEFAULT 'Vegetarian',
    content TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
