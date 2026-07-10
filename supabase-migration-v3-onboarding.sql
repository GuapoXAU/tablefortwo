-- ════════════════════════════════════════════════════════
-- Table for Two — Migration v3: Onboarding Preferences
-- Run in Supabase SQL Editor
-- ════════════════════════════════════════════════════════

-- Add onboarding preferences columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences jsonb DEFAULT '{}'::jsonb;

-- The preferences JSONB will store:
-- {
--   "date_mode": "couple" | "solo" | "friends",
--   "budget": "under50" | "50to150" | "150to300" | "300plus",
--   "travel_radius": "local" | "central" | "anywhere",
--   "time_preference": "daytime" | "evening" | "late_night" | "any",
--   "setting": "indoor" | "outdoor" | "both",
--   "dietary": ["vegetarian", "vegan", "halal", "gluten_free", "none"],
--   "alcohol": "yes" | "no" | "sometimes",
--   "energy_level": "low" | "moderate" | "high",
--   "interests": ["dining", "culture", "outdoors", "nightlife", "wellness", "active"]
-- }

-- Index for fast preference lookups
CREATE INDEX IF NOT EXISTS idx_users_onboarding ON users(onboarding_completed);
