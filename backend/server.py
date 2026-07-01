"""FestyVille backend - Festival Tycoon prototype API."""
from fastapi import FastAPI, APIRouter, HTTPException, Header, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import math
import uuid
import random
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from google.oauth2 import id_token as g_id_token
from google.auth.transport import requests as g_requests
from google.auth.exceptions import GoogleAuthError
from festival_simulation import apply_genre_bonus

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("festyville")

mongo_url = os.environ.get('MONGO_URL', 'mongodb://127.0.0.1:27017')
_db_name = os.environ.get('DB_NAME', 'festyville')

try:
    import pymongo
    _test_client = pymongo.MongoClient(mongo_url, serverSelectionTimeoutMS=1500)
    _test_client.admin.command('ping')
    _test_client.close()
    client = AsyncIOMotorClient(mongo_url)
    db = client[_db_name]
    logger.info("Connected to real MongoDB at %s", mongo_url)
except Exception as _mongo_err:
    logger.warning(
        "MongoDB not reachable (%s) — starting with in-memory mongomock. "
        "Data will NOT persist across restarts.",
        _mongo_err,
    )
    try:
        import mongomock_motor
        client = mongomock_motor.AsyncMongoMockClient()
        db = client[_db_name]
        logger.info("Using in-memory mongomock_motor database.")
    except ImportError:
        raise RuntimeError(
            "MongoDB is unreachable and mongomock-motor is not installed. "
            "Run: pip install mongomock-motor typing_extensions"
        ) from _mongo_err

app = FastAPI()
api_router = APIRouter(prefix="/api")

# ---------- Firebase ID-token verification ----------
FIREBASE_PROJECT_ID = (os.environ.get("FIREBASE_PROJECT_ID") or "").strip().strip('"').strip("'") or None
AUTH_DISABLED = os.environ.get("FESTYVILLE_AUTH_DISABLED") == "1"
_g_request = g_requests.Request()

if not FIREBASE_PROJECT_ID and not AUTH_DISABLED:
    raise RuntimeError(
        "FIREBASE_PROJECT_ID env var is required when auth is enabled. "
        "Set it to your Firebase project ID, or set FESTYVILLE_AUTH_DISABLED=1 to bypass auth (dev only)."
    )


async def require_player(
    player_id: str,
    authorization: Optional[str] = Header(None),
) -> str:
    """Verify the Firebase ID token in the Authorization header and ensure its
    UID matches the path's player_id. Returns the verified UID."""
    if AUTH_DISABLED:
        return player_id
    # Defensive: never call verify with audience=None (would skip audience check
    # and accept tokens from any Firebase project).
    if not FIREBASE_PROJECT_ID:
        raise HTTPException(503, "Auth not configured on server")
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing or malformed Authorization header")
    token = authorization.split(" ", 1)[1].strip()
    try:
        decoded = g_id_token.verify_firebase_token(token, _g_request, audience=FIREBASE_PROJECT_ID)
    except (ValueError, GoogleAuthError) as e:
        raise HTTPException(401, f"Invalid Firebase ID token: {e}")
    uid = decoded.get("sub") or decoded.get("user_id")
    if not uid:
        raise HTTPException(401, "Token missing subject claim")
    if uid != player_id:
        raise HTTPException(403, "Token UID does not match player_id")
    return uid

# ---------- Catalog ----------
CATALOG: List[Dict[str, Any]] = [
    # stages
    {"id": "stage_small",  "name": "Open Mic Stage",  "category": "stage",   "tier": 1, "cost": 200,  "build_time": 180,  "phase": 1, "score": 10, "footprint": 1, "color": "#FF0055"},
    {"id": "stage_indie",  "name": "Indie Stage",     "category": "stage",   "tier": 2, "cost": 800,  "build_time": 600,  "phase": 2, "score": 25, "footprint": 1, "color": "#FF3377"},
    {"id": "stage_edm",    "name": "EDM Megadome",    "category": "stage",   "tier": 3, "cost": 2500, "build_time": 1200, "phase": 4, "score": 60, "footprint": 1, "color": "#CC0044"},
    {"id": "stage_main",   "name": "Main Stage",      "category": "stage",   "tier": 4, "cost": 6000, "build_time": 1800, "phase": 6, "score": 100,"footprint": 1, "color": "#FF0055"},
    {"id": "stage_grand",  "name": "Grand Arch",      "category": "stage",   "tier": 5, "cost": 12000,"build_time": 1800, "phase": 8, "score": 160,"footprint": 1, "color": "#FFD700"},
    # vendors
    {"id": "food_truck",   "name": "Food Truck",      "category": "vendor",  "tier": 1, "cost": 100, "build_time": 180,  "phase": 1, "score": 5,  "footprint": 1, "color": "#FF9900"},
    {"id": "drink_bar",    "name": "Drink Bar",       "category": "vendor",  "tier": 2, "cost": 250, "build_time": 240,  "phase": 1, "score": 8,  "footprint": 1, "color": "#FFB347"},
    {"id": "merch_tent",   "name": "Merch Tent",      "category": "vendor",  "tier": 2, "cost": 400, "build_time": 300,  "phase": 2, "score": 10, "footprint": 1, "color": "#995C00"},
    {"id": "vip_lounge",   "name": "VIP Lounge",      "category": "vendor",  "tier": 4, "cost": 3000,"build_time": 1500, "phase": 5, "score": 40, "footprint": 1, "color": "#FFD700"},
    # utility
    {"id": "restroom",     "name": "Restroom",        "category": "utility", "tier": 1, "cost": 80,  "build_time": 180,  "phase": 1, "score": 4,  "footprint": 1, "color": "#00FFFF"},
    {"id": "first_aid",    "name": "First Aid",       "category": "utility", "tier": 2, "cost": 200, "build_time": 240,  "phase": 2, "score": 6,  "footprint": 1, "color": "#00CCCC"},
    {"id": "power_gen",    "name": "Power Generator", "category": "utility", "tier": 3, "cost": 600, "build_time": 420,  "phase": 3, "score": 10, "footprint": 1, "color": "#009999"},
    # decor
    {"id": "neon_arch",    "name": "Neon Arch",       "category": "decor",   "tier": 1, "cost": 60,  "build_time": 180,  "phase": 1, "score": 3,  "footprint": 1, "color": "#00FF66"},
    {"id": "fire_pit",     "name": "Fire Pit",        "category": "decor",   "tier": 2, "cost": 180, "build_time": 240,  "phase": 2, "score": 5,  "footprint": 1, "color": "#FF9900"},
    {"id": "lazer_tower",  "name": "Laser Tower",     "category": "decor",   "tier": 3, "cost": 700, "build_time": 600,  "phase": 4, "score": 12, "footprint": 1, "color": "#00FFFF"},
    {"id": "art_statue",   "name": "Art Statue",      "category": "decor",   "tier": 4, "cost": 1500,"build_time": 900,  "phase": 5, "score": 20, "footprint": 1, "color": "#FFD700"},
    # ── Specialization-exclusive buildings (spec_lock = required path) ──
    {"id": "backstage_hub",     "name": "Backstage Hub",     "category": "stage",   "tier": 3, "cost": 1800, "build_time": 900,  "phase": 1, "score": 55, "footprint": 1, "color": "#FF0055", "spec_lock": "producer"},
    {"id": "promo_truck",       "name": "Promo Truck",       "category": "vendor",  "tier": 2, "cost": 350,  "build_time": 300,  "phase": 1, "score": 12, "footprint": 1, "color": "#FF9900", "spec_lock": "promoter"},
    {"id": "solar_grid",        "name": "Solar Grid",        "category": "utility", "tier": 3, "cost": 700,  "build_time": 480,  "phase": 1, "score": 14, "footprint": 1, "color": "#00FFFF", "spec_lock": "operator"},
    {"id": "sculpture_garden",  "name": "Sculpture Garden",  "category": "decor",   "tier": 4, "cost": 1200, "build_time": 720,  "phase": 1, "score": 22, "footprint": 1, "color": "#FFD700", "spec_lock": "curator"},
]
CATALOG_BY_ID = {item["id"]: item for item in CATALOG}

GRID_SIZE = 8
DAYS_PER_CYCLE = 7

# Phase-gated grid expansion: maps phase → unlocked grid size.
# Phase 1–2 → 8×8, Phase 3–4 → 9×9, Phase 5–6 → 10×10, Phase 7+ → 11×11.
PHASE_TO_GRID_SIZE: Dict[int, int] = {1: 8, 2: 8, 3: 9, 4: 9, 5: 10, 6: 10}
VISUAL_GRID_MAX = 11  # absolute ceiling (Phase 7+)


