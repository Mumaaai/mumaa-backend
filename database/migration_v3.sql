-- Migration v3: Extend memory_journal for voice + text memories
ALTER TABLE memory_journal ADD COLUMN type TEXT DEFAULT 'text' CHECK(type IN ('text', 'voice_transcript'));
ALTER TABLE memory_journal ADD COLUMN audio_data TEXT; -- Base64-encoded audio blob
