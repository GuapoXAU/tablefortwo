# Table for Two — Venue Tagging Rubric

This document is the source of truth for how venues in the catalogue are tagged. 
Every venue must have a `contexts` array and a `budgetTier` value. Apply the 
tests below before tagging or retagging a venue.

When tagging, the question is never "does this feel right?" — it's always 
"which clause of this document does this venue satisfy?"

---

## CONTEXTS

A venue can have one, two, or three contexts. Every venue must have at least 
one. The valid values are `partner`, `friends`, `solo`.

### `partner`

A venue earns `partner` if a couple would plausibly choose it for a date — 
romantic or casual.

**Test:** Would two people in a relationship choose this together as 
date-night activity?

**Include:**
- Dining (any quality level, casual to fine)
- Cinemas, theatres, comedy clubs, concerts
- Cocktail bars, jazz clubs, speakeasies
- Bowling, mini golf, ping pong, karting, escape rooms, axe throwing 
  (casual partner activities)
- Spas, baths, yoga
- Museums, galleries, immersive experiences
- Gardens, walks, markets, boating
- Cooking classes, pottery, wine tastings

**Exclude only if the venue is structurally group-coded:**
- Built around shared screens or large group pods (e.g. Toca Social)
- Rowdy social-bar vibe that crowds out couple interaction 
  (e.g. Boom Battle Bar)
- Stadium-scale concerts where the partner becomes incidental 
  (e.g. O2 Arena, Wembley)
- Group fitness classes (e.g. Kobox, F45)
- Anything explicitly marketed as a group / party venue

The bar to exclude is "structurally group-coded" — not "feels social" or 
"has lively atmosphere."

### `friends`

A venue earns `friends` if 2–6 friends would plausibly choose it for a 
night/day out.

**Test:** Would I suggest this to a group of friends for a Friday or 
Saturday plan?

**Include:**
- Almost everything social, active, or experiential
- Any activity bar, bowling alley, escape room, karting track
- Bars, restaurants where a group could comfortably eat together
- Comedy, concerts, theatre, cinema
- Museums and galleries (during open hours, lates)
- Sports venues, outdoor activities

**Exclude only if the venue is structurally couples-only:**
- Marketed explicitly as a date or couples experience 
  (e.g. "Couples Ritual at ESPA Life", "Romantic helicopter tour for two")
- Tasting menus or wine pairings booked only in pairs
- Romantic settings where a group of friends would feel out of place 
  (e.g. AIRE Ancient Baths Couples)
- Intimate single-table restaurants

The bar to exclude is "structurally couples-only" — not "has a romantic 
vibe." A romantic restaurant where a group could still book a table for 
six should be tagged `friends` too.

### `solo`

A venue earns `solo` if a person alone would genuinely enjoy it without 
feeling out of place.

**Test:** Would I sit here, walk through here, or do this activity alone 
for 60–90 minutes and not feel awkward?

**Include:**
- Museums, galleries, exhibitions
- Cinemas, theatres (where you can buy a single ticket)
- Cafés with good seating for solo visitors
- Bookstores, libraries
- Yoga, swimming, baths
- Walks, parks, gardens, riverside paths
- Markets (good for browsing alone)
- Late-night culture (V&A Late, museum lates)
- Independent coffee shops, matcha bars

**Exclude:**
- Activity venues that require pairs/groups (bowling, mini golf, escape 
  rooms, karting, axe throwing — you can't physically do them alone)
- Restaurants where solo dining would feel exposed 
  (tasting menus, romantic-coded fine dining)
- Anything explicitly "for two" or "for a group"
- Concerts, jazz clubs at evening hours (going to a jazz supper alone 
  is awkward)
- Stadium-scale events

A useful sub-test: would the venue's staff be surprised to seat one person? 
If yes, it's not `solo`.

---

## BUDGET TIER

Every venue must have one `budgetTier`. The valid values are `budget`, 
`mid`, `premium`, `luxury`.

Tier is determined by **average price per person**, including the typical 
spend (food + drinks if applicable, not just admission).

| Tier      | Range          | Examples                                    |
|-----------|----------------|---------------------------------------------|
| `budget`  | Under £50pp    | Padella, Dishoom, Kew Gardens, BFI cinema   |
| `mid`     | £50–£149pp     | Hakkasan, Sketch, Ronnie Scott's, The Ivy   |
| `premium` | £150–£249pp    | Core, Chiltern Firehouse, Bateaux cruise    |
| `luxury`  | £250pp+        | Bamford Wellness, Alain Ducasse, opera at   |
|           |                | Glyndebourne                                |

**Rules:**
- Use the average per-person spend a typical visitor would incur. For 
  restaurants, that's a main + drink + share of starters/sides. For 
  experiences, it's the ticket price.
- Don't tag a venue at a lower tier just because cheap items exist on 
  the menu. Hakkasan technically has a £45 lunch — but the typical 
  evening visit is £90+, so it's `mid`.
- Don't tag at a higher tier just because a venue *can* be expensive 
  (e.g. wine adds up). Use the realistic median.
- If unsure, look up actual reviews or the restaurant's prix fixe to 
  anchor the number.

---

## TAGGING WORKFLOW

When adding a new venue or retagging an existing one:

1. Read the inclusion and exclusion clauses for each tag.
2. For each context tag (partner, friends, solo), apply the test.
3. For budgetTier, anchor on real per-person spend.
4. Write a one-line justification per tag, e.g.:
   - `partner`: Casual date activity, see "bowling" in include list.
   - `friends`: Group-friendly, no couples-only exclusion applies.
   - NOT `solo`: Bowling requires a partner or group (excluded).
5. If a venue is genuinely ambiguous (the rubric doesn't decide), flag 
   it for human review instead of guessing.

---

## EXAMPLES

### Hakkasan Mayfair — `['partner']`, `mid` (£90pp)
- `partner`: Date-night-coded fine dining.
- NOT `friends`: Intimate setting, romantic Cantonese, group of 6 would 
  feel out of place.
- NOT `solo`: Solo diners would feel exposed at a romantic Michelin 
  restaurant.

### Junkyard Golf Club — `['partner', 'friends']`, `budget` (£13pp)
- `partner`: Crazy golf, casual date activity (see "mini golf" in 
  include list).
- `friends`: Group activity bar, social by design.
- NOT `solo`: You cannot physically do crazy golf alone.

### Toca Social — `['friends']`, `budget` (£25pp)
- NOT `partner`: Structurally group-coded — built around shared big-screen 
  football pods designed for groups, not pairs (matches partner exclusion).
- `friends`: Group venue, exactly what it's designed for.
- NOT `solo`: Cannot play football arcade alone, plus group-pod structure.

### Tate Modern + Thames walk — `['partner', 'friends', 'solo']`, `budget` (Free–£8pp)
- `partner`: Walk + culture date, classic London couples activity.
- `friends`: Equally good with a group, no exclusion applies.
- `solo`: Museums and walks are textbook solo activities.

### AIRE Ancient Baths couples ritual — `['partner']`, `mid` (£95pp)
- `partner`: Couples experience, romantic-coded.
- NOT `friends`: Explicitly marketed as couples-only (matches friends 
  exclusion).
- NOT `solo`: It's a couples ritual, you can't book solo.