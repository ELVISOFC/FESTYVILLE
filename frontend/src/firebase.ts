import { initializeApp, getApps } from "firebase/app";
import { getAnalytics, isSupported as analyticsSupported, Analytics } from "firebase/analytics";
import { getRemoteConfig, RemoteConfig } from "firebase/remote-config";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

let analyticsInstance: Analytics | null = null;
let remoteConfigInstance: RemoteConfig | null = null;

export async function getFirebaseAnalytics(): Promise<Analytics | null> {
  if (analyticsInstance) return analyticsInstance;
  try {
    const supported = await analyticsSupported();
    if (supported) {
      analyticsInstance = getAnalytics(app);
    }
  } catch (e) {
    console.warn("[Firebase] Analytics init failed:", e);
  }
  return analyticsInstance;
}

export function getFirebaseRemoteConfig(): RemoteConfig {
  if (remoteConfigInstance) return remoteConfigInstance;
  remoteConfigInstance = getRemoteConfig(app);

  remoteConfigInstance.settings = {
    minimumFetchIntervalMillis: 3600000,
    fetchTimeoutMillis: 10000,
  };

  remoteConfigInstance.defaultConfig = {
    starting_coins: 1500,
    grid_size: 8,
    build_time_stage_small: 180,
    build_time_stage_indie: 600,
    build_time_stage_edm: 1200,
    build_time_stage_main: 1800,
    build_time_stage_grand: 1800,
    build_time_food_truck: 180,
    build_time_drink_bar: 240,
    build_time_merch_tent: 300,
    build_time_vip_lounge: 1500,
    build_time_restroom: 180,
    build_time_first_aid: 240,
    build_time_power_gen: 420,
    build_time_neon_arch: 180,
    build_time_fire_pit: 240,
    build_time_lazer_tower: 600,
    build_time_art_statue: 900,
    micro_event_coins_min: 40,
    micro_event_coins_max: 200,
    crowd_count_base: 120,
  };

  return remoteConfigInstance;
}

export { app };
