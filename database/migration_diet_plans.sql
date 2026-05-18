-- Migration to add diet_plans table
CREATE TABLE IF NOT EXISTS diet_plans (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    baby_id TEXT NOT NULL,
    target TEXT CHECK( target IN ('baby', 'mom') ) NOT NULL,
    diet_type TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (baby_id) REFERENCES babies(id) ON DELETE CASCADE
);
