-- ═══════════════════════════════════════════════════════════════
-- Table for Two — Migration v6: Beta-Ready User Profiles
-- Run AFTER migration v5 (users table must exist)
-- ═══════════════════════════════════════════════════════════════

-- 1. Add profile columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_state text DEFAULT 'single';
ALTER TABLE users ADD COLUMN IF NOT EXISTS city text DEFAULT 'London';

-- 2. Backfill email from auth.users for existing rows
UPDATE users u
SET email = au.email
FROM auth.users au
WHERE u.auth_id = au.id
  AND u.email IS NULL;

-- 3. Backfill account_state: if partner_name is set, mark as paired
UPDATE users
SET account_state = CASE
  WHEN partner_name IS NOT NULL AND partner_name != '' THEN 'paired'
  ELSE 'single'
END
WHERE account_state IS NULL OR account_state = 'single';

-- 4. Update the handle_new_user trigger to populate new columns
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO users (id, auth_id, email, name, partner_name, account_state, city, invite_code, created_at, last_seen_at)
  VALUES (
    gen_random_uuid(),
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'partner', ''),
    CASE
      WHEN COALESCE(NEW.raw_user_meta_data->>'partner', '') != '' THEN 'paired'
      ELSE 'single'
    END,
    'London',
    '',
    NOW(),
    NOW()
  )
  ON CONFLICT (auth_id) DO UPDATE SET
    last_seen_at = NOW(),
    email = EXCLUDED.email;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Add DELETE policy on user_state (missing from v2)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'State: delete own' AND tablename = 'user_state'
  ) THEN
    CREATE POLICY "State: delete own" ON user_state
      FOR DELETE USING (
        user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
      );
  END IF;
END $$;

-- 6. Index for account_state queries
CREATE INDEX IF NOT EXISTS idx_users_account_state ON users (account_state);

-- 7. Ensure preferences column exists (should exist from v3, but be safe)
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences jsonb DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false;
