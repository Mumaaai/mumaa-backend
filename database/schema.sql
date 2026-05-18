-- MUMAA Application Database Schema (SQLite)

-- 1. Users / Parents Table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    hashed_password TEXT NOT NULL,
    preferred_language TEXT DEFAULT 'en',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Babies Table
CREATE TABLE IF NOT EXISTS babies (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    date_of_birth DATE NOT NULL,
    gender TEXT,
    blood_group TEXT,
    preferred_language TEXT DEFAULT 'hinglish',
    ai_detail TEXT DEFAULT 'balanced',
    mom_name TEXT,
    delivery_type TEXT,
    parenting_type TEXT,
    medical_conditions TEXT,
    birth_weight REAL,
    mom_condition TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 2.5 Chat Sessions Table
CREATE TABLE IF NOT EXISTS chat_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT DEFAULT 'New Chat',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 3. AI Chat Messages Table
CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    role TEXT CHECK( role IN ('user', 'assistant', 'system') ) NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 4. Activity Logs (Feeding, Diaper, Sleep)
CREATE TABLE IF NOT EXISTS activity_logs (
    id TEXT PRIMARY KEY,
    baby_id TEXT NOT NULL,
    activity_type TEXT CHECK( activity_type IN ('feeding', 'diaper', 'sleep') ) NOT NULL,
    detail TEXT,
    start_time DATETIME NOT NULL,
    end_time DATETIME, 
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (baby_id) REFERENCES babies(id) ON DELETE CASCADE
);

-- 5. Growth Tracker
CREATE TABLE IF NOT EXISTS growth_records (
    id TEXT PRIMARY KEY,
    baby_id TEXT NOT NULL,
    weight_kg REAL,
    height_cm REAL,
    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (baby_id) REFERENCES babies(id) ON DELETE CASCADE
);

-- 6. Vaccinations
CREATE TABLE IF NOT EXISTS vaccinations (
    id TEXT PRIMARY KEY,
    baby_id TEXT NOT NULL,
    vaccine_name TEXT NOT NULL,
    due_date DATE NOT NULL,
    administered_date DATE,
    status TEXT CHECK( status IN ('pending', 'completed', 'missed') ) DEFAULT 'pending',
    notes TEXT,
    FOREIGN KEY (baby_id) REFERENCES babies(id) ON DELETE CASCADE
);

-- 7. Milestones
CREATE TABLE IF NOT EXISTS milestones (
    id TEXT PRIMARY KEY,
    baby_id TEXT NOT NULL,
    milestone_name TEXT NOT NULL,
    category TEXT, 
    achieved_date DATE,
    status TEXT CHECK( status IN ('pending', 'achieved') ) DEFAULT 'pending',
    age_range TEXT,
    badge TEXT,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (baby_id) REFERENCES babies(id) ON DELETE CASCADE
);

-- 8. Memory Journal
CREATE TABLE IF NOT EXISTS memory_journal (
    id TEXT PRIMARY KEY,
    baby_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    media_url TEXT, 
    recorded_date DATE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (baby_id) REFERENCES babies(id) ON DELETE CASCADE
);
