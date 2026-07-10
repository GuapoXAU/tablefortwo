-- ════════════════════════════════════════════════════════
-- Table for Two — Migration v4: Venue & Activity Data Layer
-- Run in Supabase SQL Editor
-- ════════════════════════════════════════════════════════

-- ── 1. Providers ──
-- External platforms we integrate with (OpenTable, etc.)
CREATE TABLE IF NOT EXISTS providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,          -- 'opentable', 'resy', 'designmynight'
  name text NOT NULL,                 -- 'OpenTable'
  provider_type text NOT NULL,        -- 'booking', 'ticketing', 'search'
  base_url text,                      -- 'https://www.opentable.co.uk'
  api_status text DEFAULT 'manual',   -- 'live_api', 'affiliate', 'manual', 'scrape'
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── 2. Venues ──
-- Normalized venue records — the single source of truth
CREATE TABLE IF NOT EXISTS venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,          -- 'hakkasan-mayfair'
  venue_type text NOT NULL,           -- 'restaurant', 'bar', 'theatre', 'cinema', 'gallery', 'park', 'spa', 'gym', 'club', 'other'
  category text NOT NULL,             -- maps to interests: 'dining', 'culture', 'outdoors', 'nightlife', 'wellness', 'active'

  -- Location
  area text,                          -- 'Mayfair', 'Soho', 'Shoreditch'
  area_zone text DEFAULT 'central',   -- 'central', 'local', 'anywhere'
  address text,
  lat numeric,
  lng numeric,

  -- Display
  short_description text,             -- 1-line tagline
  long_description text,              -- full writeup
  cuisine text,                       -- for restaurants: 'Chinese', 'Italian', etc.
  emoji text DEFAULT '✦',
  image_url text,
  image_urls jsonb DEFAULT '[]'::jsonb,

  -- Pricing
  price_label text,                   -- 'avg. £90pp'
  price_level integer,                -- 1-4 (budget, mid, treat, luxury)
  budget_tier text,                   -- 'budget', 'mid', 'treat', 'luxury'

  -- Attributes
  setting text DEFAULT 'indoor',      -- 'indoor', 'outdoor', 'both'
  time_fit text DEFAULT 'evening',    -- 'daytime', 'evening', 'late_night', 'any'
  duration_mins integer DEFAULT 90,
  vibes text[] DEFAULT '{}',          -- {'Candlelit', 'Walkable', 'Unique / memorable'}
  tags text[] DEFAULT '{}',           -- freeform tags for search

  -- Dietary
  veg_friendly boolean DEFAULT true,
  dietary_flags text[] DEFAULT '{}',  -- {'vegetarian', 'vegan', 'halal', 'gluten_free'}

  -- Ratings (cached from providers or manual)
  rating numeric,                     -- 4.7
  review_count integer,               -- 2100

  -- Admin
  is_active boolean DEFAULT true,
  curation_score integer DEFAULT 50,  -- 0-100, editorial quality rating
  admin_notes text,
  source text DEFAULT 'curated',      -- 'curated', 'google_places', 'opentable', 'user_submitted'
  last_verified_at timestamptz DEFAULT now(),

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── 3. Activities ──
-- Non-venue experiences (classes, tours, events)
CREATE TABLE IF NOT EXISTS activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  activity_type text NOT NULL,        -- 'class', 'tour', 'event', 'sport', 'wellness', 'adventure'
  category text NOT NULL,             -- 'culture', 'active', 'nightlife', 'wellness', 'outdoors'

  -- Location
  venue_id uuid REFERENCES venues(id) ON DELETE SET NULL, -- optional link to a venue
  area text,
  area_zone text DEFAULT 'central',
  address text,

  -- Display
  short_description text,
  long_description text,
  emoji text DEFAULT '✦',
  image_url text,

  -- Pricing
  price_label text,
  price_level integer,
  budget_tier text,

  -- Attributes
  setting text DEFAULT 'indoor',
  time_fit text DEFAULT 'any',
  duration_mins integer DEFAULT 60,
  vibes text[] DEFAULT '{}',
  tags text[] DEFAULT '{}',
  max_group_size integer,

  -- Admin
  is_active boolean DEFAULT true,
  curation_score integer DEFAULT 50,
  admin_notes text,
  source text DEFAULT 'curated',
  last_verified_at timestamptz DEFAULT now(),

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── 4. Booking Links ──
-- Maps venues/activities to their booking providers
CREATE TABLE IF NOT EXISTS booking_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid REFERENCES venues(id) ON DELETE CASCADE,
  activity_id uuid REFERENCES activities(id) ON DELETE CASCADE,
  provider_id uuid REFERENCES providers(id) ON DELETE CASCADE NOT NULL,

  booking_url text NOT NULL,
  booking_type text NOT NULL,         -- 'bookable_now', 'partner_handoff', 'details_only'
  is_verified boolean DEFAULT false,
  is_primary boolean DEFAULT true,    -- if multiple links, which is default

  -- Cached availability (optional, from API calls)
  cached_availability jsonb,
  cache_expires_at timestamptz,

  last_verified_at timestamptz DEFAULT now(),
  admin_notes text,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- At least one of venue_id or activity_id must be set
  CONSTRAINT booking_link_target CHECK (venue_id IS NOT NULL OR activity_id IS NOT NULL)
);

