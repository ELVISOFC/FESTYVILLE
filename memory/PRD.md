# FestyVille — Festival Tycoon Prototype

A music festival tycoon mobile prototype inspired by RollerCoaster Tycoon, SimCity, and Clash of Clans — wrapped in a neon "own the night" festival aesthetic.

## Tech Stack
- Frontend: Expo Router (React Native), TypeScript, react-native-svg, AsyncStorage
- Backend: FastAPI + Motor (MongoDB)
- All visuals are programmatic SVG (no image assets)

## Implemented (MVP)

### Game systems
- **Isometric playfield**: 8×8 diamond-tile grid drawn in SVG; pseudo-3D 8-bit prism building sprites whose height/detail scales with tier (programmatic only — no images).
- **Building catalog**: 16 items across 4 categories
  - Stages (5 tiers, S–F unlock by phase): Open Mic → Grand Arch
  - Vendors: Food Truck, Drink Bar, Merch Tent, VIP Lounge
  - Utility: Restroom, First Aid, Power Generator
  - Decor: Neon Arch, Fire Pit, Laser Tower, Art Statue
- **Real-time construction timers** (server-authoritative): small builds 3–5 min, large stages up to 30 min. Live countdown badge floats above each in-progress building with a progress bar.
- **Speed-up**: tap an in-progress building to spend coins (≈10/min remaining) and finish instantly.
- **Run Festival simulation**: composite score across 5 dimensions
  - Stage Score · Crowd Flow (pairwise tile distance) · Vendor Coverage (3:1 stage) · Utility Coverage (2:1 stage) · Aesthetic (decor)
  - Unfinished-builds penalty up to −20
  - Letter grade S/A/B/C/D/F mapped from composite
- **Rewards & progression**: coins + XP per run, quadratic level curve, 10 phases gating new items (Phase = (level−1)/3 + 1, capped at 10).
- **Global leaderboard** stored in `db.leaderboard`, sorted by score desc. Player display name editable.

### UI/UX
- Dark "Electric & Neon" theme, full HUD: coin / XP / Lv·Phase / active-builds / leaderboard pills.
- Bottom-sheet build drawer with category tabs and cost + build-time cards. Locked items show phase requirement.
- Animated simulation results modal: staggered bar fills + spring-scaled letter grade with neon glow.

## Backend API (all under `/api`)
| Method | Path | Purpose |
|---|---|---|
| GET  | `/` | health |
| GET  | `/catalog` | full building catalog + grid size |
| GET  | `/state/{player_id}` | get/create player state (refreshes ready statuses) |
| POST | `/state/{player_id}/place` | place a building on x,y |
| POST | `/state/{player_id}/speedup` | pay coins to finish a build now |
| POST | `/state/{player_id}/demolish` | remove a building |
| POST | `/state/{player_id}/simulate` | run festival → grade + breakdown + rewards |
| POST | `/state/{player_id}/rename` | change display name |
| GET  | `/leaderboard` | top scores |

## Data Model (MongoDB)
- `players`: `{ player_id, name, coins, xp, level, phase, buildings:[{id, catalog_id, x, y, placed_at, ready_at, status}], last_grade, last_score, festivals_run }`
- `leaderboard`: `{ player_id, name, score, grade, timestamp }`

## Not yet implemented (deferred per scope)
- Live simulation animation (crowd movement, performer spotlight) — currently jumps straight to results.
- Multi-player rooms / asynchronous PvP.
- 25-phase content (currently 10 phase tiers, 16 base items).
- Pre-planning genre/lineup booking flow.
- Push-notification reminders when builds complete.

## Smart Business Enhancement
Speed-up timers create a **gentle coin sink** that doubles as a future **soft-currency monetization hook**: the same endpoint can swap coins for a premium gem in v2 without touching client code — the exact playbook that powers Clash of Clans' billion-dollar economy.

## Testing
- Backend: pytest 15/15 passing — `/app/backend/tests/test_festyville_api.py`
- Frontend: testing_agent_v3_expo iteration_1 — all critical flows green (tile-tap → drawer → place → timer → speedup → run festival → results → leaderboard).
