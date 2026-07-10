-- ═══════════════════════════════════════════════════════════════
-- Table for Two — Migration v5: Venue & Booking Link Status
-- Run AFTER migration v4 (venues tables must exist)
-- ═══════════════════════════════════════════════════════════════

-- 1. Add venue_status to venues table
-- Values: 'active', 'temporarily_unavailable', 'permanently_closed', 'hidden'
ALTER TABLE venues ADD COLUMN IF NOT EXISTS venue_status text DEFAULT 'active';

-- 2. Add link_status to booking_links table
-- Values: 'verified', 'unverified', 'broken', 'unavailable'
ALTER TABLE booking_links ADD COLUMN IF NOT EXISTS link_status text DEFAULT 'unverified';

-- 3. Backfill from existing boolean fields
UPDATE venues SET venue_status = CASE WHEN is_active THEN 'active' ELSE 'hidden' END
WHERE venue_status IS NULL OR venue_status = 'active';

UPDATE booking_links SET link_status = CASE WHEN is_verified THEN 'verified' ELSE 'unverified' END
WHERE link_status IS NULL OR link_status = 'unverified';

-- 4. Index for filtering active venues in queries
CREATE INDEX IF NOT EXISTS idx_venues_status ON venues (venue_status);
CREATE INDEX IF NOT EXISTS idx_booking_links_status ON venues (venue_status);

-- 5. Update RLS policies to include venue_status in anon reads
-- (Existing RLS allows anon SELECT on venues — this just adds filtering convenience)
-- No policy changes needed; the app filters client-side.