def get_grid_size_for_phase(phase: int) -> int:
    return PHASE_TO_GRID_SIZE.get(phase, VISUAL_GRID_MAX)

GENRES = [
    {"id": "edm",     "label": "EDM Blowout"},
    {"id": "indie",   "label": "Indie / Folk"},
    {"id": "hiphop",  "label": "Hip-Hop Block"},
    {"id": "rock",    "label": "Rock Revival"},
    {"id": "mixed",   "label": "Mixed Genre"},
]

ARTISTS: List[Dict[str, Any]] = [
    # EDM
    {"id": "glow_riot",   "name": "Glow Riot",    "genre": "edm",    "tier": 1, "fee": 150,  "boost": 8,  "phase": 1},
    {"id": "pulse_drop",  "name": "Pulse Drop",   "genre": "edm",    "tier": 2, "fee": 450,  "boost": 18, "phase": 2},
    {"id": "neon_wolves", "name": "Neon Wolves",  "genre": "edm",    "tier": 3, "fee": 1200, "boost": 38, "phase": 5},
    # Indie/Folk
    {"id": "velvet_echo", "name": "Velvet Echo",  "genre": "indie",  "tier": 1, "fee": 150,  "boost": 8,  "phase": 1},
    {"id": "paper_lant",  "name": "Paper Lanterns","genre": "indie", "tier": 2, "fee": 450,  "boost": 18, "phase": 2},
    {"id": "static_blm",  "name": "Static Bloom", "genre": "indie",  "tier": 3, "fee": 1200, "boost": 38, "phase": 5},
    # Hip-Hop
    {"id": "blk_captain", "name": "Block Captain","genre": "hiphop", "tier": 1, "fee": 150,  "boost": 8,  "phase": 1},
    {"id": "verse_808",   "name": "Verse 808",    "genre": "hiphop", "tier": 2, "fee": 450,  "boost": 18, "phase": 2},
    {"id": "throne_heir", "name": "Throne Heir",  "genre": "hiphop", "tier": 3, "fee": 1200, "boost": 38, "phase": 5},
    # Rock
    {"id": "river_holw",  "name": "River Hollow", "genre": "rock",   "tier": 1, "fee": 150,  "boost": 8,  "phase": 1},
    {"id": "ember_trail", "name": "Ember Trail",  "genre": "rock",   "tier": 2, "fee": 450,  "boost": 18, "phase": 2},
    {"id": "iron_choir",  "name": "Iron Choir",   "genre": "rock",   "tier": 3, "fee": 1200, "boost": 38, "phase": 5},
]
ARTISTS_BY_ID = {a["id"]: a for a in ARTISTS}

# ---------- Genre Chemistry ----------
# Pairwise compatibility 0–1 between any two genres. Symmetric.
# Mirrors GENRE_COMPATIBILITY in frontend/src/lib/scoring.ts — keep in sync.
GENRE_COMPATIBILITY: Dict[str, Dict[str, float]] = {
    "indie":  {"indie": 1.0, "rock": 0.8, "pop": 0.6, "edm": 0.3, "hiphop": 0.4},
    "edm":    {"edm": 1.0, "hiphop": 0.7, "pop": 0.5, "indie": 0.3, "rock": 0.3},
    "hiphop": {"hiphop": 1.0, "edm": 0.7, "pop": 0.7, "indie": 0.4, "rock": 0.3},
    "rock":   {"rock": 1.0, "indie": 0.8, "pop": 0.4, "edm": 0.3, "hiphop": 0.3},
    "pop":    {"pop": 1.0, "indie": 0.6, "hiphop": 0.7, "edm": 0.5, "rock": 0.4},
}

def compute_chemistry(lineup_genres: List[str]) -> float:
    """Average pairwise genre compatibility × 10 → 0–10 bonus."""
    if len(lineup_genres) < 2:
        return 0.0
    total = 0.0
    pairs = 0
    for i in range(len(lineup_genres)):
        for j in range(i + 1, len(lineup_genres)):
            total += GENRE_COMPATIBILITY.get(lineup_genres[i], {}).get(lineup_genres[j], 0.0)
            pairs += 1
    return (total / pairs) * 10 if pairs > 0 else 0.0

# ---------- Side Characters ----------
CHARACTERS: List[Dict[str, Any]] = [
    {"id": "sky",   "name": "Sky",   "role": "PR Manager",     "emoji": "📣", "color": "#FF9900"},
    {"id": "vault", "name": "Vault", "role": "Finance Wizard", "emoji": "💰", "color": "#FFD700"},
    {"id": "marcy", "name": "Marcy", "role": "Merch Queen",    "emoji": "👑", "color": "#FF0055"},
    {"id": "baz",   "name": "DJ Baz","role": "Stage Director", "emoji": "🎧", "color": "#00FFFF"},
    {"id": "frank", "name": "Frank", "role": "Health Inspector","emoji": "🏥","color": "#00FF66"},
    {"id": "axle",  "name": "Axle",  "role": "Site Foreman",   "emoji": "🔧", "color": "#9966FF"},
]
CHARACTERS_BY_ID = {c["id"]: c for c in CHARACTERS}

# ---------- Micro Events (30 events attributed to characters) ----------
MICRO_EVENTS: List[Dict[str, Any]] = [
    # Sky — PR & buzz
    {"text": "Local press buzz lifts hype",              "coins": 80,  "xp": 10, "character_id": "sky"},
    {"text": "Influencer scouting tour visits",           "coins": 60,  "xp": 15, "character_id": "sky"},
    {"text": "Radio interview lands a sponsor",           "coins": 150, "xp": 12, "character_id": "sky"},
    {"text": "Ticket pre-sales spike!",                   "coins": 200, "xp": 8,  "character_id": "sky"},
    {"text": "Viral post sends hype meter off the charts","coins": 120, "xp": 20, "character_id": "sky"},
    {"text": "Food blog gives 5-star preview write-up",   "coins": 130, "xp": 12, "character_id": "sky"},
    {"text": "Celeb spotted in the crowd — instant buzz", "coins": 170, "xp": 10, "character_id": "sky"},
    # Vault — finance & deals
    {"text": "Crew finds discount lumber",               "coins": 120, "xp": 5,  "character_id": "vault"},
    {"text": "Last-minute sponsor deal signed",           "coins": 250, "xp": 10, "character_id": "vault"},
    {"text": "Insurance refund arrives",                  "coins": 90,  "xp": 5,  "character_id": "vault"},
    {"text": "Equipment lease renegotiated cheaply",      "coins": 140, "xp": 8,  "character_id": "vault"},
    {"text": "Tax break approved for local event",        "coins": 180, "xp": 6,  "character_id": "vault"},
    {"text": "VIP ticket upgrade upsell works",           "coins": 220, "xp": 8,  "character_id": "vault"},
    {"text": "Crowdfunding stretch goal hit!",            "coins": 300, "xp": 15, "character_id": "vault"},
    # Marcy — merch
    {"text": "Limited merch drop sells out instantly",   "coins": 130, "xp": 12, "character_id": "marcy"},
    {"text": "Collab with local artist boosts merch",    "coins": 100, "xp": 15, "character_id": "marcy"},
    {"text": "Vintage merch found at discount",          "coins": 70,  "xp": 8,  "character_id": "marcy"},
    {"text": "Flash sale generates massive queue",       "coins": 160, "xp": 10, "character_id": "marcy"},
    # Baz — stage & sound
    {"text": "Sound engineers arrive early — setup bonus","coins": 80, "xp": 18, "character_id": "baz"},
    {"text": "Stage lighting upgraded for free",         "coins": 50,  "xp": 20, "character_id": "baz"},
    {"text": "Secret surprise performance locked in",    "coins": 110, "xp": 25, "character_id": "baz"},
    {"text": "Monitor mix perfected — crowd will love it","coins": 60,  "xp": 22, "character_id": "baz"},
    # Frank — health & safety
    {"text": "Health inspection passed with flying colors","coins": 80,"xp": 10, "character_id": "frank"},
    {"text": "Extra med kit donated by a local clinic",  "coins": 40,  "xp": 12, "character_id": "frank"},
    {"text": "Safety audit: zero violations!",           "coins": 100, "xp": 15, "character_id": "frank"},
    {"text": "Paramedic crew volunteers for free",       "coins": 60,  "xp": 18, "character_id": "frank"},
    # Axle — construction & site
    {"text": "Crew works overtime — build bonus earned", "coins": 90,  "xp": 10, "character_id": "axle"},
    {"text": "Scaffold recycled — materials saved",      "coins": 110, "xp": 8,  "character_id": "axle"},
    {"text": "Perfect weather forecast for setup",       "coins": 40,  "xp": 20, "character_id": "axle"},
    {"text": "Gear delivery arrives ahead of schedule",  "coins": 70,  "xp": 14, "character_id": "axle"},
]

