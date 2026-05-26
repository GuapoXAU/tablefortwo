-- ═══════════════════════════════════════════════════════════════
-- Table for Two — Migration v7: Unique Handles
-- Run AFTER migration v6
-- ═══════════════════════════════════════════════════════════════

-- 1. Add handle column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS handle text;

-- 2. Unique constraint on handle (enforces no duplicates at DB level)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_handle_unique ON users (handle) WHERE handle IS NOT NULL AND handle != '';

-- 3. Allow anon users to check handle availability (needed before signup)
-- This is a public RPC function that returns true/false without exposing user data
CREATE OR REPLACE FUNCTION check_handle_available(p_handle text)
RETURNS boolean AS $$
BEGIN
  RETURN NOT EXISTS (
    SELECT 1 FROM users WHERE handle = p_handle
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to anon role (needed for pre-signup check)
GRANT EXECUTE ON FUNCTION check_handle_available(text) TO anon;
GRANT EXECUTE ON FUNCTION check_handle_available(text) TO authenticated;
