import AsyncStorage from "@react-native-async-storage/async-storage";
import { signInAnonymously, signOut, onAuthStateChanged, User } from "firebase/auth";
import { getFirebaseAuth } from "./firebase";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

let _userPromise: Promise<User> | null = null;
let _cachedToken: { token: string; expiresAt: number } | null = null;

function waitForUser(): Promise<User> {
  if (_userPromise) return _userPromise;
  const p = new Promise<User>((resolve, reject) => {
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(
      auth,
      async (user) => {
        if (user) {
          unsub();
          resolve(user);
          return;
        }
        try {
          const cred = await signInAnonymously(auth);
          unsub();
          resolve(cred.user);
        } catch (e) {
          unsub();
          reject(e);
        }
      },
      (err) => {
        unsub();
        reject(err);
      }
    );
  });
  // Reset the cache on failure so subsequent calls can retry instead of
  // permanently returning the rejected promise.
  p.catch(() => {
    if (_userPromise === p) _userPromise = null;
  });
  _userPromise = p;
  return p;
}

async function getPlayerId(): Promise<string> {
  const user = await waitForUser();
  return user.uid;
}

async function getIdToken(forceRefresh = false): Promise<string> {
  const now = Date.now();
  if (!forceRefresh && _cachedToken && _cachedToken.expiresAt > now + 60_000) {
    return _cachedToken.token;
  }
  const user = await waitForUser();
  const token = await user.getIdToken(forceRefresh);
  // Firebase ID tokens are valid for 1 hour. Cache for 50 minutes.
  _cachedToken = { token, expiresAt: now + 50 * 60 * 1000 };
  return token;
}

function clearAuthCache() {
  _userPromise = null;
  _cachedToken = null;
}

// ---------- Offline-first cache ----------
const STATE_CACHE_PREFIX = "fv_state:";
const CATALOG_CACHE_KEY = "fv_catalog";

function isPlayerStateLike(d: any): boolean {
  return !!(d && typeof d === "object" && typeof d.player_id === "string" && Array.isArray(d.buildings));
}

async function persistStateIfApplicable(data: any) {
  if (!isPlayerStateLike(data)) return;
  try {
    await AsyncStorage.setItem(STATE_CACHE_PREFIX + data.player_id, JSON.stringify(data));
  } catch {}
}

async function persistCatalogIfApplicable(path: string, data: any) {
  if (path !== "/catalog" || !data || typeof data !== "object" || !Array.isArray(data.catalog)) return;
  try {
    await AsyncStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(data));
  } catch {}
}

export async function loadCachedState(): Promise<PlayerState | null> {
  try {
    const pid = await getPlayerId();
    const raw = await AsyncStorage.getItem(STATE_CACHE_PREFIX + pid);
    return raw ? (JSON.parse(raw) as PlayerState) : null;
  } catch {
    return null;
  }
}

export async function loadCachedCatalog(): Promise<{ catalog: CatalogItem[]; grid_size: number } | null> {
  try {
    const raw = await AsyncStorage.getItem(CATALOG_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function clearCachedStateForCurrentUser() {
  try {
    const raw = _cachedToken; // best-effort; just attempt with the current uid
    const u = await waitForUser().catch(() => null);
    if (u) await AsyncStorage.removeItem(STATE_CACHE_PREFIX + u.uid);
    void raw;
  } catch {}
}

async function req(path: string, opts: RequestInit = {}, requireAuth = true) {
  const needsAuth = requireAuth && path.startsWith("/state/");
  const doFetch = async (forceRefresh: boolean) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...((opts.headers as Record<string, string>) || {}),
    };
    if (needsAuth) {
      const token = await getIdToken(forceRefresh);
      headers["Authorization"] = `Bearer ${token}`;
    }
    return fetch(`${BASE}/api${path}`, { ...opts, headers });
  };

  let res = await doFetch(false);
  if (res.status === 401 && needsAuth) {
    // Token may be stale/expired — drop cache and retry once with a fresh one.
    _cachedToken = null;
    res = await doFetch(true);
  }
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      msg = data.detail || msg;
    } catch {}
    throw new Error(msg);
  }
  const data = await res.json();
  // Fire-and-forget cache writes; never let cache I/O block the response.
  void persistStateIfApplicable(data);
  void persistCatalogIfApplicable(path, data);
  return data;
}