# ---------- Achievements ----------
ACHIEVEMENTS: List[Dict[str, Any]] = [
    {"id": "first_build",    "name": "Ground Breaker",      "desc": "Place your first building",          "emoji": "🏗️"},
    {"id": "stage_debut",    "name": "Stage Debut",          "desc": "Place your first stage",             "emoji": "🎤"},
    {"id": "full_house",     "name": "Full House",           "desc": "Have 5 ready buildings at once",     "emoji": "🏟️"},
    {"id": "first_festival", "name": "Festival Starter",     "desc": "Run your first festival",            "emoji": "🎪"},
    {"id": "grade_a",        "name": "A-Lister",             "desc": "Score an A or S grade",              "emoji": "⭐"},
    {"id": "grade_s",        "name": "Legendary",            "desc": "Score a perfect S grade",            "emoji": "🏆"},
    {"id": "genre_pure",     "name": "Genre Master",         "desc": "Run a pure-genre festival",          "emoji": "🎵"},
    {"id": "mixed_bag",      "name": "Mixed Bag",            "desc": "Mixed festival with 3+ genres",      "emoji": "🎶"},
    {"id": "triple_lineup",  "name": "Triple Threat",        "desc": "Book 3 or more artists",             "emoji": "🎸"},
    {"id": "speed_demon",    "name": "Speed Demon",          "desc": "Speed up a building",                "emoji": "⚡"},
    {"id": "cycle_3",        "name": "Seasoned Organizer",   "desc": "Reach Cycle 3",                      "emoji": "📅"},
    {"id": "phase_2",        "name": "Rising Promoter",      "desc": "Reach Phase 2",                      "emoji": "📈"},
    {"id": "minigame_ace",   "name": "Mini-Game Ace",        "desc": "Score 4+ rounds in Sound Check",     "emoji": "🎮"},
]
ACHIEVEMENTS_BY_ID = {a["id"]: a for a in ACHIEVEMENTS}

# ---------- Milestones ----------
# Long-term progression layer awarded after a festival simulation. Each
# entry is checked at most once per player; once the id is in
# state.milestone_ids it never fires again. reward_rep is reputation points
# (currency-of-prestige) granted on first unlock.
MILESTONES: List[Dict[str, Any]] = [
    {"id": "ms_first_festival", "name": "First Festival",   "desc": "Run your very first festival",                  "emoji": "🎪", "reward_rep": 10},
    {"id": "ms_five_events",    "name": "Veteran Promoter", "desc": "Run 5 festivals",                               "emoji": "🎟️", "reward_rep": 25},
    {"id": "ms_ten_events",     "name": "Festival Circuit", "desc": "Run 10 festivals",                              "emoji": "🌟", "reward_rep": 50},
    {"id": "ms_first_a_grade",  "name": "Top Billing",      "desc": "Earn your first A grade or better",             "emoji": "🅰️", "reward_rep": 20},
    {"id": "ms_first_s_grade",  "name": "Headliner",        "desc": "Earn a perfect S grade",                        "emoji": "🏆", "reward_rep": 60},
    {"id": "ms_three_artists",  "name": "Booker",           "desc": "Book 3 artists in a single festival",           "emoji": "🎤", "reward_rep": 15},
    {"id": "ms_perfect_crowd",  "name": "Crowd Whisperer",  "desc": "Achieve perfect crowd flow in a festival",      "emoji": "👥", "reward_rep": 30},
    {"id": "ms_pure_genre",     "name": "Purist",           "desc": "Run a pure-genre festival",                     "emoji": "🎵", "reward_rep": 20},
    {"id": "ms_local_tier",     "name": "Local Hero",       "desc": "Reach the Local tier (Phase 2)",                "emoji": "🏘️", "reward_rep": 25},
    {"id": "ms_regional_tier",  "name": "Regional Star",    "desc": "Reach the Regional tier (Phase 3)",             "emoji": "🏙️", "reward_rep": 40},
]
MILESTONES_BY_ID = {m["id"]: m for m in MILESTONES}

def check_milestones(state: Dict[str, Any], context: Dict[str, Any]) -> List[str]:
    """Return list of milestone ids newly earned this simulate(). Each id fires once."""
    earned = set(state.get("milestone_ids", []))
    new_ids: List[str] = []

    def unlock(mid: str):
        if mid not in earned:
            new_ids.append(mid)
            earned.add(mid)

    festivals = state.get("festivals_run", 0)
    grade = context.get("grade")
    phase = state.get("phase", 1)

    if festivals >= 1:                          unlock("ms_first_festival")
    if festivals >= 5:                          unlock("ms_five_events")
    if festivals >= 10:                         unlock("ms_ten_events")
    if grade in ("A", "S"):                     unlock("ms_first_a_grade")
    if grade == "S":                            unlock("ms_first_s_grade")
    if context.get("lineup_size", 0) >= 3:      unlock("ms_three_artists")
    if context.get("crowd_flow_raw", 0) >= 100: unlock("ms_perfect_crowd")
    if context.get("genre_pure"):               unlock("ms_pure_genre")
    if phase >= 2:                              unlock("ms_local_tier")
    if phase >= 3:                              unlock("ms_regional_tier")

    return new_ids

# ---------- Daily Challenges ----------
DAILY_CHALLENGES: List[Dict[str, Any]] = [
    {"id": "book_artist",   "text": "Book at least 1 artist this cycle",    "target": "lineup_min_1",   "coins": 200, "xp": 30},
    {"id": "book_2",        "text": "Book 2 or more artists",               "target": "lineup_min_2",   "coins": 350, "xp": 50},
    {"id": "place_vendor",  "text": "Place a vendor building",              "target": "has_vendor",     "coins": 150, "xp": 20},
    {"id": "decor_2",       "text": "Add at least 2 decor pieces",          "target": "decor_min_2",    "coins": 120, "xp": 25},
    {"id": "play_minigame", "text": "Play a mini game this cycle",          "target": "minigame_played","coins": 100, "xp": 15},
    {"id": "pure_genre",    "text": "Pick a non-mixed festival genre",      "target": "has_pure_genre", "coins": 180, "xp": 20},
    {"id": "power_up",      "text": "Build a Power Generator",              "target": "has_power_gen",  "coins": 200, "xp": 25},
]

