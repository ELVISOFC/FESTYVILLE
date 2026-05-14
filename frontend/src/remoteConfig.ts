import { fetchAndActivate, getValue } from "firebase/remote-config";
import { getFirebaseRemoteConfig } from "./firebase";

let initialized = false;

export async function initRemoteConfig(): Promise<void> {
  if (initialized) return;
  try {
    const rc = getFirebaseRemoteConfig();
    await fetchAndActivate(rc);
    initialized = true;
    console.log("[RemoteConfig] Fetched and activated.");
  } catch (e) {
    console.warn("[RemoteConfig] fetch failed, using defaults:", e);
    initialized = true;
  }
}

function getNumber(key: string): number {
  const rc = getFirebaseRemoteConfig();
  return getValue(rc, key).asNumber();
}

export const RemoteValues = {
  startingCoins: (): number => getNumber("starting_coins"),
  gridSize: (): number => getNumber("grid_size"),
  crowdCountBase: (): number => getNumber("crowd_count_base"),

  buildTime: (catalogId: string): number => {
    const key = `build_time_${catalogId}`;
    return getNumber(key);
  },

  microEventCoinsMin: (): number => getNumber("micro_event_coins_min"),
  microEventCoinsMax: (): number => getNumber("micro_event_coins_max"),
};
