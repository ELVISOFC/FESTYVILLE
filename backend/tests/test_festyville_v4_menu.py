"""FestyVille iteration 4 backend tests: reset / delete endpoints."""
import os
import uuid
import requests
import pytest

BASE_URL = os.environ['EXPO_PUBLIC_BACKEND_URL'].rstrip('/')


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def new_pid():
    return f"TEST_p_{uuid.uuid4().hex[:10]}"


# ---------- reset ----------
class TestReset:
    def test_reset_wipes_progress_keeps_name(self, session):
        pid = new_pid()
        # Seed: rename, set_genre, place building (so coins/buildings change)
        session.get(f"{BASE_URL}/api/state/{pid}")
        session.post(f"{BASE_URL}/api/state/{pid}/rename", json={"name": "TEST_BOSS"})
        session.post(f"{BASE_URL}/api/state/{pid}/set_genre", json={"genre": "edm"})
        session.post(f"{BASE_URL}/api/state/{pid}/book_artist", json={"artist_id": "glow_riot"})
        place = session.post(f"{BASE_URL}/api/state/{pid}/place",
                             json={"catalog_id": "food_truck", "x": 1, "y": 1})
        assert place.status_code == 200
        s_pre = place.json()
        assert s_pre["coins"] < 1500
        assert len(s_pre["buildings"]) == 1

        # Reset
        r = session.post(f"{BASE_URL}/api/state/{pid}/reset")
        assert r.status_code == 200, r.text
        s = r.json()
        # Same player_id, same name preserved
        assert s["player_id"] == pid
        assert s["name"] == "TEST_BOSS"
        # Wiped fields
        assert s["coins"] == 1500
        assert s["buildings"] == []
        assert s["xp"] == 0
        assert s["level"] == 1
        assert s["phase"] == 1
        assert s["cycle"] == 1
        assert s["day"] == 1
        assert s["genre"] is None
        assert s["lineup"] == []

    def test_reset_persists_in_db(self, session):
        pid = new_pid()
        session.get(f"{BASE_URL}/api/state/{pid}")
        session.post(f"{BASE_URL}/api/state/{pid}/set_genre", json={"genre": "edm"})
        session.post(f"{BASE_URL}/api/state/{pid}/place",
                     json={"catalog_id": "food_truck", "x": 0, "y": 0})
        session.post(f"{BASE_URL}/api/state/{pid}/reset")
        # GET again to verify persistence
        s = session.get(f"{BASE_URL}/api/state/{pid}").json()
        assert s["coins"] == 1500
        assert s["buildings"] == []
        assert s["genre"] is None


# ---------- delete ----------
class TestDelete:
    def test_delete_returns_ok(self, session):
        pid = new_pid()
        session.get(f"{BASE_URL}/api/state/{pid}")
        r = session.post(f"{BASE_URL}/api/state/{pid}/delete")
        assert r.status_code == 200
        body = r.json()
        assert body.get("ok") is True
        assert body.get("player_id") == pid

    def test_delete_then_get_returns_fresh_default(self, session):
        pid = new_pid()
        # Seed with some build/coins
        session.get(f"{BASE_URL}/api/state/{pid}")
        session.post(f"{BASE_URL}/api/state/{pid}/set_genre", json={"genre": "edm"})
        place = session.post(f"{BASE_URL}/api/state/{pid}/place",
                             json={"catalog_id": "food_truck", "x": 2, "y": 2})
        assert place.status_code == 200
        assert place.json()["coins"] < 1500
        assert len(place.json()["buildings"]) == 1

        # Delete
        d = session.post(f"{BASE_URL}/api/state/{pid}/delete")
        assert d.status_code == 200

        # Subsequent GET auto-recreates as fresh default
        s = session.get(f"{BASE_URL}/api/state/{pid}").json()
        assert s["coins"] == 1500
        assert s["buildings"] == []
        assert s["genre"] is None
        assert s["xp"] == 0
        assert s["cycle"] == 1 and s["day"] == 1
