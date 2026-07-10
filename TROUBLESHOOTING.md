# Table for Two — Error Troubleshooting Guide

Internal reference for beta operations. All errors are logged to both Sentry (when DSN is configured) and the Supabase `events` table as `error_state_seen` events.

## Error Types

### 1. Plan Generation Failure
- **Event:** `error_state_seen` with `context: plan_generation`
- **Where:** Discover page, after tapping Go or on page load
- **User sees:** "Something went wrong" card with Try Again button and Report Issue link
- **Common causes:**
  - Supabase venue query fails (network, RLS, table missing)
  - IDEAS object has a venue with malformed data (missing `price`, `vibes`)
  - `_classifyVenue` throws on unexpected venue format
- **Fix:** Check Supabase dashboard for query errors. Verify the `venues` table exists if migration v4 has been run. Falls back to hardcoded IDEAS if DB fails, so this error means even the fallback broke.

### 2. Booking Lookup Failure
- **Event:** `error_state_seen` with `context: booking_lookup`
- **Where:** Booking handoff overlay, when user taps Book
- **User sees:** Falls back to Google search URL silently — no broken screen
- **Common causes:**
  - Venue name has special characters that break the lookup
  - `_currentPlans` is stale or empty
- **Fix:** Check `_VENUE_BOOKING` registry. The fallback is safe — user still gets a search URL.

### 3. Venue Fetch Failure
- **Event:** `error_state_seen` with `context: venue_fetch`
- **Where:** Background, during plan generation
- **User sees:** Nothing (falls back to hardcoded venue data)
- **Common causes:**
  - Supabase connection timeout
  - `venues` table doesn't exist yet (migration not run)
  - RLS policy blocking anon reads
- **Fix:** Check Supabase → SQL Editor → run a simple `SELECT * FROM venues LIMIT 1`. If it fails, re-run migration v4.

### 4. Onboarding Save Failure
- **Event:** `error_state_seen` with `context: onboarding_save`
- **Where:** Final onboarding step, after user taps Finish
- **User sees:** Nothing — preferences saved to localStorage, just not synced to DB
- **Common causes:**
  - `users` table missing `onboarding_completed` or `preferences` columns
  - User's `_sbUserId` is null (auth sync failed)
- **Fix:** Check if migration v3 was run. Check if user has a row in `users` table.

### 5. Auth Sync Failure
- **Event:** `error_state_seen` with `context: promise` (or check console)
- **Where:** After magic link click, on page load
- **User sees:** "Working offline" toast if Supabase init fails entirely
- **Common causes:**
  - Supabase project paused (free tier)
  - Invalid anon key
  - CORS issue from wrong Site URL
- **Fix:** Check Supabase dashboard is active. Verify `_SUPABASE_URL` and `_SUPABASE_KEY` in app.js.

### 6. JavaScript Runtime Error
- **Event:** `error_state_seen` with `context: global`
- **Where:** Any page
- **User sees:** Depends on what broke. If it's in init code, entire app may be non-functional.
- **Common causes:**
  - Missing DOM element referenced by `getElementById` (usually after HTML changes)
  - Null reference in a function that assumes data exists
- **Fix:** Check the `source` field — it shows filename and line number. Most common: an HTML element was removed but the JS still references it.

## Where to Find Errors

| Location | What's there |
|---|---|
| Sentry dashboard | All errors with stack traces, user context, tags |
| Admin → Events tab | `error_state_seen` events with context and message |
| Browser console | `[T4T]` prefixed logs for all events including errors |
| Supabase → events table | Raw event rows, queryable by `event_type = 'error_state_seen'` |

## PII Handling

All error messages are scrubbed before sending:
- Email addresses → `[email]`
- @handles → `@[handle]`
- JWT tokens → `[jwt]`

User identity in Sentry is set to the anonymous ID only — no name, email, or personal data.

## Adding Sentry DSN

1. Create a project at sentry.io (Browser JavaScript)
2. Copy the DSN
3. Paste it into `app.js` line where `dsn: ''` appears in `_initSentry()`
4. Deploy — errors will start appearing in Sentry immediately