# ---------- Models ----------
class Building(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    catalog_id: str
    x: int
    y: int
    placed_at: float
    ready_at: float
    status: str = "building"

class PlayerState(BaseModel):
    player_id: str
    name: str = "Festival Boss"
    coins: int = 1500
    xp: int = 0
    level: int = 1
    phase: int = 1
    grid_size: int = GRID_SIZE
    buildings: List[Building] = []
    last_grade: Optional[str] = None
    last_score: int = 0
    festivals_run: int = 0
    cycle: int = 1
    day: int = 1
    genre: Optional[str] = None
    lineup: List[str] = []
    day_log: List[Dict[str, Any]] = []
    achievements: List[str] = []
    # Milestone ids the player has earned (each fires once, ever)
    milestone_ids: List[str] = []
    # Legacy / reputation layer — accumulates across every festival
    reputation_score: int = 0
    legacy_tier: str = "unknown"
    genre_identity: Optional[str] = None
    # Specialization path chosen once at save-start — persists forever on this save.
    specialization: Optional[str] = None
    daily_challenge: Optional[Dict[str, Any]] = None
    minigame_last: str = ""
    streak: int = 0
    # Per-genre affinity 0.0–∞: accumulates 0.05 × (composite/100) every festival
    # the player runs in that genre. Used for future bookings/events tuning.
    genre_affinity: Dict[str, float] = Field(
        default_factory=lambda: {"indie": 0.0, "edm": 0.0, "hiphop": 0.0, "rock": 0.0, "pop": 0.0}
    )
    current_cycle_goal: Optional[Dict[str, Any]] = None
    created_at: float = Field(default_factory=lambda: datetime.now(timezone.utc).timestamp())

class PlaceRequest(BaseModel):
    catalog_id: str
    x: int
    y: int

class SpeedupRequest(BaseModel):
    building_id: str

class LeaderboardEntry(BaseModel):
    player_id: str
    name: str
    score: int
    grade: str
    timestamp: float

class ScoreBreakdownIn(BaseModel):
    """Client-submitted score breakdown (weighted dimension values)."""
    stage_score: float = 0       # weighted 0–30
    crowd_flow: float = 0        # weighted 0–20
    vendor_coverage: float = 0   # weighted 0–20
    utility_coverage: float = 0  # weighted 0–15
    aesthetic: float = 0         # weighted 0–15
    chemistry_bonus: float = 0   # 0–10 lineup chemistry
    composite: float = 0         # final 0–120

class SimulateRequest(BaseModel):
    client_score: ScoreBreakdownIn

# ---------- Helpers ----------
def now_ts() -> float:
    return datetime.now(timezone.utc).timestamp()

def refresh_buildings(state: Dict[str, Any]) -> Dict[str, Any]:
    t = now_ts()
    for b in state.get("buildings", []):
        if b.get("status") == "building" and b.get("ready_at", 0) <= t:
            b["status"] = "ready"
    return state

def xp_for_level(level: int) -> int:
    return 100 * level * level

def compute_phase(level: int) -> int:
    return min(10, max(1, (level - 1) // 3 + 1))

def grade_from_score(score: int) -> str:
    if score >= 90: return "S"
    if score >= 80: return "A"
    if score >= 65: return "B"
    if score >= 50: return "C"
    if score >= 35: return "D"
    return "F"

# ---------- Legacy / Reputation ----------
# Cumulative reputation thresholds → tier label. derive_tier() is monotonic:
# once earned, a tier should not regress (reputation_score never decreases).
LEGACY_TIERS: Dict[str, int] = {
    "unknown":   0,
    "local":     500,
    "regional":  2000,
    "national":  5000,
    "legendary": 10000,
}

def derive_tier(score: int) -> str:
    if score >= 10000: return "legendary"
    if score >= 5000:  return "national"
    if score >= 2000:  return "regional"
    if score >= 500:   return "local"
    return "unknown"

SLOT_CAPS = {
    1: {"build": 4,  "artist": 2},
    2: {"build": 6,  "artist": 3},
    3: {"build": 9,  "artist": 4},
    4: {"build": 12, "artist": 5},
}

def get_caps(phase: int) -> dict:
    return SLOT_CAPS.get(phase, SLOT_CAPS[4])

def state_with_caps(state: dict) -> dict:
    phase = state.get("phase", 1)
    caps = get_caps(phase)
    active = sum(1 for b in state.get("buildings", []) if b.get("status") != "destroyed")
    booked = len(state.get("lineup", []))
    grid_size = get_grid_size_for_phase(phase)
    state["grid_size"] = grid_size
    return {**state, "build_cap": caps["build"], "artist_cap": caps["artist"],
            "build_slots_used": active, "artist_slots_used": booked,
            "grid_size": grid_size}

GOALS = {
    "infra": [
        {"id": "infra_1", "type": "infra",
         "label": "Build at least 2 vendor buildings.",
         "check": lambda s: sum(1 for b in s.get("buildings", [])
             if CATALOG_BY_ID.get(b.get("catalog_id", ""), {}).get("category") == "vendor") >= 2,
         "reward": {"coins": 500}, "reward_label": "+500 coins"},
        {"id": "infra_2", "type": "infra",
         "label": "Have 2 utility buildings active.",
         "check": lambda s: sum(1 for b in s.get("buildings", [])
             if b.get("status") == "ready" and
             CATALOG_BY_ID.get(b.get("catalog_id", ""), {}).get("category") == "utility") >= 2,
         "reward": {"coins": 400}, "reward_label": "+400 coins"},
    ],
    "lineup": [
        {"id": "lineup_1", "type": "lineup",
         "label": "Book a National tier artist.",
         "check": lambda s: any(ARTISTS_BY_ID.get(a, {}).get("tier", 0) >= 3
             for a in s.get("lineup", [])),
         "reward": {"reputation": 300}, "reward_label": "+300 reputation"},
        {"id": "lineup_2", "type": "lineup",
         "label": "Book 2 artists from the same genre.",
         "check": lambda s: len([g for g in
             [ARTISTS_BY_ID.get(a, {}).get("genre") for a in s.get("lineup", [])]
             if g]) != len(set([g for g in
             [ARTISTS_BY_ID.get(a, {}).get("genre") for a in s.get("lineup", [])]
             if g])),
         "reward": {"coins": 200, "reputation": 200},
         "reward_label": "+200 coins +200 reputation"},
    ],
    "score": [
        {"id": "score_1", "type": "score",
         "label": "Score an A grade or higher.",
         "check": lambda s: s.get("last_grade") in ["A", "S"],
         "reward": {"coin_multiplier": 2.0}, "reward_label": "2x coin earnings"},
        {"id": "score_2", "type": "score",
         "label": "Score 80+ composite.",
         "check": lambda s: s.get("last_score", 0) >= 80,
         "reward": {"reputation": 400}, "reward_label": "+400 reputation"},
    ],
    "genre": [
        {"id": "genre_edm", "type": "genre",
         "label": "Run a pure EDM festival.",
         "check": lambda s: s.get("genre") == "edm" and
             all(ARTISTS_BY_ID.get(a, {}).get("genre") == "edm"
                 for a in s.get("lineup", [])),
         "reward": {"genre_affinity_bonus": 0.2}, "reward_label": "+0.2 EDM affinity"},
        {"id": "genre_indie", "type": "genre",
         "label": "Run a pure Indie festival.",
         "check": lambda s: s.get("genre") == "indie" and
             all(ARTISTS_BY_ID.get(a, {}).get("genre") == "indie"
                 for a in s.get("lineup", [])),
         "reward": {"genre_affinity_bonus": 0.2}, "reward_label": "+0.2 Indie affinity"},
    ],
}

def pick_cycle_goal(player_id: str, cycle_number: int) -> dict:
    goal_types = ["infra", "lineup", "score", "genre"]
    selected_type = goal_types[cycle_number % 4]
    random.seed(f"{player_id}_{cycle_number}")
    goal_def = random.choice(GOALS[selected_type])
    # Only return client-safe, JSON-serializable fields. The goal_def itself also
    # carries a "check" lambda and an internal "reward" dict — neither should ever
    # reach state/the response. (A previous version spread goal_def directly into
    # this return value, which meant the lambda landed in PlayerState.current_cycle_goal
    # and crashed JSON serialization the moment that endpoint's response was built.)
    return {
        "id": goal_def["id"],
        "type": goal_def["type"],
        "label": goal_def["label"],
        "reward_label": goal_def["reward_label"],
        "completed": False,
    }

def apply_goal_reward(state: dict, reward: dict) -> dict:
    state["coins"] = state.get("coins", 0) + reward.get("coins", 0)
    state["reputation_score"] = state.get("reputation_score", 0) + reward.get("reputation", 0)
    if "genre_affinity_bonus" in reward and state.get("genre"):
        genre = state["genre"]
        state.setdefault("genre_affinity", {})
        state["genre_affinity"][genre] = min(1.0,
            state["genre_affinity"].get(genre, 0.0) + reward["genre_affinity_bonus"])
    return state



# Star rating derived from letter grade. S=5 ★ … F=0 ★
GRADE_STARS: Dict[str, int] = {"S": 5, "A": 4, "B": 3, "C": 2, "D": 1, "F": 0}

def star_rating_for(grade: str) -> int:
    return GRADE_STARS.get(grade, 0)

def assign_daily_challenge(cycle: int) -> Dict[str, Any]:
    idx = (cycle - 1) % len(DAILY_CHALLENGES)
    ch = dict(DAILY_CHALLENGES[idx])
    ch["completed"] = False
    return ch

def check_challenge_complete(state: Dict[str, Any]) -> bool:
    ch = state.get("daily_challenge")
    if not ch or ch.get("completed"):
        return False
    target = ch.get("target", "")
    buildings = state.get("buildings", [])
    lineup = state.get("lineup", [])
    if target == "lineup_min_1":
        return len(lineup) >= 1
    if target == "lineup_min_2":
        return len(lineup) >= 2
    if target == "has_vendor":
        return any(CATALOG_BY_ID.get(b["catalog_id"], {}).get("category") == "vendor" for b in buildings)
    if target == "decor_min_2":
        return sum(1 for b in buildings if CATALOG_BY_ID.get(b["catalog_id"], {}).get("category") == "decor") >= 2
    if target == "minigame_played":
        last = state.get("minigame_last", "")
        return last.startswith(f"{state.get('cycle', 1)}_")
    if target == "has_pure_genre":
        genre = state.get("genre")
        return bool(genre and genre != "mixed")
    if target == "has_power_gen":
        return any(b["catalog_id"] == "power_gen" for b in buildings)
    return False

def check_achievements(state: Dict[str, Any], context: Dict[str, Any] = {}) -> List[str]:
    already = set(state.get("achievements", []))
    new_unlocks = []

    def unlock(aid: str):
        if aid not in already:
            new_unlocks.append(aid)
            already.add(aid)

    buildings = state.get("buildings", [])
    ready = [b for b in buildings if b.get("status") == "ready"]

    if buildings:
        unlock("first_build")
    if any(CATALOG_BY_ID.get(b["catalog_id"], {}).get("category") == "stage" for b in buildings):
        unlock("stage_debut")
    if len(ready) >= 5:
        unlock("full_house")
    if state.get("festivals_run", 0) > 0:
        unlock("first_festival")
    if state.get("last_grade") in ("A", "S"):
        unlock("grade_a")
    if state.get("last_grade") == "S":
        unlock("grade_s")
    if state.get("phase", 1) >= 2:
        unlock("phase_2")
    if len(state.get("lineup", [])) >= 3:
        unlock("triple_lineup")
    if state.get("cycle", 1) >= 3:
        unlock("cycle_3")

    grade = context.get("grade")
    if grade in ("A", "S"):
        unlock("grade_a")
    if grade == "S":
        unlock("grade_s")
    if context.get("genre_pure"):
        unlock("genre_pure")
    if context.get("mixed_bag"):
        unlock("mixed_bag")
    if context.get("speed_demon"):
        unlock("speed_demon")
    if context.get("minigame_ace"):
        unlock("minigame_ace")

    return new_unlocks

async def get_or_create_state(player_id: str) -> Dict[str, Any]:
    doc = await db.players.find_one({"player_id": player_id}, {"_id": 0})
    if not doc:
        s = PlayerState(player_id=player_id)
        await db.players.insert_one(s.model_dump())
        doc = s.model_dump()
    defaults = {
        "cycle": 1, "day": 1, "genre": None, "lineup": [], "day_log": [],
        "achievements": [], "milestone_ids": [],
        "daily_challenge": None, "minigame_last": "", "streak": 0,
        "genre_affinity": {"indie": 0.0, "edm": 0.0, "hiphop": 0.0, "rock": 0.0, "pop": 0.0},
        "reputation_score": 0, "legacy_tier": "unknown", "genre_identity": None,
        "specialization": None,
    }
    missing = {k: v for k, v in defaults.items() if k not in doc}
    if missing:
        doc.update(missing)
        await db.players.update_one({"player_id": player_id}, {"$set": missing})

    # If a legacy save has reputation_score but no/stale legacy_tier, derive it.
    rep = int(doc.get("reputation_score", 0) or 0)
    correct_tier = derive_tier(rep)
    if doc.get("legacy_tier") != correct_tier:
        doc["legacy_tier"] = correct_tier
        await db.players.update_one(
            {"player_id": player_id}, {"$set": {"legacy_tier": correct_tier}}
        )
    if not doc.get("daily_challenge"):
        doc["daily_challenge"] = assign_daily_challenge(doc.get("cycle", 1))
        await db.players.update_one(
            {"player_id": player_id},
            {"$set": {"daily_challenge": doc["daily_challenge"]}}
        )
    if not doc.get("current_cycle_goal"):
        doc["current_cycle_goal"] = pick_cycle_goal(player_id, doc.get("cycle", 1))
        await db.players.update_one(
            {"player_id": player_id},
            {"$set": {"current_cycle_goal": doc["current_cycle_goal"]}}
        )
    doc = refresh_buildings(doc)
    await db.players.update_one({"player_id": player_id}, {"$set": {"buildings": doc["buildings"]}})
    return doc

# ---------- Routes ----------
@api_router.get("/")
async def root():
    return {"app": "FestyVille", "status": "ok"}

@api_router.get("/catalog")
async def get_catalog():
    return {"catalog": CATALOG, "grid_size": GRID_SIZE, "days_per_cycle": DAYS_PER_CYCLE}

@api_router.get("/artists")
async def get_artists():
    return {"artists": ARTISTS, "genres": GENRES}

@api_router.get("/characters")
async def get_characters():
    return {"characters": CHARACTERS, "achievements": ACHIEVEMENTS}

@api_router.post("/state/{player_id}/set_genre", dependencies=[Depends(require_player)])
async def set_genre(player_id: str, body: Dict[str, str]):
    state = await get_or_create_state(player_id)
    genre = (body.get("genre") or "").strip()
    if genre and genre not in {g["id"] for g in GENRES}:
        raise HTTPException(400, "Unknown genre")
    state["genre"] = genre or None
    if genre and genre != "mixed":
        state["lineup"] = [aid for aid in state["lineup"] if ARTISTS_BY_ID.get(aid, {}).get("genre") == genre]
    await db.players.update_one(
        {"player_id": player_id},
        {"$set": {"genre": state["genre"], "lineup": state["lineup"]}}
    )
    state["server_time"] = now_ts()
    return state_with_caps(state)

@api_router.post("/state/{player_id}/book_artist", dependencies=[Depends(require_player)])
async def book_artist(player_id: str, body: Dict[str, str]):
    state = await get_or_create_state(player_id)
    aid = body.get("artist_id", "")
    artist = ARTISTS_BY_ID.get(aid)
    if not artist:
        raise HTTPException(404, "Unknown artist")
    if artist["phase"] > state["phase"]:
        raise HTTPException(400, f"Locked. Reach phase {artist['phase']}.")
    if state["genre"] and state["genre"] != "mixed" and artist["genre"] != state["genre"]:
        raise HTTPException(400, "Artist genre doesn't match festival genre")
    if aid in state["lineup"]:
        raise HTTPException(400, "Already booked")
    artist_cap = get_caps(state["phase"])["artist"]
    if len(state["lineup"]) >= artist_cap:
        raise HTTPException(400, f"Artist roster full ({artist_cap} max at this phase)")
    if state["coins"] < artist["fee"]:
        raise HTTPException(400, "Not enough coins to pay fee")
    state["coins"] -= artist["fee"]
    state["lineup"].append(aid)

    new_ach = check_achievements(state)
    if new_ach:
        state.setdefault("achievements", []).extend(new_ach)
        state["achievements"] = list(set(state["achievements"]))

    await db.players.update_one(
        {"player_id": player_id},
        {"$set": {"coins": state["coins"], "lineup": state["lineup"], "achievements": state["achievements"]}}
    )
    state["server_time"] = now_ts()
    state["new_achievements"] = [ACHIEVEMENTS_BY_ID[a] for a in new_ach if a in ACHIEVEMENTS_BY_ID]
    return state_with_caps(state)

@api_router.post("/state/{player_id}/unbook_artist", dependencies=[Depends(require_player)])
async def unbook_artist(player_id: str, body: Dict[str, str]):
    state = await get_or_create_state(player_id)
    aid = body.get("artist_id", "")
    if aid not in state["lineup"]:
        raise HTTPException(404, "Not in lineup")
    state["lineup"].remove(aid)
    artist = ARTISTS_BY_ID.get(aid)
    if artist:
        state["coins"] += artist["fee"] // 2
    await db.players.update_one(
        {"player_id": player_id},
        {"$set": {"coins": state["coins"], "lineup": state["lineup"]}}
    )
    state["server_time"] = now_ts()
    return state_with_caps(state)

@api_router.post("/state/{player_id}/advance_day", dependencies=[Depends(require_player)])
async def advance_day(player_id: str):
    state = await get_or_create_state(player_id)
    if state["day"] >= DAYS_PER_CYCLE:
        raise HTTPException(400, "Already on festival day. Run the festival!")
    if state["day"] == 1 and not state["genre"]:
        raise HTTPException(400, "Pick a genre before ending Day 1")

    ev = random.choice(MICRO_EVENTS)
    state["day"] += 1
    state["coins"] += ev["coins"]
    state["xp"] += ev["xp"]
    state["streak"] = state.get("streak", 0) + 1

    # Streak bonus every 3 days
    streak_bonus_coins = 0
    streak_bonus_xp = 0
    if state["streak"] > 0 and state["streak"] % 3 == 0:
        streak_bonus_coins = 100
        streak_bonus_xp = 20
        state["coins"] += streak_bonus_coins
        state["xp"] += streak_bonus_xp

    while state["xp"] >= xp_for_level(state["level"]):
        state["level"] += 1
    state["phase"] = compute_phase(state["level"])

    log_entry = {
        "day": state["day"],
        "text": ev["text"],
        "coins": ev["coins"] + streak_bonus_coins,
        "xp": ev["xp"] + streak_bonus_xp,
        "character_id": ev.get("character_id"),
        "streak_bonus": streak_bonus_coins > 0,
    }
    state["day_log"].append(log_entry)
    state["day_log"] = state["day_log"][-20:]

    new_ach = check_achievements(state)
    if new_ach:
        state.setdefault("achievements", []).extend(new_ach)
        state["achievements"] = list(set(state["achievements"]))

    await db.players.update_one(
        {"player_id": player_id},
        {"$set": {
            "day": state["day"], "coins": state["coins"], "xp": state["xp"],
            "level": state["level"], "phase": state["phase"], "day_log": state["day_log"],
            "streak": state["streak"], "achievements": state["achievements"],
        }}
    )
    state["server_time"] = now_ts()
    state["last_event"] = log_entry
    state["new_achievements"] = [ACHIEVEMENTS_BY_ID[a] for a in new_ach if a in ACHIEVEMENTS_BY_ID]
    return state_with_caps(state)

@api_router.post("/state/{player_id}/minigame_reward", dependencies=[Depends(require_player)])
async def minigame_reward(player_id: str, body: Dict[str, Any]):
    state = await get_or_create_state(player_id)
    game = body.get("game", "sound_check")
    score = min(5, max(0, int(body.get("score", 0))))

    cycle = state.get("cycle", 1)
    day = state.get("day", 1)
    minigame_last = state.get("minigame_last", "")
    current_key = f"{cycle}_{day}"

    if minigame_last == current_key:
        raise HTTPException(400, "Mini game already played today")

    coin_reward = score * 40 + 20
    xp_reward = score * 8 + 5

    state["coins"] += coin_reward
    state["xp"] += xp_reward
    state["minigame_last"] = current_key

    # Stage Sweep: cooldown bonus — shave score*60s off every currently-building structure.
    cooldown_bonus_seconds = 0
    buildings_speeded = 0
    if game == "stage_sweep" and score > 0:
        cooldown_bonus_seconds = score * 60
        t = now_ts()
        for b in state.get("buildings", []):
            if b.get("status") == "building" and b.get("ready_at", 0) > t:
                b["ready_at"] = max(t, b["ready_at"] - cooldown_bonus_seconds)
                buildings_speeded += 1
                if b["ready_at"] <= t:
                    b["status"] = "ready"

    while state["xp"] >= xp_for_level(state["level"]):
        state["level"] += 1
    state["phase"] = compute_phase(state["level"])

    context = {"minigame_ace": (game in ("rhythm_rush", "stage_sweep") and score >= 4)}
    new_ach = check_achievements(state, context)
    if new_ach:
        state.setdefault("achievements", []).extend(new_ach)
        state["achievements"] = list(set(state["achievements"]))

    update_set = {
        "coins": state["coins"], "xp": state["xp"],
        "level": state["level"], "phase": state["phase"],
        "minigame_last": current_key, "achievements": state["achievements"],
    }
    if buildings_speeded > 0:
        update_set["buildings"] = state["buildings"]

    await db.players.update_one({"player_id": player_id}, {"$set": update_set})
    state["server_time"] = now_ts()
    state["new_achievements"] = [ACHIEVEMENTS_BY_ID[a] for a in new_ach if a in ACHIEVEMENTS_BY_ID]
    return {
        "coins_earned": coin_reward,
        "xp_earned": xp_reward,
        "cooldown_bonus_seconds": cooldown_bonus_seconds,
        "buildings_speeded": buildings_speeded,
        "state": state_with_caps(state),
        "new_achievements": state.get("new_achievements", []),
    }

@api_router.post("/state/{player_id}/start_cycle", dependencies=[Depends(require_player)])
async def start_cycle(player_id: str):
    state = await get_or_create_state(player_id)
    state["cycle"] = state.get("cycle", 1) + 1
    state["current_cycle_goal"] = pick_cycle_goal(player_id, state["cycle"])

    state["day"] = 1
    state["genre"] = None
    state["lineup"] = []
    state["day_log"] = []
    state["daily_challenge"] = assign_daily_challenge(state["cycle"])
    await db.players.update_one(
        {"player_id": player_id},
        {"$set": {
            "cycle": state["cycle"], "day": 1, "genre": None,
            "lineup": [], "day_log": [], "daily_challenge": state["daily_challenge"],
            "current_cycle_goal": state["current_cycle_goal"],
        }}
    )
    state["server_time"] = now_ts()
    return state_with_caps(state)

@api_router.get("/state/{player_id}", dependencies=[Depends(require_player)])
async def get_state(player_id: str):
    state = await get_or_create_state(player_id)
    state["server_time"] = now_ts()
    return state_with_caps(state)

@api_router.post("/state/{player_id}/place", dependencies=[Depends(require_player)])
async def place_building(player_id: str, req: PlaceRequest):
    state = await get_or_create_state(player_id)
    item = CATALOG_BY_ID.get(req.catalog_id)
    if not item:
        raise HTTPException(404, "Unknown building")
    if item["phase"] > state["phase"]:
        raise HTTPException(400, f"Locked. Reach phase {item['phase']} to unlock.")
    spec_lock = item.get("spec_lock")
    if spec_lock and state.get("specialization") != spec_lock:
        raise HTTPException(400, f"Requires the {spec_lock.capitalize()} path specialization")
    player_grid_size = get_grid_size_for_phase(state["phase"])
    if not (0 <= req.x < player_grid_size and 0 <= req.y < player_grid_size):
        raise HTTPException(400, "Tile out of bounds")
    for b in state["buildings"]:
        if b["x"] == req.x and b["y"] == req.y:
            raise HTTPException(400, "Tile occupied")
    if state["coins"] < item["cost"]:
        raise HTTPException(400, "Not enough coins")
    build_cap = get_caps(state["phase"])["build"]
    active_buildings = sum(1 for b in state["buildings"] if b.get("status") != "destroyed")
    if active_buildings >= build_cap:
        raise HTTPException(400, f"Build slots full ({build_cap} max at this phase)")

    t = now_ts()
    new_building = Building(
        catalog_id=req.catalog_id,
        x=req.x, y=req.y,
        placed_at=t,
        ready_at=t + item["build_time"],
        status="building",
    ).model_dump()
    state["buildings"].append(new_building)
    state["coins"] -= item["cost"]

    new_ach = check_achievements(state)
    if new_ach:
        state.setdefault("achievements", []).extend(new_ach)
        state["achievements"] = list(set(state["achievements"]))

    await db.players.update_one(
        {"player_id": player_id},
        {"$set": {"buildings": state["buildings"], "coins": state["coins"], "achievements": state["achievements"]}}
    )
    state["server_time"] = now_ts()
    state["new_achievements"] = [ACHIEVEMENTS_BY_ID[a] for a in new_ach if a in ACHIEVEMENTS_BY_ID]
    return state_with_caps(state)

@api_router.post("/state/{player_id}/speedup", dependencies=[Depends(require_player)])
async def speedup(player_id: str, req: SpeedupRequest):
    state = await get_or_create_state(player_id)
    target = next((b for b in state["buildings"] if b["id"] == req.building_id), None)
    if not target:
        raise HTTPException(404, "Building not found")
    if target["status"] == "ready":
        return state_with_caps(state)
    remaining = max(0, target["ready_at"] - now_ts())
    cost = max(10, int(remaining / 6))
    if state["coins"] < cost:
        raise HTTPException(400, f"Need {cost} coins to speed up")
    state["coins"] -= cost
    target["status"] = "ready"
    target["ready_at"] = now_ts()

    new_ach = check_achievements(state, {"speed_demon": True})
    if new_ach:
        state.setdefault("achievements", []).extend(new_ach)
        state["achievements"] = list(set(state["achievements"]))

    await db.players.update_one(
        {"player_id": player_id},
        {"$set": {"buildings": state["buildings"], "coins": state["coins"], "achievements": state["achievements"]}}
    )
    state["server_time"] = now_ts()
    state["new_achievements"] = [ACHIEVEMENTS_BY_ID[a] for a in new_ach if a in ACHIEVEMENTS_BY_ID]
    return state_with_caps(state)

@api_router.post("/state/{player_id}/demolish", dependencies=[Depends(require_player)])
async def demolish(player_id: str, req: SpeedupRequest):
    state = await get_or_create_state(player_id)
    before = len(state["buildings"])
    state["buildings"] = [b for b in state["buildings"] if b["id"] != req.building_id]
    if len(state["buildings"]) == before:
        raise HTTPException(404, "Building not found")
    await db.players.update_one(
        {"player_id": player_id},
        {"$set": {"buildings": state["buildings"]}}
    )
    state["server_time"] = now_ts()
    return state_with_caps(state)

@api_router.post("/state/{player_id}/simulate", dependencies=[Depends(require_player)])
async def simulate(player_id: str, req: SimulateRequest):
    state = await get_or_create_state(player_id)
    ready = [b for b in state["buildings"] if b["status"] == "ready"]
    building_count = len(ready)
    if building_count == 0:
        raise HTTPException(400, "Place and finish at least one building first")

    def cat_items(c):
        return [b for b in ready if CATALOG_BY_ID[b["catalog_id"]]["category"] == c]

    stages = cat_items("stage")
    vendors = cat_items("vendor")
    utilities = cat_items("utility")
    decors = cat_items("decor")

    in_progress = [b for b in state["buildings"] if b["status"] == "building"]
    penalty = min(20, len(in_progress) * 4)

    stage_raw = sum(CATALOG_BY_ID[b["catalog_id"]]["score"] for b in stages)
    stage_score = min(100, stage_raw * 1.2 if stages else 0)

    if building_count >= 2:
        coords = [(b["x"], b["y"]) for b in ready]
        total, count = 0.0, 0
        for i in range(len(coords)):
            for j in range(i+1, len(coords)):
                dx, dy = coords[i][0]-coords[j][0], coords[i][1]-coords[j][1]
                total += math.sqrt(dx*dx + dy*dy)
                count += 1
        avg_d = total / max(1, count)
        crowd_flow = max(0, min(100, int((avg_d / 5.0) * 100)))
    else:
        crowd_flow = 30

    if stages:
        ratio = len(vendors) / (3 * len(stages))
        vendor_coverage = min(100, int(ratio * 100))
    else:
        vendor_coverage = min(60, len(vendors) * 15)

    if stages:
        ratio = len(utilities) / (2 * len(stages))
        utility_coverage = min(100, int(ratio * 100))
    else:
        utility_coverage = min(60, len(utilities) * 20)

    decor_raw = sum(CATALOG_BY_ID[b["catalog_id"]]["score"] for b in decors)
    aesthetic = min(100, decor_raw * 6)

    lineup = state.get("lineup", [])
    festival_genre = state.get("genre")
    lineup_boost = 0
    matched = 0
    for aid in lineup:
        art = ARTISTS_BY_ID.get(aid)
        if not art:
            continue
        lineup_boost += art["boost"]
        if festival_genre and (festival_genre == "mixed" or art["genre"] == festival_genre):
            matched += 1
    stage_score = min(100, stage_score + lineup_boost)
    genre_bonus = 0
    genre_pure = False
    mixed_bag = False
    if lineup and festival_genre and matched == len(lineup) and festival_genre != "mixed":
        genre_bonus = 10
        genre_pure = True
    elif festival_genre == "mixed" and len(set(ARTISTS_BY_ID[a]["genre"] for a in lineup if a in ARTISTS_BY_ID)) >= 3:
        genre_bonus = 8
        mixed_bag = True

    # Chemistry bonus from lineup genre pairings (0–10)
    lineup_genres = [ARTISTS_BY_ID[a]["genre"] for a in lineup if a in ARTISTS_BY_ID]
    chemistry_bonus = compute_chemistry(lineup_genres)

    # Apply genre-specific layout bonuses (Indie, EDM, Rock, HipHop, Pop)
    genre_layout_bonus = None
    genre_layout_missed = None
    if festival_genre and festival_genre != "mixed":
        _breakdown = {
            "crowd_flow_raw":      crowd_flow,
            "stage_score_raw":     stage_score,
            "vendor_coverage_raw": vendor_coverage,
            "aesthetic_raw":       aesthetic,
            "crowd_flow":          crowd_flow,
            "stage_score":         stage_score,
            "vendor_coverage":     vendor_coverage,
            "utility_coverage":    utility_coverage,
            "aesthetic":           aesthetic,
        }
        _breakdown = apply_genre_bonus(_breakdown, festival_genre, state["buildings"], CATALOG_BY_ID)
        crowd_flow        = _breakdown.get("crowd_flow",        crowd_flow)
        stage_score       = _breakdown.get("stage_score",       stage_score)
        vendor_coverage   = _breakdown.get("vendor_coverage",   vendor_coverage)
        utility_coverage  = _breakdown.get("utility_coverage",  utility_coverage)
        aesthetic         = _breakdown.get("aesthetic",         aesthetic)
        genre_layout_bonus  = _breakdown.get("bonus_label")
        genre_layout_missed = _breakdown.get("bonus_missed")

    weights = {"stage": 0.30, "crowd_flow": 0.20, "vendor": 0.20, "utility": 0.15, "aesthetic": 0.15}
    composite = (
        stage_score * weights["stage"]
        + crowd_flow * weights["crowd_flow"]
        + vendor_coverage * weights["vendor"]
        + utility_coverage * weights["utility"]
        + aesthetic * weights["aesthetic"]
    )
    composite = max(0, int(composite - penalty + genre_bonus + chemistry_bonus))

    # ── Cheat-resistance: validate client-submitted score ───────────────
    # Server's composite is the authoritative value. The client's submission
    # is validated only — anything outside the ±10 drift window (genuine
    # rounding/state-drift slack) is rejected. Server score remains the
    # source of truth for persistence and the leaderboard, and the error
    # response intentionally does NOT leak the server's value (otherwise
    # an attacker could probe and resubmit just inside the tolerance).
    client_composite = float(req.client_score.composite)
    if abs(client_composite - composite) >= 10:
        raise HTTPException(400, "Score mismatch: client value rejected")

    # ── Specialization path modifiers (server-only, applied after cheat check) ──
    # Each path reshapes the scoring weights for that run and grants a flat
    # +10 "signature bonus" when the player's layout hits the path condition.
    # Applied after the cheat-check so client scoring (used for validation only)
    # stays simple; the server composite is authoritative for grade + leaderboard.
    spec = state.get("specialization")
    spec_sig_bonus = 0
    spec_sig_label = None

    if spec == "producer":
        stage_score      = min(100, stage_score * 1.25)
        vendor_coverage  = min(100, vendor_coverage * 0.9)
        if len(stages) >= 2:
            spec_sig_bonus = 10
            spec_sig_label = "Stage Powerhouse"
    elif spec == "promoter":
        vendor_coverage = min(100, vendor_coverage * 1.25)
        crowd_flow      = min(100, crowd_flow + 10)
        if len(vendors) >= 3:
            spec_sig_bonus = 10
            spec_sig_label = "Vendor Network"
    elif spec == "operator":
        utility_coverage = min(100, utility_coverage * 2.0)
        penalty          = max(0, penalty // 2)
        if len(utilities) >= 2:
            spec_sig_bonus = 10
            spec_sig_label = "Infrastructure Ready"
    elif spec == "curator":
        aesthetic = min(100, aesthetic * 2.0)
        if len(decors) >= 3:
            spec_sig_bonus = 10
            spec_sig_label = "Artistic Showpiece"

    if spec in ("producer", "promoter", "operator", "curator"):
        composite = max(0, int(
            stage_score      * weights["stage"]
            + crowd_flow     * weights["crowd_flow"]
            + vendor_coverage * weights["vendor"]
            + utility_coverage * weights["utility"]
            + aesthetic      * weights["aesthetic"]
            - penalty + genre_bonus + chemistry_bonus + spec_sig_bonus
        ))

    grade = grade_from_score(composite)

    coin_reward = int(composite * 15 + 200)
    xp_reward = int(composite * 5 + 50)

    # Challenge check & bonus
    challenge_bonus_coins = 0
    challenge_bonus_xp = 0
    challenge_completed = False
    ch = state.get("daily_challenge")
    if ch and not ch.get("completed") and check_challenge_complete(state):
        challenge_bonus_coins = ch.get("coins", 0)
        challenge_bonus_xp = ch.get("xp", 0)
        challenge_completed = True
        state["daily_challenge"]["completed"] = True

    state["coins"] += coin_reward + challenge_bonus_coins
    state["xp"] += xp_reward + challenge_bonus_xp
    state["festivals_run"] = state.get("festivals_run", 0) + 1
    state["last_grade"] = grade
    state["last_score"] = composite
    state["streak"] = 0  # Reset streak on festival run

    # Accumulate genre affinity for the festival's genre.
    # Skip "mixed" festivals (no single dominant genre to credit).
    if festival_genre and festival_genre != "mixed":
        state.setdefault("genre_affinity", {"indie": 0.0, "edm": 0.0, "hiphop": 0.0, "rock": 0.0, "pop": 0.0})
        current = float(state["genre_affinity"].get(festival_genre, 0.0))
        state["genre_affinity"][festival_genre] = current + 0.05 * (composite / 100.0)

    # ── Cycle goal check ────────────────────────────────────────────
    # Must run BEFORE genre/lineup/cycle are reset below: the goal's "check"
    # lambda inspects the festival that just ran (last_grade, last_score,
    # genre, lineup), not the upcoming one. The lambda itself lives only in
    # the module-level GOALS dict — never in state — so it's looked up by id
    # rather than read off current_cycle_goal (which only stores plain fields).
    goal_completed = False
    goal_reward_label = None
    current_goal = state.get("current_cycle_goal")
    if current_goal and not current_goal.get("completed", False):
        goal_id = current_goal.get("id")
        goal_def = next(
            (g for goals in GOALS.values() for g in goals if g["id"] == goal_id), None
        )
        if goal_def and goal_def["check"](state):
            state = apply_goal_reward(state, goal_def["reward"])
            current_goal["completed"] = True
            state["current_cycle_goal"] = current_goal
            goal_completed = True
            goal_reward_label = goal_def["reward_label"]

    state["cycle"] = state.get("cycle", 1) + 1
    state["day"] = 1
    state["genre"] = None
    state["lineup"] = []
    state["day_log"] = []

    # Now that the just-finished cycle's goal has been scored, pick the next one.
    state["current_cycle_goal"] = pick_cycle_goal(player_id, state["cycle"])

    while state["xp"] >= xp_for_level(state["level"]):
        state["level"] += 1
    state["phase"] = compute_phase(state["level"])

    context = {
        "grade": grade,
        "genre_pure": genre_pure,
        "mixed_bag": mixed_bag,
        "lineup_size": len(lineup),
        "crowd_flow_raw": crowd_flow,
    }
    new_ach = check_achievements(state, context)
    if new_ach:
        state.setdefault("achievements", []).extend(new_ach)
        state["achievements"] = list(set(state["achievements"]))

    # Milestones: long-term progression — each fires only once per player
    new_ms = check_milestones(state, context)
    if new_ms:
        state.setdefault("milestone_ids", []).extend(new_ms)
        state["milestone_ids"] = list(set(state["milestone_ids"]))

    # ── Reputation / Legacy layer ─────────────────────────────────────
    # rep_gain = (stars × 100) + (composite × 0.5). Monotonic; never decreases.
    prev_tier = state.get("legacy_tier", "unknown")
    stars = star_rating_for(grade)
    # Min +1 so reputation strictly increases after every event, even on grade F.
    rep_gain = max(1, int(stars * 100 + composite * 0.5))
    state["reputation_score"] = int(state.get("reputation_score", 0)) + rep_gain
    state["legacy_tier"] = derive_tier(state["reputation_score"])
    tier_upgrade = (
        {"from": prev_tier, "to": state["legacy_tier"], "reputation_score": state["reputation_score"]}
        if state["legacy_tier"] != prev_tier else None
    )

    # genre_identity = the genre the player has invested in most.
    # Falls back to current value (or None) if all affinities are still 0.
    aff = state.get("genre_affinity") or {}
    if aff:
        top_genre, top_val = max(aff.items(), key=lambda kv: kv[1])
        if top_val > 0:
            state["genre_identity"] = top_genre

    # Assign next cycle's challenge
    state["daily_challenge"] = assign_daily_challenge(state["cycle"])

    await db.players.update_one(
        {"player_id": player_id},
        {"$set": {
            "coins": state["coins"], "xp": state["xp"], "level": state["level"],
            "phase": state["phase"], "festivals_run": state["festivals_run"],
            "last_grade": grade, "last_score": composite,
            "cycle": state["cycle"], "day": state["day"], "genre": None,
            "lineup": [], "day_log": [], "streak": 0,
            "achievements": state["achievements"], "daily_challenge": state["daily_challenge"],
            "genre_affinity": state.get("genre_affinity", {"indie": 0.0, "edm": 0.0, "hiphop": 0.0, "rock": 0.0, "pop": 0.0}),
            "milestone_ids": state.get("milestone_ids", []),
            "reputation_score": state.get("reputation_score", 0),
            "legacy_tier": state.get("legacy_tier", "unknown"),
            "genre_identity": state.get("genre_identity"),
            "current_cycle_goal": state.get("current_cycle_goal"),
        }}
    )

    await db.leaderboard.insert_one({
        "player_id": player_id,
        "name": state.get("name", "Festival Boss"),
        "score": composite,
        "grade": grade,
        "timestamp": now_ts(),
    })

    return {
        "grade": grade,
        "composite": composite,
        "breakdown": {
            "stage_score": int(stage_score),
            "crowd_flow": int(crowd_flow),
            "vendor_coverage": int(vendor_coverage),
            "utility_coverage": int(utility_coverage),
            "aesthetic": int(aesthetic),
        },
        "penalty": penalty,
        "genre_bonus": genre_bonus,
        "genre_layout_bonus": genre_layout_bonus,
        "genre_layout_missed": genre_layout_missed,
        "spec_sig_bonus": spec_sig_bonus,
        "spec_sig_label": spec_sig_label,
        "lineup_boost": lineup_boost,
        "rewards": {"coins": coin_reward, "xp": xp_reward},
        "challenge": {
            "completed": challenge_completed,
            "bonus_coins": challenge_bonus_coins,
            "bonus_xp": challenge_bonus_xp,
            "name": ch.get("text") if ch else None,
        } if ch else None,
        "new_achievements": [ACHIEVEMENTS_BY_ID[a] for a in new_ach if a in ACHIEVEMENTS_BY_ID],
        "new_milestones": [MILESTONES_BY_ID[m] for m in new_ms if m in MILESTONES_BY_ID],
        "tier_upgrade": tier_upgrade,
        "cycle_goal": {
            "completed": goal_completed,
            "reward_label": goal_reward_label,
            "next_goal": state.get("current_cycle_goal"),
        },
        "state": {
            "coins": state["coins"], "xp": state["xp"],
            "level": state["level"], "phase": state["phase"],
            "festivals_run": state["festivals_run"],
            "cycle": state["cycle"], "day": state["day"],
            "build_cap": get_caps(state["phase"])["build"],
            "artist_cap": get_caps(state["phase"])["artist"],
            "build_slots_used": sum(1 for b in state["buildings"] if b.get("status") != "destroyed"),
            "artist_slots_used": len(state["lineup"]),
        },
    }

@api_router.post("/state/{player_id}/reset", dependencies=[Depends(require_player)])
async def reset_player(player_id: str):
    fresh = PlayerState(player_id=player_id).model_dump()
    existing = await db.players.find_one({"player_id": player_id}, {"_id": 0, "name": 1})
    if existing and existing.get("name"):
        fresh["name"] = existing["name"]
    fresh["daily_challenge"] = assign_daily_challenge(1)
    await db.players.update_one(
        {"player_id": player_id}, {"$set": fresh}, upsert=True
    )
    fresh["server_time"] = now_ts()
    return state_with_caps(fresh)

@api_router.post("/state/{player_id}/delete", dependencies=[Depends(require_player)])
async def delete_player(player_id: str):
    await db.players.delete_one({"player_id": player_id})
    return {"ok": True, "player_id": player_id}

class SetSpecializationRequest(BaseModel):
    path: str  # "producer" | "promoter" | "operator" | "curator"

VALID_SPECIALIZATIONS = {"producer", "promoter", "operator", "curator"}

@api_router.put("/state/{player_id}/specialization", dependencies=[Depends(require_player)])
async def set_specialization(player_id: str, body: SetSpecializationRequest):
    if body.path not in VALID_SPECIALIZATIONS:
        raise HTTPException(400, f"Invalid specialization. Choose from: {', '.join(sorted(VALID_SPECIALIZATIONS))}")
    state = await get_or_create_state(player_id)
    if state.get("specialization"):
        raise HTTPException(400, "Specialization is already set and cannot be changed")
    state["specialization"] = body.path
    await db.players.update_one({"player_id": player_id}, {"$set": {"specialization": body.path}})
    state.pop("_id", None)
    return state_with_caps(state)

@api_router.post("/state/{player_id}/rename", dependencies=[Depends(require_player)])
async def rename(player_id: str, body: Dict[str, str]):
    name = (body.get("name") or "").strip()[:20]
    if not name:
        raise HTTPException(400, "Name required")
    await get_or_create_state(player_id)
    await db.players.update_one({"player_id": player_id}, {"$set": {"name": name}})
    return {"ok": True, "name": name}

@api_router.get("/leaderboard")
async def leaderboard(limit: int = 25):
    cursor = db.leaderboard.find({}, {"_id": 0}).sort("score", -1).limit(limit)
    docs = await cursor.to_list(length=limit)
    return {"entries": docs}

app.include_router(api_router)

# CORS: allow_origins=["*"] + allow_credentials=True is not actually valid per
# the CORS spec (browsers reject a wildcard origin when credentials are
# allowed) — the previous hardcoded config was already broken for any
# credentialed cross-origin request, not just "permissive". Default to an
# open, non-credentialed dev config; set ALLOWED_ORIGINS (comma-separated)
# in production to lock to the real app domain(s) and enable credentials.
_allowed_origins_env = os.environ.get("ALLOWED_ORIGINS", "").strip()
if _allowed_origins_env:
    _cors_origins = [o.strip() for o in _allowed_origins_env.split(",") if o.strip()]
    _cors_credentials = True
else:
    _cors_origins = ["*"]
    _cors_credentials = False

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=_cors_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)