export const api = {
  getPlayerId,
  catalog: () => req("/catalog", {}, false),
  artists: () => req("/artists", {}, false),
  characters: () => req("/characters", {}, false),
  state: async () => {
    const pid = await getPlayerId();
    return req(`/state/${pid}`);
  },
  place: async (catalog_id: string, x: number, y: number) => {
    const pid = await getPlayerId();
    return req(`/state/${pid}/place`, { method: "POST", body: JSON.stringify({ catalog_id, x, y }) });
  },
  speedup: async (building_id: string) => {
    const pid = await getPlayerId();
    return req(`/state/${pid}/speedup`, { method: "POST", body: JSON.stringify({ building_id }) });
  },
  demolish: async (building_id: string) => {
    const pid = await getPlayerId();
    return req(`/state/${pid}/demolish`, { method: "POST", body: JSON.stringify({ building_id }) });
  },
  simulate: async (breakdown: {
    stage_score: number;
    crowd_flow: number;
    vendor_coverage: number;
    utility_coverage: number;
    aesthetic: number;
    chemistry_bonus: number;
    composite: number;
  }) => {
    const pid = await getPlayerId();
    return req(`/state/${pid}/simulate`, {
      method: "POST",
      body: JSON.stringify({ client_score: breakdown }),
    });
  },
  rename: async (name: string) => {
    const pid = await getPlayerId();
    return req(`/state/${pid}/rename`, { method: "POST", body: JSON.stringify({ name }) });
  },
  resetSave: async () => {
    const pid = await getPlayerId();
    return req(`/state/${pid}/reset`, { method: "POST" });
  },
  deleteSave: async () => {
    const pid = await getPlayerId();
    const res = await req(`/state/${pid}/delete`, { method: "POST" });
    await AsyncStorage.multiRemove([
      "festyville.tutorial.planning_seen",
      STATE_CACHE_PREFIX + pid,
    ]);
    try {
      await signOut(getFirebaseAuth());
    } catch {}
    clearAuthCache();
    return res;
  },
  newSave: async () => {
    // Sign out the current anonymous user and let waitForUser create a fresh one.
    await clearCachedStateForCurrentUser();
    try {
      await signOut(getFirebaseAuth());
    } catch {}
    clearAuthCache();
    await AsyncStorage.removeItem("festyville.tutorial.planning_seen");
    const pid = await getPlayerId();
    return req(`/state/${pid}`);
  },
  setGenre: async (genre: string) => {
    const pid = await getPlayerId();
    return req(`/state/${pid}/set_genre`, { method: "POST", body: JSON.stringify({ genre }) });
  },
  bookArtist: async (artist_id: string) => {
    const pid = await getPlayerId();
    return req(`/state/${pid}/book_artist`, { method: "POST", body: JSON.stringify({ artist_id }) });
  },
  unbookArtist: async (artist_id: string) => {
    const pid = await getPlayerId();
    return req(`/state/${pid}/unbook_artist`, { method: "POST", body: JSON.stringify({ artist_id }) });
  },
  advanceDay: async () => {
    const pid = await getPlayerId();
    return req(`/state/${pid}/advance_day`, { method: "POST" });
  },
  startCycle: async () => {
    const pid = await getPlayerId();
    return req(`/state/${pid}/start_cycle`, { method: "POST" });
  },
  minigameReward: async (game: string, score: number) => {
    const pid = await getPlayerId();
    return req(`/state/${pid}/minigame_reward`, { method: "POST", body: JSON.stringify({ game, score }) });
  },
  leaderboard: () => req("/leaderboard", {}, false),
};

export type CatalogItem = {
  id: string;
  name: string;
  category: "stage" | "vendor" | "utility" | "decor";
  tier: number;
  cost: number;
  build_time: number;
  phase: number;
  score: number;
  footprint: number;
  color: string;
};

export type Building = {
  id: string;
  catalog_id: string;
  x: number;
  y: number;
  placed_at: number;
  ready_at: number;
  status: "building" | "ready";
};

export type DayLogEntry = {
  day: number;
  text: string;
  coins: number;
  xp: number;
  character_id?: string;
  streak_bonus?: boolean;
};

export type DailyChallenge = {
  id: string;
  text: string;
  target: string;
  coins: number;
  xp: number;
  completed: boolean;
};

export type Achievement = {
  id: string;
  name: string;
  desc: string;
  emoji: string;
};

export type SideCharacter = {
  id: string;
  name: string;
  role: string;
  emoji: string;
  color: string;
};

export type PlayerState = {
  player_id: string;
  name: string;
  coins: number;
  xp: number;
  level: number;
  phase: number;
  grid_size: number;
  buildings: Building[];
  last_grade: string | null;
  last_score: number;
  festivals_run: number;
  cycle: number;
  day: number;
  genre: string | null;
  lineup: string[];
  day_log: DayLogEntry[];
  achievements: string[];
  milestone_ids: string[];
  // Copilot: Add current_cycle_goal to the PlayerState TypeScript type.
  // It should sit after the existing milestone_ids field.
  current_cycle_goal: {
    id: string;
    type: "infra" | "lineup" | "score" | "genre";
    label: string;
    reward_label: string;
    completed: boolean;
  } | null;
  daily_challenge: DailyChallenge | null;
  minigame_last: string;
  streak: number;
  genre_affinity: { indie: number; edm: number; hiphop: number; rock: number; pop: number };
  reputation_score: number;
  legacy_tier: "unknown" | "local" | "regional" | "national" | "legendary";
  genre_identity: string | null;
  server_time: number;
  last_event?: DayLogEntry;
  new_achievements?: Achievement[];
};

export type Artist = {
  id: string;
  name: string;
  genre: string;
  tier: number;
  fee: number;
  boost: number;
  phase: number;
};

export type Genre = { id: string; label: string };

export type SimResult = {
  grade: string;
  composite: number;
  breakdown: {
    stage_score: number;
    crowd_flow: number;
    vendor_coverage: number;
    utility_coverage: number;
    aesthetic: number;
  };
  penalty: number;
  genre_bonus: number;
  lineup_boost: number;
  rewards: { coins: number; xp: number };
  challenge: {
    completed: boolean;
    bonus_coins: number;
    bonus_xp: number;
    name: string | null;
  } | null;
  new_achievements: Achievement[];
  new_milestones: Milestone[];
  tier_upgrade: { from: string; to: string; reputation_score: number } | null;
  state: { coins: number; xp: number; level: number; phase: number; festivals_run: number; cycle: number; day: number };
  // Copilot: Also add goal_completed and goal_label to SimResult so the frontend
  // can show a banner when the player finishes their cycle goal.
  goal_completed?: boolean;
  goal_label?: string | null;
};

export type Milestone = {
  id: string;
  name: string;
  desc: string;
  emoji: string;
  reward_rep: number;
};
