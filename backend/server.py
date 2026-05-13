"""FestyVille backend - Festival Tycoon prototype API."""
from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import math
import uuid
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("festyville")

# ---------- Catalog ----------
# build_time in seconds. Small vendors/decor 3-5min. Large stages up to 30min.
# For prototype playability we keep them but also expose speed-up via coins.
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
]
CATALOG_BY_ID = {item["id"]: item for item in CATALOG}

GRID_SIZE = 8  # 8x8 isometric grid
DAYS_PER_CYCLE = 7

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

MICRO_EVENTS = [
    {"text": "Local press buzz lifts hype",  "coins": 80,  "xp": 10},
    {"text": "Influencer scouting tour visits", "coins": 60,  "xp": 15},
    {"text": "Crew finds discount lumber",    "coins": 120, "xp": 5},
    {"text": "Radio interview lands a sponsor", "coins": 150, "xp": 12},
    {"text": "Weather is looking perfect",    "coins": 40,  "xp": 20},
    {"text": "Ticket pre-sales spike",        "coins": 200, "xp": 8},
]

# ---------- Models ----------
class Building(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    catalog_id: str
    x: int
    y: int
    placed_at: float            # epoch seconds
    ready_at: float             # epoch seconds
    status: str = "building"    # building | ready

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

# ---------- Helpers ----------
def now_ts() -> float:
    return datetime.now(timezone.utc).timestamp()

def refresh_buildings(state: Dict[str, Any]) -> Dict[str, Any]:
    """Mark buildings ready if ready_at passed. Mutates and returns."""
    t = now_ts()
    for b in state.get("buildings", []):
        if b.get("status") == "building" and b.get("ready_at", 0) <= t:
            b["status"] = "ready"
    return state

def xp_for_level(level: int) -> int:
    return 100 * level * level  # quadratic curve

def compute_phase(level: int) -> int:
    # 10 phases over levels 1..30; cap at 10
    return min(10, max(1, (level - 1) // 3 + 1))

def grade_from_score(score: int) -> str:
    if score >= 90: return "S"
    if score >= 80: return "A"
    if score >= 65: return "B"
    if score >= 50: return "C"
    if score >= 35: return "D"
    return "F"

async def get_or_create_state(player_id: str) -> Dict[str, Any]:
    doc = await db.players.find_one({"player_id": player_id}, {"_id": 0})
    if not doc:
        s = PlayerState(player_id=player_id)
        await db.players.insert_one(s.model_dump())
        doc = s.model_dump()
    # Backfill new fields for legacy players
    defaults = {"cycle": 1, "day": 1, "genre": None, "lineup": [], "day_log": []}
    missing = {k: v for k, v in defaults.items() if k not in doc}
    if missing:
        doc.update(missing)
        await db.players.update_one({"player_id": player_id}, {"$set": missing})
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

@api_router.post("/state/{player_id}/set_genre")
async def set_genre(player_id: str, body: Dict[str, str]):
    state = await get_or_create_state(player_id)
    genre = (body.get("genre") or "").strip()
    if genre and genre not in {g["id"] for g in GENRES}:
        raise HTTPException(400, "Unknown genre")
    state["genre"] = genre or None
    # If switching to a non-mixed genre, drop incompatible artists
    if genre and genre != "mixed":
        state["lineup"] = [aid for aid in state["lineup"] if ARTISTS_BY_ID.get(aid, {}).get("genre") == genre]
    await db.players.update_one(
        {"player_id": player_id},
        {"$set": {"genre": state["genre"], "lineup": state["lineup"]}}
    )
    state["server_time"] = now_ts()
    return state

@api_router.post("/state/{player_id}/book_artist")
async def book_artist(player_id: str, body: Dict[str, str]):
    state = await get_or_create_state(player_id)
    aid = body.get("artist_id", "")
    artist = ARTISTS_BY_ID.get(aid)
    if not artist:
        raise HTTPException(404, "Unknown artist")
    if artist["phase"] > state["phase"]:
        raise HTTPException(400, f"Locked. Reach phase {artist['phase']}.")
    if state["genre"] and state["genre"] != "mixed" and artist["genre"] != state["genre"]:
        raise HTTPException(400, f"Artist genre doesn't match festival genre")
    if aid in state["lineup"]:
        raise HTTPException(400, "Already booked")
    if state["coins"] < artist["fee"]:
        raise HTTPException(400, "Not enough coins to pay fee")
    state["coins"] -= artist["fee"]
    state["lineup"].append(aid)
    await db.players.update_one(
        {"player_id": player_id},
        {"$set": {"coins": state["coins"], "lineup": state["lineup"]}}
    )
    state["server_time"] = now_ts()
    return state

@api_router.post("/state/{player_id}/unbook_artist")
async def unbook_artist(player_id: str, body: Dict[str, str]):
    state = await get_or_create_state(player_id)
    aid = body.get("artist_id", "")
    if aid not in state["lineup"]:
        raise HTTPException(404, "Not in lineup")
    state["lineup"].remove(aid)
    # 50% refund
    artist = ARTISTS_BY_ID.get(aid)
    if artist:
        state["coins"] += artist["fee"] // 2
    await db.players.update_one(
        {"player_id": player_id},
        {"$set": {"coins": state["coins"], "lineup": state["lineup"]}}
    )
    state["server_time"] = now_ts()
    return state

@api_router.post("/state/{player_id}/advance_day")
async def advance_day(player_id: str):
    state = await get_or_create_state(player_id)
    if state["day"] >= DAYS_PER_CYCLE:
        raise HTTPException(400, f"Already on festival day. Run the festival!")
    if state["day"] == 1 and not state["genre"]:
        raise HTTPException(400, "Pick a genre before ending Day 1")
    # Pull a random micro-progression event
    import random
    ev = random.choice(MICRO_EVENTS)
    state["day"] += 1
    state["coins"] += ev["coins"]
    state["xp"] += ev["xp"]
    # Level-up loop
    while state["xp"] >= xp_for_level(state["level"]):
        state["level"] += 1
    state["phase"] = compute_phase(state["level"])
    log_entry = {"day": state["day"], "text": ev["text"], "coins": ev["coins"], "xp": ev["xp"]}
    state["day_log"].append(log_entry)
    # Trim log to last 20
    state["day_log"] = state["day_log"][-20:]
    await db.players.update_one(
        {"player_id": player_id},
        {"$set": {
            "day": state["day"], "coins": state["coins"], "xp": state["xp"],
            "level": state["level"], "phase": state["phase"], "day_log": state["day_log"],
        }}
    )
    state["server_time"] = now_ts()
    state["last_event"] = log_entry
    return state

@api_router.post("/state/{player_id}/start_cycle")
async def start_cycle(player_id: str):
    state = await get_or_create_state(player_id)
    state["cycle"] = state.get("cycle", 1) + 1
    state["day"] = 1
    state["genre"] = None
    state["lineup"] = []
    state["day_log"] = []
    await db.players.update_one(
        {"player_id": player_id},
        {"$set": {
            "cycle": state["cycle"], "day": 1, "genre": None,
            "lineup": [], "day_log": [],
        }}
    )
    state["server_time"] = now_ts()
    return state

@api_router.get("/state/{player_id}")
async def get_state(player_id: str):
    state = await get_or_create_state(player_id)
    state["server_time"] = now_ts()
    return state

@api_router.post("/state/{player_id}/place")
async def place_building(player_id: str, req: PlaceRequest):
    state = await get_or_create_state(player_id)
    item = CATALOG_BY_ID.get(req.catalog_id)
    if not item:
        raise HTTPException(404, "Unknown building")
    if item["phase"] > state["phase"]:
        raise HTTPException(400, f"Locked. Reach phase {item['phase']} to unlock.")
    if not (0 <= req.x < GRID_SIZE and 0 <= req.y < GRID_SIZE):
        raise HTTPException(400, "Tile out of bounds")
    for b in state["buildings"]:
        if b["x"] == req.x and b["y"] == req.y:
            raise HTTPException(400, "Tile occupied")
    if state["coins"] < item["cost"]:
        raise HTTPException(400, "Not enough coins")

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
    await db.players.update_one(
        {"player_id": player_id},
        {"$set": {"buildings": state["buildings"], "coins": state["coins"]}}
    )
    state["server_time"] = now_ts()
    return state

@api_router.post("/state/{player_id}/speedup")
async def speedup(player_id: str, req: SpeedupRequest):
    state = await get_or_create_state(player_id)
    target = next((b for b in state["buildings"] if b["id"] == req.building_id), None)
    if not target:
        raise HTTPException(404, "Building not found")
    if target["status"] == "ready":
        return state
    remaining = max(0, target["ready_at"] - now_ts())
    cost = max(10, int(remaining / 6))  # 10 coins per minute remaining-ish
    if state["coins"] < cost:
        raise HTTPException(400, f"Need {cost} coins to speed up")
    state["coins"] -= cost
    target["status"] = "ready"
    target["ready_at"] = now_ts()
    await db.players.update_one(
        {"player_id": player_id},
        {"$set": {"buildings": state["buildings"], "coins": state["coins"]}}
    )
    state["server_time"] = now_ts()
    return state

@api_router.post("/state/{player_id}/demolish")
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
    return state

@api_router.post("/state/{player_id}/simulate")
async def simulate(player_id: str):
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

    # Penalty for in-progress builds: signals incomplete festival.
    in_progress = [b for b in state["buildings"] if b["status"] == "building"]
    penalty = min(20, len(in_progress) * 4)

    # Stage score: average tier weight + count bonus, capped 100
    stage_raw = sum(CATALOG_BY_ID[b["catalog_id"]]["score"] for b in stages)
    stage_score = min(100, stage_raw * 1.2 if stages else 0)

    # Crowd flow: penalize clustering. Compute avg pairwise distance among ready bldgs.
    if building_count >= 2:
        coords = [(b["x"], b["y"]) for b in ready]
        total, count = 0.0, 0
        for i in range(len(coords)):
            for j in range(i+1, len(coords)):
                dx, dy = coords[i][0]-coords[j][0], coords[i][1]-coords[j][1]
                total += math.sqrt(dx*dx + dy*dy)
                count += 1
        avg_d = total / max(1, count)
        # Ideal avg distance roughly 3-5 on 8x8 grid
        crowd_flow = max(0, min(100, int((avg_d / 5.0) * 100)))
    else:
        crowd_flow = 30

    # Vendor coverage: target 3 vendors per stage
    if stages:
        ratio = len(vendors) / (3 * len(stages))
        vendor_coverage = min(100, int(ratio * 100))
    else:
        vendor_coverage = min(60, len(vendors) * 15)

    # Utility coverage: target 2 utility per stage
    if stages:
        ratio = len(utilities) / (2 * len(stages))
        utility_coverage = min(100, int(ratio * 100))
    else:
        utility_coverage = min(60, len(utilities) * 20)

    # Aesthetic from decor count + tier
    decor_raw = sum(CATALOG_BY_ID[b["catalog_id"]]["score"] for b in decors)
    aesthetic = min(100, decor_raw * 6)

    # Lineup bonus: artist boosts add to stage_score; genre match adds composite bonus.
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
    if lineup and festival_genre and matched == len(lineup) and festival_genre != "mixed":
        genre_bonus = 10  # Pure-genre festival bonus
    elif festival_genre == "mixed" and len(set(ARTISTS_BY_ID[a]["genre"] for a in lineup if a in ARTISTS_BY_ID)) >= 3:
        genre_bonus = 8   # Mixed festival with 3+ genres

    weights = {"stage": 0.30, "crowd_flow": 0.20, "vendor": 0.20, "utility": 0.15, "aesthetic": 0.15}
    composite = (
        stage_score * weights["stage"]
        + crowd_flow * weights["crowd_flow"]
        + vendor_coverage * weights["vendor"]
        + utility_coverage * weights["utility"]
        + aesthetic * weights["aesthetic"]
    )
    composite = max(0, int(composite - penalty + genre_bonus))
    grade = grade_from_score(composite)

    # Rewards
    coin_reward = int(composite * 15 + 200)
    xp_reward = int(composite * 5 + 50)
    state["coins"] += coin_reward
    state["xp"] += xp_reward
    state["festivals_run"] = state.get("festivals_run", 0) + 1
    state["last_grade"] = grade
    state["last_score"] = composite
    # Auto-start next cycle: reset day/genre/lineup but keep buildings & coins/xp.
    state["cycle"] = state.get("cycle", 1) + 1
    state["day"] = 1
    state["genre"] = None
    state["lineup"] = []
    state["day_log"] = []

    # Level up
    while state["xp"] >= xp_for_level(state["level"]):
        state["level"] += 1
    state["phase"] = compute_phase(state["level"])

    await db.players.update_one(
        {"player_id": player_id},
        {"$set": {
            "coins": state["coins"], "xp": state["xp"], "level": state["level"],
            "phase": state["phase"], "festivals_run": state["festivals_run"],
            "last_grade": grade, "last_score": composite,
            "cycle": state["cycle"], "day": state["day"], "genre": None,
            "lineup": [], "day_log": [],
        }}
    )

    # Save to leaderboard
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
        "lineup_boost": lineup_boost,
        "rewards": {"coins": coin_reward, "xp": xp_reward},
        "state": {
            "coins": state["coins"], "xp": state["xp"],
            "level": state["level"], "phase": state["phase"],
            "festivals_run": state["festivals_run"],
            "cycle": state["cycle"], "day": state["day"],
        },
    }

@api_router.post("/state/{player_id}/rename")
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
    rows = await cursor.to_list(length=limit)
    return {"entries": rows}

app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
