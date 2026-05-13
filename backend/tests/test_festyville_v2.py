"""FestyVille v2 backend tests: pre-planning, day cycle, lineup booking, genre, simulate updates."""
import os
import time
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


# ---------- Catalog & Artists ----------
class TestCatalogArtists:
    def test_catalog_has_days_per_cycle(self, session):
        r = session.get(f"{BASE_URL}/api/catalog")
        assert r.status_code == 200
        data = r.json()
        assert data.get("days_per_cycle") == 7
        assert "catalog" in data and "grid_size" in data

    def test_artists_endpoint(self, session):
        r = session.get(f"{BASE_URL}/api/artists")
        assert r.status_code == 200
        data = r.json()
        artists = data.get("artists", [])
        genres = data.get("genres", [])
        assert len(artists) == 12, f"Expected 12 artists, got {len(artists)}"
        genre_ids = {g["id"] for g in genres}
        assert genre_ids == {"edm", "indie", "hiphop", "rock", "mixed"}
        artist_genres = {a["genre"] for a in artists}
        # Artists themselves are 4 genres (not mixed)
        assert artist_genres == {"edm", "indie", "hiphop", "rock"}


# ---------- New state fields ----------
class TestStateNewFields:
    def test_initial_state_fields(self, session):
        pid = new_pid()
        r = session.get(f"{BASE_URL}/api/state/{pid}")
        assert r.status_code == 200
        s = r.json()
        assert s["cycle"] == 1
        assert s["day"] == 1
        assert s["genre"] is None
        assert s["lineup"] == []
        assert s["day_log"] == []


# ---------- set_genre ----------
class TestSetGenre:
    def test_set_genre_valid(self, session):
        pid = new_pid()
        session.get(f"{BASE_URL}/api/state/{pid}")
        r = session.post(f"{BASE_URL}/api/state/{pid}/set_genre", json={"genre": "edm"})
        assert r.status_code == 200
        assert r.json()["genre"] == "edm"

    def test_set_genre_invalid(self, session):
        pid = new_pid()
        session.get(f"{BASE_URL}/api/state/{pid}")
        r = session.post(f"{BASE_URL}/api/state/{pid}/set_genre", json={"genre": "invalid"})
        assert r.status_code == 400

    def test_set_genre_filters_lineup(self, session):
        pid = new_pid()
        session.get(f"{BASE_URL}/api/state/{pid}")
        # set mixed first, book one edm and one indie artist
        session.post(f"{BASE_URL}/api/state/{pid}/set_genre", json={"genre": "mixed"})
        r1 = session.post(f"{BASE_URL}/api/state/{pid}/book_artist", json={"artist_id": "glow_riot"})
        assert r1.status_code == 200, r1.text
        r2 = session.post(f"{BASE_URL}/api/state/{pid}/book_artist", json={"artist_id": "velvet_echo"})
        assert r2.status_code == 200, r2.text
        # switch to edm: indie artist should drop
        r3 = session.post(f"{BASE_URL}/api/state/{pid}/set_genre", json={"genre": "edm"})
        assert r3.status_code == 200
        lineup = r3.json()["lineup"]
        assert "glow_riot" in lineup
        assert "velvet_echo" not in lineup


# ---------- book/unbook artist ----------
class TestBooking:
    def test_book_deducts_fee(self, session):
        pid = new_pid()
        s0 = session.get(f"{BASE_URL}/api/state/{pid}").json()
        coins0 = s0["coins"]
        session.post(f"{BASE_URL}/api/state/{pid}/set_genre", json={"genre": "edm"})
        r = session.post(f"{BASE_URL}/api/state/{pid}/book_artist", json={"artist_id": "glow_riot"})
        assert r.status_code == 200
        s = r.json()
        assert s["coins"] == coins0 - 150
        assert "glow_riot" in s["lineup"]

    def test_book_mismatched_genre(self, session):
        pid = new_pid()
        session.get(f"{BASE_URL}/api/state/{pid}")
        session.post(f"{BASE_URL}/api/state/{pid}/set_genre", json={"genre": "edm"})
        r = session.post(f"{BASE_URL}/api/state/{pid}/book_artist", json={"artist_id": "velvet_echo"})
        assert r.status_code == 400

    def test_book_locked_phase(self, session):
        pid = new_pid()
        session.get(f"{BASE_URL}/api/state/{pid}")
        session.post(f"{BASE_URL}/api/state/{pid}/set_genre", json={"genre": "edm"})
        # neon_wolves requires phase 5; new player at phase 1
        r = session.post(f"{BASE_URL}/api/state/{pid}/book_artist", json={"artist_id": "neon_wolves"})
        assert r.status_code == 400

    def test_book_insufficient_coins(self, session):
        pid = new_pid()
        session.get(f"{BASE_URL}/api/state/{pid}")
        session.post(f"{BASE_URL}/api/state/{pid}/set_genre", json={"genre": "edm"})
        # Book tier-1 and tier-2 (150+450=600), should still have coins.
        # We can't easily reduce coins; instead try booking many until insufficient (only 1 tier1, 1 tier2, tier3 locked).
        # Use tier-2 multiple? Only one per artist. So spend on tier-2 indie attempts? mismatch.
        # Simpler: switch to mixed and book multiple tier-2. There are 4 tier-2 artists in 4 genres = 4*450=1800 > 1500.
        session.post(f"{BASE_URL}/api/state/{pid}/set_genre", json={"genre": "mixed"})
        for aid in ["pulse_drop", "paper_lant", "verse_808"]:
            session.post(f"{BASE_URL}/api/state/{pid}/book_artist", json={"artist_id": aid})
        # After 3*450=1350 spent, 150 left. Tier-2 ember_trail (450) should fail.
        r = session.post(f"{BASE_URL}/api/state/{pid}/book_artist", json={"artist_id": "ember_trail"})
        assert r.status_code == 400

    def test_already_booked(self, session):
        pid = new_pid()
        session.get(f"{BASE_URL}/api/state/{pid}")
        session.post(f"{BASE_URL}/api/state/{pid}/set_genre", json={"genre": "edm"})
        session.post(f"{BASE_URL}/api/state/{pid}/book_artist", json={"artist_id": "glow_riot"})
        r = session.post(f"{BASE_URL}/api/state/{pid}/book_artist", json={"artist_id": "glow_riot"})
        assert r.status_code == 400

    def test_unbook_refund(self, session):
        pid = new_pid()
        session.get(f"{BASE_URL}/api/state/{pid}")
        session.post(f"{BASE_URL}/api/state/{pid}/set_genre", json={"genre": "edm"})
        s0 = session.post(f"{BASE_URL}/api/state/{pid}/book_artist", json={"artist_id": "glow_riot"}).json()
        coins_after_book = s0["coins"]
        r = session.post(f"{BASE_URL}/api/state/{pid}/unbook_artist", json={"artist_id": "glow_riot"})
        assert r.status_code == 200
        s = r.json()
        assert "glow_riot" not in s["lineup"]
        assert s["coins"] == coins_after_book + 75  # 50% of 150


