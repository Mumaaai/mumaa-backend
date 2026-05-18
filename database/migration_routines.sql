CREATE TABLE IF NOT EXISTS user_routines (
    user_id TEXT PRIMARY KEY,
    custom_routines TEXT DEFAULT '[]',
    completed_tasks TEXT DEFAULT '{}',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
