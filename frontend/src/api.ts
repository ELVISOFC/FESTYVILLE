import AsyncStorage from "@react-native-async-storage/async-storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

async function getPlayerId(): Promise<string> {
  let pid = await AsyncStorage.getItem("festyville.player_id");
  if (!pid) {
    pid = "p_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    await AsyncStorage.setItem("festyville.player_id", pid);
  }
  return pid;
}

async function req(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      msg = data.detail || msg;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

export const api = {
  getPlayerId,
  catalog: () => req("/catalog"),
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
  simulate: async () => {
    const pid = await getPlayerId();
    return req(`/state/${pid}/simulate`, { method: "POST" });
  },
  rename: async (name: string) => {
    const pid = await getPlayerId();
    return req(`/state/${pid}/rename`, { method: "POST", body: JSON.stringify({ name }) });
  },
  leaderboard: () => req("/leaderboard"),
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
  server_time: number;
};

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
  rewards: { coins: number; xp: number };
  state: { coins: number; xp: number; level: number; phase: number; festivals_run: number };
};
