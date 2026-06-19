# FestyVille cleanup — session summary

All 6 files below are drop-in replacements for their counterparts in the repo
(`backend/server.py`, `backend/festival_simulation.py`,
`frontend/app/index.tsx`, `frontend/app/planning.tsx`,
`frontend/src/api.ts`, `frontend/src/lib/scoring.ts`). Everything was
verified against this repo's real data, not synthetic examples — see
"Verification" at the bottom.

Two of the orphaned root-level files (`index.tsx`, `planning.tsx`, `api.ts`)
flagged last session are now deleted; they weren't part of the build and had
gone stale.

---

## What was planned vs. what was found

The original plan was three items: wire cycle goals into `/simulate`, fix
the genre-bonus casing bug, and add real cap enforcement. All three are
done. Along the way, verifying the build actually compiles surfaced two
more bugs that weren't on anyone's radar — both serious enough that they're
documented in detail below rather than just mentioned in passing.

---

## 1. GAP-2 — Cycle goals wired into `/simulate`

- `pick_cycle_goal()` no longer returns the goal's `check` lambda (it was
  being spread into `PlayerState.current_cycle_goal`, which would have
  crashed JSON serialization the instant a goal got checked).
- The goal-check itself now runs inside `/simulate`, in the one place that
  has access to the festival that just finished — not in `start_cycle`,
  where it was previously placed after a `return` statement and could never
  execute.
- New players (and any existing player who predates this field) get a
  cycle-1 goal assigned automatically, the same way `daily_challenge`
  already was.
