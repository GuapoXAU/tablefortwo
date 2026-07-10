-- ════════════════════════════════════════════════════════
-- Table for Two — Migration v2: Proper Auth + RLS
-- Run this in Supabase SQL Editor AFTER the v1 schema
-- ════════════════════════════════════════════════════════

-- 1. Add auth_id column to users table (links to Supabase Auth)
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_id uuid UNIQUE;

-- 2. Drop old permissive policies
DROP POLICY IF EXISTS "Users can read own row" ON users;
DROP POLICY IF EXISTS "Users can insert" ON users;
DROP POLICY IF EXISTS "Users can update own row" ON users;
DROP POLICY IF EXISTS "State: read own" ON user_state;
DROP POLICY IF EXISTS "State: insert own" ON user_state;
DROP POLICY IF EXISTS "State: update own" ON user_state;
DROP POLICY IF EXISTS "Events: insert" ON events;
DROP POLICY IF EXISTS "Events: read" ON events;

-- 3. Create user-scoped RLS policies (users can only access their own data)

-- Users table: read/update own row only (matched by auth.uid())
CREATE POLICY "Users: read own" ON users
  FOR SELECT USING (auth_id = auth.uid());

CREATE POLICY "Users: insert own" ON users
  FOR INSERT WITH CHECK (auth_id = auth.uid());

CREATE POLICY "Users: update own" ON users
  FOR UPDATE USING (auth_id = auth.uid());

-- User state: scoped to own user_id
CREATE POLICY "State: read own" ON user_state
  FOR SELECT USING (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
  );

CREATE POLICY "State: insert own" ON user_state
  FOR INSERT WITH CHECK (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
  );

CREATE POLICY "State: update own" ON user_state
  FOR UPDATE USING (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
  );

-- Events: users can insert their own events, read their own
CREATE POLICY "Events: insert own" ON events
  FOR INSERT WITH CHECK (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
  );

CREATE POLICY "Events: read own" ON events
  FOR SELECT USING (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
  );

-- 4. Create a trigger to auto-create user profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO users (id, auth_id, name, partner_name, invite_code, created_at, last_seen_at)
  VALUES (
    gen_random_uuid(),
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'partner', ''),
    '',
    NOW(),
    NOW()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop if exists to avoid duplicate trigger error
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 5. Index for fast auth_id lookups
CREATE INDEX IF NOT EXISTS idx_users_auth_id ON users(auth_id);
