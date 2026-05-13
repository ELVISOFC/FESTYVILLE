"""Backend API tests for FestyVille."""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback for direct backend testing when env not set
    BASE_URL = "http://localhost:8001"

API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def player_id():
    return f"TEST_{uuid.uuid4().hex[:10]}"


# ----- health & catalog -----
class TestHealth:
    def test_root_ok(self, session):
        r = session.get(f"{API}/")
        assert r.status_code == 200
        data = r.json()
        assert data.get("status") == "ok"
        assert data.get("app") == "FestyVille"

    def test_catalog(self, session):
        r = session.get(f"{API}/catalog")
        assert r.status_code == 200
        data = r.json()
        assert data["grid_size"] == 8
        assert len(data["catalog"]) == 16
        cats = {it["category"] for it in data["catalog"]}
        assert {"stage", "vendor", "utility", "decor"} <= cats


# ----- state defaults -----
class TestState:
    def test_get_state_creates_default(self, session, player_id):
        r = session.get(f"{API}/state/{player_id}")
        assert r.status_code == 200
        s = r.json()
        assert s["player_id"] == player_id
        assert s["coins"] == 1500
        assert s["xp"] == 0
        assert s["level"] == 1
        assert s["phase"] == 1
        assert s["grid_size"] == 8
        assert s["buildings"] == []

    def test_rename(self, session, player_id):
        r = session.post(f"{API}/state/{player_id}/rename", json={"name": "TEST_Boss"})
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_Boss"
        # verify persisted
        s = session.get(f"{API}/state/{player_id}").json()
        assert s["name"] == "TEST_Boss"

    def test_rename_empty_400(self, session, player_id):
        r = session.post(f"{API}/state/{player_id}/rename", json={"name": "  "})
        assert r.status_code == 400


# ----- placement -----
class TestPlacement:
    def test_place_building_success(self, session, player_id):
        before = session.get(f"{API}/state/{player_id}").json()
        coins_before = before["coins"]
        r = session.post(f"{API}/state/{player_id}/place",
                         json={"catalog_id": "food_truck", "x": 0, "y": 0})
        assert r.status_code == 200, r.text
        s = r.json()
        assert s["coins"] == coins_before - 100
        assert len(s["buildings"]) == 1
        b = s["buildings"][0]
        assert b["status"] == "building"
        assert b["x"] == 0 and b["y"] == 0
        assert b["ready_at"] == pytest.approx(b["placed_at"] + 180, abs=2)

    def test_place_tile_occupied_400(self, session, player_id):
        r = session.post(f"{API}/state/{player_id}/place",
                         json={"catalog_id": "neon_arch", "x": 0, "y": 0})
        assert r.status_code == 400
        assert "occupied" in r.json()["detail"].lower()

    def test_place_out_of_bounds_400(self, session, player_id):
        r = session.post(f"{API}/state/{player_id}/place",
                         json={"catalog_id": "neon_arch", "x": 9, "y": 9})
        assert r.status_code == 400
        assert "bounds" in r.json()["detail"].lower()

    def test_place_locked_phase_400(self, session, player_id):
        # main stage requires phase 6
        r = session.post(f"{API}/state/{player_id}/place",
                         json={"catalog_id": "stage_main", "x": 1, "y": 1})
        assert r.status_code == 400
        assert "locked" in r.json()["detail"].lower()

    def test_place_not_enough_coins_400(self, session):
        # use a brand-new player and try a 12000-coin item
        pid = f"TEST_{uuid.uuid4().hex[:8]}"
        session.get(f"{API}/state/{pid}")  # create
        # Phase is 1 so most expensive items are locked; pick a phase-1 affordable check via stage_small repeated:
        # Instead, drain coins by placing 16 cheapest then attempt place
        # Simpler: try stage_indie (cost 800, phase 2 = locked), so use stage_small loop
        # Use 7 stage_small (200 each = 1400) then 1 more (=1600 > 1500) fails
        for i in range(7):
            r = session.post(f"{API}/state/{pid}/place",
                             json={"catalog_id": "stage_small", "x": i, "y": 0})
            assert r.status_code == 200, r.text
        r = session.post(f"{API}/state/{pid}/place",
                         json={"catalog_id": "stage_small", "x": 7, "y": 0})
        assert r.status_code == 400
        assert "coins" in r.json()["detail"].lower()


# ----- speedup / demolish / simulate -----
class TestSimAndOps:
    @pytest.fixture(scope="class")
    def setup_player(self, session):
        pid = f"TEST_{uuid.uuid4().hex[:8]}"
        # place 1 vendor + 1 stage + 1 utility + 1 decor (all phase-1)
        for cid, x, y in [("food_truck", 0, 0), ("stage_small", 2, 2),
                          ("restroom", 3, 3), ("neon_arch", 4, 4)]:
            r = session.post(f"{API}/state/{pid}/place",
                             json={"catalog_id": cid, "x": x, "y": y})
            assert r.status_code == 200, r.text
        return pid

    def test_speedup_marks_ready_and_deducts(self, session, setup_player):
        pid = setup_player
        s = session.get(f"{API}/state/{pid}").json()
        coins_before = s["coins"]
        bid = s["buildings"][0]["id"]
        r = session.post(f"{API}/state/{pid}/speedup", json={"building_id": bid})
        assert r.status_code == 200
        s2 = r.json()
        assert s2["coins"] < coins_before
        target = next(b for b in s2["buildings"] if b["id"] == bid)
        assert target["status"] == "ready"

    def test_simulate_400_when_no_ready(self, session):
        pid = f"TEST_{uuid.uuid4().hex[:8]}"
        session.get(f"{API}/state/{pid}")
        r = session.post(f"{API}/state/{pid}/simulate")
        assert r.status_code == 400

    def test_simulate_success(self, session, setup_player):
        pid = setup_player
        # speed up the rest so all 4 are ready
        s = session.get(f"{API}/state/{pid}").json()
        for b in s["buildings"]:
            if b["status"] != "ready":
                session.post(f"{API}/state/{pid}/speedup", json={"building_id": b["id"]})
        r = session.post(f"{API}/state/{pid}/simulate")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["grade"] in {"S", "A", "B", "C", "D", "F"}
        bd = data["breakdown"]
        for k in ["stage_score", "crowd_flow", "vendor_coverage", "utility_coverage", "aesthetic"]:
            assert k in bd
        assert data["rewards"]["coins"] >= 0
        assert data["rewards"]["xp"] >= 0
        assert data["state"]["festivals_run"] >= 1

    def test_demolish(self, session, setup_player):
        pid = setup_player
        s = session.get(f"{API}/state/{pid}").json()
        before = len(s["buildings"])
        bid = s["buildings"][0]["id"]
        r = session.post(f"{API}/state/{pid}/demolish", json={"building_id": bid})
        assert r.status_code == 200
        assert len(r.json()["buildings"]) == before - 1


# ----- leaderboard -----
class TestLeaderboard:
    def test_leaderboard_sorted(self, session):
        r = session.get(f"{API}/leaderboard")
        assert r.status_code == 200
        entries = r.json()["entries"]
        if len(entries) >= 2:
            scores = [e["score"] for e in entries]
            assert scores == sorted(scores, reverse=True)
        if entries:
            e = entries[0]
            for k in ["player_id", "name", "score", "grade", "timestamp"]:
                assert k in e