-- ── 5. Provider Cache ──
-- Caches raw API responses from external providers
CREATE TABLE IF NOT EXISTS provider_cache (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider_id uuid REFERENCES providers(id) ON DELETE CASCADE NOT NULL,
  cache_key text NOT NULL,            -- 'search:london:italian', 'venue:hakkasan-mayfair'
  cache_data jsonb NOT NULL,
  fetched_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL,
  hit_count integer DEFAULT 0,

  UNIQUE(provider_id, cache_key)
);

-- ── 6. Indexes ──
CREATE INDEX IF NOT EXISTS idx_venues_category ON venues(category);
CREATE INDEX IF NOT EXISTS idx_venues_budget ON venues(budget_tier);
CREATE INDEX IF NOT EXISTS idx_venues_area ON venues(area_zone);
CREATE INDEX IF NOT EXISTS idx_venues_active ON venues(is_active);
CREATE INDEX IF NOT EXISTS idx_venues_type ON venues(venue_type);
CREATE INDEX IF NOT EXISTS idx_venues_slug ON venues(slug);

CREATE INDEX IF NOT EXISTS idx_activities_category ON activities(category);
CREATE INDEX IF NOT EXISTS idx_activities_budget ON activities(budget_tier);
CREATE INDEX IF NOT EXISTS idx_activities_active ON activities(is_active);
CREATE INDEX IF NOT EXISTS idx_activities_slug ON activities(slug);

CREATE INDEX IF NOT EXISTS idx_booking_links_venue ON booking_links(venue_id);
CREATE INDEX IF NOT EXISTS idx_booking_links_activity ON booking_links(activity_id);
CREATE INDEX IF NOT EXISTS idx_booking_links_provider ON booking_links(provider_id);

CREATE INDEX IF NOT EXISTS idx_provider_cache_key ON provider_cache(provider_id, cache_key);
CREATE INDEX IF NOT EXISTS idx_provider_cache_expires ON provider_cache(expires_at);

-- ── 7. Row Level Security ──
ALTER TABLE providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_cache ENABLE ROW LEVEL SECURITY;

-- Public read access (venues are public data), write via service role only
CREATE POLICY "Venues: public read" ON venues FOR SELECT USING (true);
CREATE POLICY "Activities: public read" ON activities FOR SELECT USING (true);
CREATE POLICY "Booking links: public read" ON booking_links FOR SELECT USING (true);
CREATE POLICY "Providers: public read" ON providers FOR SELECT USING (true);
CREATE POLICY "Cache: public read" ON provider_cache FOR SELECT USING (true);

-- ── 8. Updated-at trigger ──
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER venues_updated_at BEFORE UPDATE ON venues
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER activities_updated_at BEFORE UPDATE ON activities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER booking_links_updated_at BEFORE UPDATE ON booking_links
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER providers_updated_at BEFORE UPDATE ON providers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
