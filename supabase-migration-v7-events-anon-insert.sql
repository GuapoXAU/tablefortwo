-- Migration v7: Ensure anonymous users can insert events
-- The original schema intended this but the policy may not have been applied

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS "Events: insert" ON events;
DROP POLICY IF EXISTS "Events: read" ON events;

-- Recreate with explicit permissive policies
CREATE POLICY "Events: insert" ON events
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Events: read" ON events
  FOR SELECT
  USING (true);

-- Verify user_id allows null (it should from the schema, but confirm)
-- ALTER TABLE events ALTER COLUMN user_id DROP NOT NULL;
-- ^ Uncomment and run manually if the insert still fails

-- Test: after running this migration, this should succeed:
-- INSERT INTO events (event_type, event_data, user_id) VALUES ('test_anon_insert', '{"test": true}', null);
-- Then delete the test row:
-- DELETE FROM events WHERE event_type = 'test_anon_insert';
