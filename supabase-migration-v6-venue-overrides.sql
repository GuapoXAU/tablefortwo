-- Migration v6: venue_overrides table
-- Allows audit.html to override venue URLs and link statuses
-- without touching the hardcoded IDEAS catalogue in app.js

CREATE TABLE IF NOT EXISTS venue_overrides (
  slug TEXT PRIMARY KEY,
  url TEXT,
  link_status TEXT,
  notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- RLS: only admin emails can read/write
ALTER TABLE venue_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read venue_overrides"
  ON venue_overrides FOR SELECT
  USING (
    auth.jwt() ->> 'email' IN ('hayfordnathan0@gmail.com', 'admin@tablefortwo.uk')
  );

CREATE POLICY "Admin insert venue_overrides"
  ON venue_overrides FOR INSERT
  WITH CHECK (
    auth.jwt() ->> 'email' IN ('hayfordnathan0@gmail.com', 'admin@tablefortwo.uk')
  );

CREATE POLICY "Admin update venue_overrides"
  ON venue_overrides FOR UPDATE
  USING (
    auth.jwt() ->> 'email' IN ('hayfordnathan0@gmail.com', 'admin@tablefortwo.uk')
  )
  WITH CHECK (
    auth.jwt() ->> 'email' IN ('hayfordnathan0@gmail.com', 'admin@tablefortwo.uk')
  );

CREATE POLICY "Admin delete venue_overrides"
  ON venue_overrides FOR DELETE
  USING (
    auth.jwt() ->> 'email' IN ('hayfordnathan0@gmail.com', 'admin@tablefortwo.uk')
  );

-- Index for fast slug lookups
CREATE INDEX IF NOT EXISTS idx_venue_overrides_slug ON venue_overrides(slug);