# ---------- advance_day ----------
class TestAdvanceDay:
    def test_advance_day_no_genre(self, session):
        pid = new_pid()
        session.get(f"{BASE_URL}/api/state/{pid}")
        r = session.post(f"{BASE_URL}/api/state/{pid}/advance_day")
        assert r.status_code == 400
        assert "genre" in r.json()["detail"].lower()

    def test_advance_day_after_genre(self, session):
        pid = new_pid()
        session.get(f"{BASE_URL}/api/state/{pid}")
        session.post(f"{BASE_URL}/api/state/{pid}/set_genre", json={"genre": "edm"})
        r = session.post(f"{BASE_URL}/api/state/{pid}/advance_day")
        assert r.status_code == 200
        s = r.json()
        assert s["day"] == 2
        assert "last_event" in s
        assert len(s["last_event"]["text"]) > 0
        assert s["last_event"]["coins"] > 0
        assert s["last_event"]["xp"] > 0

    def test_advance_to_festival_day(self, session):
        pid = new_pid()
        session.get(f"{BASE_URL}/api/state/{pid}")
        session.post(f"{BASE_URL}/api/state/{pid}/set_genre", json={"genre": "edm"})
        last = None
        for _ in range(6):
            r = session.post(f"{BASE_URL}/api/state/{pid}/advance_day")
            assert r.status_code == 200
            last = r.json()
        assert last["day"] == 7
        r2 = session.post(f"{BASE_URL}/api/state/{pid}/advance_day")
        assert r2.status_code == 400
        assert "festival" in r2.json()["detail"].lower()


# ---------- simulate updates ----------
class TestSimulate:
    def test_simulate_includes_new_fields_and_resets(self, session):
        pid = new_pid()
        s0 = session.get(f"{BASE_URL}/api/state/{pid}").json()
        # place a stage so simulate succeeds; build_time is 180s so wait? Instead use speedup.
        place = session.post(f"{BASE_URL}/api/state/{pid}/place",
                             json={"catalog_id": "stage_small", "x": 0, "y": 0})
        assert place.status_code == 200, place.text
        bid = place.json()["buildings"][0]["id"]
        spd = session.post(f"{BASE_URL}/api/state/{pid}/speedup", json={"building_id": bid})
        assert spd.status_code == 200, spd.text
        # set genre and book matching artist
        session.post(f"{BASE_URL}/api/state/{pid}/set_genre", json={"genre": "edm"})
        session.post(f"{BASE_URL}/api/state/{pid}/book_artist", json={"artist_id": "glow_riot"})

        r = session.post(f"{BASE_URL}/api/state/{pid}/simulate")
        assert r.status_code == 200, r.text
        result = r.json()
        assert "genre_bonus" in result
        assert "lineup_boost" in result
        # pure-genre with all matching -> +10 bonus
        assert result["genre_bonus"] == 10, f"Expected +10 genre_bonus, got {result['genre_bonus']}"
        assert result["lineup_boost"] >= 8

        # post-simulate state should reset cycle/day/genre/lineup
        s2 = session.get(f"{BASE_URL}/api/state/{pid}").json()
        assert s2["cycle"] == 2
        assert s2["day"] == 1
        assert s2["genre"] is None
        assert s2["lineup"] == []


# ---------- start_cycle ----------
class TestStartCycle:
    def test_start_cycle_resets(self, session):
        pid = new_pid()
        session.get(f"{BASE_URL}/api/state/{pid}")
        session.post(f"{BASE_URL}/api/state/{pid}/set_genre", json={"genre": "edm"})
        session.post(f"{BASE_URL}/api/state/{pid}/book_artist", json={"artist_id": "glow_riot"})
        session.post(f"{BASE_URL}/api/state/{pid}/advance_day")
        r = session.post(f"{BASE_URL}/api/state/{pid}/start_cycle")
        assert r.status_code == 200
        s = r.json()
        assert s["day"] == 1
        assert s["genre"] is None
        assert s["lineup"] == []
        assert s["cycle"] >= 2