- The completed/next goal is persisted to Mongo and returned in the
  `/simulate` response under a new `cycle_goal` key, so the frontend has
  what it needs to show a completion banner (not wired into the UI yet —
  that's the Section 8 feature, still future work).

## 2. CRIT-2 — Genre layout bonus actually fires now

Two stacked bugs, not one:

- The casing bug: `festival_simulation.py` matched genre strings like
  `"Indie"`/`"EDM"`, but every genre value in the actual game is lowercase
  (`"indie"`, `"edm"`, etc.). Fixed by normalizing to lowercase on the way
  in.
- A second bug underneath it: even with casing fixed, the function still
  expected a `"subtype"` field on buildings that doesn't exist anywhere in
  the schema. Buildings only carry `catalog_id`; category and vendor
  identity have to be resolved via `CATALOG_BY_ID`. Fixed by passing
  `CATALOG_BY_ID` into `apply_genre_bonus()` and resolving through it.
- The response previously computed `bonus_label`/`bonus_missed` internally
  and then discarded them before they reached the client. Now surfaced as
  `genre_layout_bonus` / `genre_layout_missed` in the `/simulate` response.

Confirmed live: a 2-stage Rock festival now returns `stage_score: 35`
server-side (32 from lineup boost + 3 from the bonus — verifiably not just
32), with `genre_layout_bonus: "Rock bonus applied: +3 stage score"` in the
response.

## 3. GAP-4 — Build/artist slot caps now actually enforced

Previously the caps were computed and shown in the UI, but nothing stopped
a request from exceeding them. Now:

- `book_artist` rejects a booking once `lineup.length >= artist_cap` for
  the player's phase.
- `place_building` rejects a placement once active buildings
  `>= build_cap`.
- Every state-returning endpoint (`get_state`, `place`, `unbook`,
  `advance_day`, `speedup`, `demolish`, `start_cycle`, `reset`,
  `specialization`, and `simulate`'s nested state) now wraps its response
  with `state_with_caps()`, so cap numbers are never stale.
- `PlayerState` in `api.ts` now has `build_cap` / `artist_cap` /
  `build_slots_used` / `artist_slots_used` as real (non-optional) fields.
- `index.tsx`'s client-side duplicate `SLOT_CAPS` table — a second source
  of truth that happened to agree with the server's table but had no
  mechanism keeping it that way — is deleted. The HUD now reads cap values
  straight from server state.

Verified live: booking a 3rd artist at phase 1 (cap 2) returns
`400: Artist roster full (2 max at this phase)`; placing a 5th building
(cap 4) returns the equivalent build-side error. Both error messages
surface as-is to the player via the existing alert handling in
`planning.tsx` / `index.tsx`.

## 4. POLISH-2 — `planning.tsx` offline cache

`planning.tsx` previously blocked on three parallel server calls with no
fallback — any network hiccup meant an indefinite spinner. It now follows
the same two-phase pattern `index.tsx` already used: instant hydrate from
`AsyncStorage` cache (non-blocking), then a background server sync that
degrades to an offline pill instead of hanging. This required a small
addition to `api.ts` — artists/genres weren't cached at all before, so
`loadCachedArtists()` / a matching persist call were added alongside the
existing catalog cache.

**Also fixed:** while writing this, found that the offline-degrade branch
in *both* `index.tsx`'s and `planning.tsx`'s background-sync catch blocks
read a stale closure value (`state` captured at mount, always `null`)
instead of the live state — meaning the "show offline pill instead of
hanging" path could never actually trigger even when cache hydration had
already put something on screen. Both now read the live value via a
no-op functional `setState` update.

## 5. POLISH-3 — CORS lockdown, made env-driven

`allow_origins=["*"]` combined with `allow_credentials=True` isn't just
permissive — it's invalid per the CORS spec; browsers reject a wildcard
origin when credentials are allowed, so this was already broken for any
credentialed cross-origin request. Replaced with an env-driven config:
unset `ALLOWED_ORIGINS` keeps dev open (`*`, no credentials); setting
`ALLOWED_ORIGINS=https://app.festyville.com,...` in production locks to an
explicit allowlist and enables credentials. Verified both branches.

---

## Two bugs found that weren't on the issue tracker

These came from actually trying to compile/exercise every edited file
rather than reading it — worth flagging clearly since neither was visible
from a static read-through of the handoff doc.

### A. `index.tsx`'s "Run Festival" button didn't compile

The `doRunFestival` handler called `computeScore()` with an object
(`{ gridSize, buildings, lineup, genre, allCatalog, allArtists }`) that
doesn't match the function's real signature
(`computeScore(buildings, lineup, genre, catalog)`, four positional args —
confirmed against `planning.tsx`'s correct usage of the same function). On
top of the wrong shape, it used `await` inside a `.then()` callback that
was never marked `async`, which is a hard syntax error — Babel (Metro's own
parser) rejected the file outright. **This means the core "run a festival"
flow has been non-functional since at least this build**, independent of
anything else fixed this session. Replaced with a static import and the
correct call, matching `planning.tsx`'s already-correct usage.

### B. `scoring.ts` silently disagreed with the server on two whole dimensions

- `vendor_coverage` / `utility_coverage` used `vendors.length / stages.length`
  and `utilities.length / stages.length`. The server's actual formula is
  `vendors.length / (3 * stages.length)` and `utilities.length /
  (2 * stages.length)` — full coverage needs 3 vendors and 2 utilities
  *per stage*, not 1:1. With even a single stage and a single vendor, the
  client computed 100% coverage while the server computed 33%. That gap
  alone is large enough to blow through the ±10 score-mismatch tolerance on
  most real festival layouts with any vendor/utility buildings — independent
  of bug A above, this would have been rejecting scores on its own.
- The under-construction penalty checked `b.status === "under_construction"`,
  but the actual status values (confirmed against both the Pydantic model
  and the `Building` TS type) are only ever `"building"` or `"ready"`. The
  client-side penalty was silently always 0.
- Neither of the above two bugs is the failure that blew up bug A above —
  bug A meant the file never even compiled, so none of this math was
  reachable in this build. But all three needed independent fixes, since
  bug A's fix alone would have just exposed the score-mismatch failures
  next.
- Added a faithful TypeScript port of the now-working genre layout bonus
  (`applyGenreLayoutBonus`) so the client's composite estimate doesn't drift
  out of tolerance now that the server-side bonus can actually fire. Matched
  the server's exact (if slightly inconsistent) behavior: the bonus's
  structural checks run against *all* buildings including ones still under
  construction, not just `ready` ones — that's how `server.py` actually
  calls `apply_genre_bonus()`, and matching it is what keeps the two sides
  agreeing. Worth knowing this exists if anyone later "fixes" it on one side
  without the other.

---

## Verification

- `server.py` and `festival_simulation.py`: parsed with `ast.parse`,
  imported live with `FESTYVILLE_AUTH_DISABLED=1`, and exercised end-to-end
  against an in-memory async Mongo (`mongomock_motor`) — real `book_artist`,
  `place_building`, `set_genre`, `advance_day`, and `simulate` calls, not
  mocked.
- Cap enforcement: booked/placed past the cap and confirmed the correct
  `400` with the expected message at the actual phase-1 thresholds (2
  artists, 4 buildings).
- Cycle goals: confirmed `pick_cycle_goal()` output survives
  `jsonable_encoder` + `json.dumps` for multiple cycle numbers (this is
  exactly what would have crashed before the lambda-leak fix), and that a
  completed goal's reward actually lands in `coins`/`reputation_score`.
- Genre bonus: confirmed a real 2-stage Rock scenario returns
  `stage_score: 35` (not 32) and `genre_layout_bonus: "Rock bonus applied:
  +3 stage score"` server-side.
- `index.tsx`, `planning.tsx`, `api.ts`, `scoring.ts`: every edited file
  re-parsed with both esbuild and a real Babel transform (TS + JSX presets)
  after every change — this is what caught bug A.
- Cross-check: ported `scoring.ts`'s math into standalone JS, ran it against
  five real game scenarios (genre set, artists booked, buildings placed
  through the actual server), fed the result back into `/simulate` as the
  `client_score`, and confirmed the server's composite landed within the
  ±10 tolerance in every case (diffs of 0–1).
