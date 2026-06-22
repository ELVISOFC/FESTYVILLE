import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Alert,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  api,
  loadCachedCatalog,
  loadCachedState,
  type PlayerState,
  type CatalogItem,
  type Achievement,
} from "../src/api";
import { COLORS } from "../src/theme";
import { hapticLight, hapticSuccess, hapticWarning } from "../src/haptics";
import { Analytics } from "../src/analytics";
import { computeScore } from "../src/lib/scoring";
import HUD from "../src/components/HUD";
import BuildDrawer from "../src/components/BuildDrawer";
import IsometricGrid, { TILE_W, TILE_H, VISUAL_MAX } from "../src/components/IsometricGrid";
import AchievementToast from "../src/components/AchievementToast";
import TutorialModal from "../src/components/TutorialModal";
import FloatingReward, { type FloatingRewardEntry } from "../src/components/FloatingReward";

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.5;

export default function Index() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [state, setState] = useState<PlayerState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [showSpecPicker, setShowSpecPicker] = useState(false);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [selectedTile, setSelectedTile] = useState<{ x: number; y: number } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"build" | "view">("build");
  const [drawerTile, setDrawerTile] = useState<{ x: number; y: number } | null>(null);
  const [achievementStack, setAchievementStack] = useState<Achievement[] | null>(null);
  const [floatingRewards, setFloatingRewards] = useState<FloatingRewardEntry[]>([]);
  const [tick, setTick] = useState(0);
  const lastPolledRef = useRef(0);

  const gridSize = state?.grid_size ?? 8;

  // ── Pinch-to-zoom ──────────────────────────────────────────────────────────
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      const next = savedScale.value * e.scale;
      scale.value = Math.min(Math.max(next, ZOOM_MIN), ZOOM_MAX);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      scale.value = withSpring(1);
      savedScale.value = 1;
    });

  const composed = Gesture.Simultaneous(pinchGesture, doubleTapGesture);

  const animatedGridStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  // ──────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (state && !state.specialization) setShowSpecPicker(true);
  }, [state?.specialization]);

  const handlePickSpec = async (path: string) => {
    try {
      const s = await api.setSpecialization(path);
      setState(s as PlayerState);
      setShowSpecPicker(false);
    } catch (e: any) {
      alertOrLog("Error", e.message || String(e));
    }
  };

  const refreshState = useCallback(async () => {
    try {
      const s = await api.state();
      setState(s as PlayerState);
      setOffline(false);
    } catch {
      setOffline(true);
      throw new Error("offline");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [cachedCat, cachedState] = await Promise.all([
        loadCachedCatalog(),
        loadCachedState(),
      ]);
      if (cancelled) return;
      if (cachedCat) {
        setCatalog((prev) => (prev.length ? prev : cachedCat.catalog));
      }
      if (cachedState) {
        setState((prev) => {
          if (prev) return prev;
          setLoading(false);
          return cachedState;
        });
      }
    })();

    (async () => {
      try {
        const [c, s] = await Promise.all([api.catalog(), api.state()]);
        if (cancelled) return;
        setCatalog(c.catalog);
        setState(s as PlayerState);
        setOffline(false);
        setLoadError(null);
      } catch (e: any) {
        if (cancelled) return;
        const msg = e?.message || String(e);
        Analytics.errorOccurred("load_failed", msg, "index_init");
        setState((current) => {
          if (current) {
            setOffline(true);
          } else {
            setLoadError(msg);
            alertOrLog("Connection Error", msg);
          }
          return current;
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setTick((t) => t + 1);
      const now = Date.now();
      if (now - lastPolledRef.current > 5000) {
        lastPolledRef.current = now;
        refreshState().catch(() => {});
      }
    }, 1000);
    return () => clearInterval(id);
  }, [refreshState]);

  const occupied = useMemo(
    () => new Set((state?.buildings ?? []).map((b) => `${b.x},${b.y}`)),
    [state?.buildings, tick]
  );

  const activeBuilds = useMemo(
    () => (state?.buildings ?? []).filter((b) => b.status === "ready").length,
    [state?.buildings, tick]
  );

  const handleTilePress = (x: number, y: number) => {
    const occ = occupied.has(`${x},${y}`);
    setDrawerTile({ x, y });
    setSelectedTile({ x, y });
    setDrawerMode(occ ? "view" : "build");
    setDrawerOpen(true);
  };

  const pushReward = (delta: number, kind: FloatingRewardEntry["kind"]) => {
    if (delta === 0) return;
    setFloatingRewards((prev) => [
      ...prev,
      { id: `${Date.now()}-${kind}-${Math.random()}`, amount: Math.abs(delta), kind, sign: delta > 0 ? "+" : "-" },
    ]);
  };

  const doPlace = async (cid: string) => {
    if (!drawerTile) return;
    const prevCoins = state?.coins ?? 0;
    try {
      const result = await api.place(cid, drawerTile.x, drawerTile.y);
      setState(result as PlayerState);
      pushReward((result as PlayerState).coins - prevCoins, "coins");
      void hapticLight();
      setDrawerOpen(false);
    } catch (e: any) {
      alertOrLog("Place Error", e.message || String(e));
    }
  };

  const doSpeedup = async (bid: string) => {
    const prevCoins = state?.coins ?? 0;
    try {
      const result = await api.speedup(bid);
      setState(result as PlayerState);
      pushReward((result as PlayerState).coins - prevCoins, "coins");
      void hapticLight();
      setDrawerOpen(false);
    } catch (e: any) {
      alertOrLog("Speedup Error", e.message || String(e));
    }
  };

  const doDemolish = async (bid: string) => {
    const run = async () => {
      try {
        const result = await api.demolish(bid);
        setState(result as PlayerState);
        setDrawerOpen(false);
      } catch (e: any) {
        alertOrLog("Demolish Error", e.message || String(e));
      }
    };
    if (Platform.OS === "web") {
      if (window.confirm("Demolish this building?")) void run();
    } else {
      Alert.alert("Demolish", "Are you sure?", [
        { text: "Cancel", style: "cancel" },
        { text: "Demolish", style: "destructive", onPress: () => void run() },
      ]);
    }
  };

  const doRunFestival = async () => {
    if (!state) return;
    const ready = state.buildings.filter((b) => b.status === "ready");
    if (ready.length === 0) {
      alertOrLog("No Ready Buildings", "Finish at least one building to run a festival.");
      return;
    }
    if (!state.genre) {
      alertOrLog("No Genre Selected", "Pick a genre in the planning screen.");
      return;
    }

    const breakdown = computeScore(
      state.buildings,
      state.lineup ?? [],
      state.genre ?? null,
      catalog
    );

    try {
      const result = await api.simulate(breakdown);

      setState((prev) => ({ ...prev!, ...result.state }));
      if (result.rewards.coins !== 0) pushReward(result.rewards.coins, "coins");
      if (result.rewards.xp !== 0) pushReward(result.rewards.xp, "xp");

      if (result.grade === "S" || result.grade === "A") {
        void hapticSuccess();
      } else if (result.grade === "D" || result.grade === "F") {
        void hapticWarning();
      } else {
        void hapticLight();
      }

      Analytics.eventOccurred("festival_run", {
        grade: result.grade,
        score: result.composite,
      });

      if (result.new_achievements && result.new_achievements.length > 0) {
        setAchievementStack(result.new_achievements as Achievement[]);
      }

      router.push({
        pathname: "/result",
        params: {
          grade: result.grade,
          score: String(result.composite),
          breakdown: JSON.stringify(result.breakdown),
        },
      });
    } catch (e: any) {
      alertOrLog("Festival Error", e.message || String(e));
    }
  };

  if (loading && !state) {
    return (
      <View style={styles.root}>
        {loadError ? (
          <>
            <Text style={{ color: COLORS.error, marginTop: 20, textAlign: "center", fontSize: 14 }}>
              ✗ Failed to load
            </Text>
            <Text style={{ color: COLORS.textSecondary, marginTop: 16, textAlign: "center", maxWidth: 480, fontSize: 12 }}>
              {loadError}
            </Text>
          </>
        ) : (
          <>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={{ color: COLORS.textSecondary, marginTop: 12, letterSpacing: 2 }}>
              LOADING FESTIVAL...
            </Text>
          </>
        )}
      </View>
    );
  }

  if (!state) {
    return (
      <View style={styles.root}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={{ color: COLORS.textSecondary, marginTop: 12, letterSpacing: 2 }}>
          LOADING FESTIVAL...
        </Text>
      </View>
    );
  }

  const worldWidth = VISUAL_MAX * TILE_W;
  const worldHeight = (VISUAL_MAX + 1) * TILE_H + 80;
  const sortedBuildings = [...state.buildings].sort((a, b) => a.x + a.y - (b.x + b.y));

  return (
    <View style={[styles.root, { paddingTop: insets.top + 6 }]}>
      <View testID="top-hud">
        <HUD
          coins={state.coins}
          xp={state.xp}
          level={state.level}
          phase={state.phase}
          activeBuilds={activeBuilds}
          day={state.day}
          cycle={state.cycle}
          genre={state.genre}
          specialization={state.specialization ?? null}
          buildCap={state.build_cap}
          artistCap={state.artist_cap}
          buildSlotsUsed={state.build_slots_used}
          artistSlotsUsed={state.artist_slots_used}
          onOpenLeaderboard={() => router.push("/leaderboard")}
          onOpenPlanning={() => router.push("/planning")}
          onOpenMenu={() => router.push("/menu")}
          onOpenLegacy={() => router.push("/legacy")}
        />
        {state.day >= 7 ? (
          <Text style={[styles.lastResult, { color: COLORS.primary }]} testID="festival-day-banner">
            🎪 FESTIVAL DAY — Run Festival now to score!
          </Text>
        ) : !state.genre ? (
          <Text style={[styles.lastResult, { color: COLORS.warning }]} testID="planning-banner">
            Day {state.day}/7 · Open planning to pick your genre & lineup →
          </Text>
        ) : state.last_grade ? (
          <Text style={styles.lastResult} testID="last-grade-banner">
            Last festival: <Text style={{ color: COLORS.accent }}>{state.last_grade}</Text> ·{" "}
            {state.last_score}/100 · Day {state.day}/7
          </Text>
        ) : (
          <Text style={styles.lastResult}>
            Day {state.day}/7 · {state.lineup.length} artist(s) booked · Build & wait
          </Text>
        )}
        {offline && (
          <View style={styles.offlinePill} testID="offline-pill">
            <Text style={styles.offlinePillText}>⚠ OFFLINE — showing last saved festival</Text>
          </View>
        )}
      </View>

      {/* Pinch-to-zoom only applies on native — GestureDetector on web swallows
          tile taps (the double-tap recognizer delays single-tap events and they
          never reach the Pressable touch targets inside IsometricGrid). */}
      {Platform.OS !== "web" ? (
        <GestureDetector gesture={composed}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ alignItems: "center" }}
            style={styles.worldScrollX}
          >
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingVertical: 16 }}
            >
              <Animated.View
                style={[
                  { width: worldWidth + 40, height: worldHeight + 40, alignItems: "center", paddingTop: 20 },
                  animatedGridStyle,
                ]}
                testID="isometric-playfield"
              >
                <View style={{ width: worldWidth, height: worldHeight }}>
                  <IsometricGrid
                    gridSize={gridSize}
                    selected={selectedTile}
                    onTilePress={handleTilePress}
                    buildings={sortedBuildings}
                    catalog={catalog}
                    serverNow={state.server_time}
                  />
                </View>
              </Animated.View>
            </ScrollView>
          </ScrollView>
        </GestureDetector>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ alignItems: "center" }}
          style={styles.worldScrollX}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingVertical: 16 }}
          >
            <View
              style={{ width: worldWidth + 40, height: worldHeight + 40, alignItems: "center", paddingTop: 20 }}
              testID="isometric-playfield"
            >
              <View style={{ width: worldWidth, height: worldHeight }}>
                <IsometricGrid
                  gridSize={gridSize}
                  selected={selectedTile}
                  onTilePress={handleTilePress}
                  buildings={sortedBuildings}
                  catalog={catalog}
                  serverNow={state.server_time}
                />
              </View>
            </View>
          </ScrollView>
        </ScrollView>
      )}

      <View style={styles.bottomBar}>
        <TouchableOpacity
          onPress={doRunFestival}
          style={[styles.actionButton, state.day < 7 && { opacity: 0.5 }]}
          disabled={state.day < 7}
          testID="run-festival-button"
        >
          <Ionicons name="play" size={20} color={COLORS.textPrimary} />
          <Text style={styles.actionButtonText}>RUN FESTIVAL</Text>
        </TouchableOpacity>
      </View>

      {drawerOpen && (
        <BuildDrawer
          mode={drawerMode}
          tile={drawerTile}
          state={state}
          catalog={catalog}
          onPlace={doPlace}
          onSpeedup={doSpeedup}
          onDemolish={doDemolish}
          onClose={() => setDrawerOpen(false)}
        />
      )}

      {achievementStack && achievementStack.length > 0 && (
        <AchievementToast
          achievements={achievementStack}
          onDone={() => setAchievementStack(null)}
        />
      )}

      <FloatingReward
        rewards={floatingRewards}
        onDone={(id) => setFloatingRewards((prev) => prev.filter((r) => r.id !== id))}
        style={{ top: insets.top + 8, right: 50 }}
      />

      {showSpecPicker && (
        <TutorialModal
          onClose={() => setShowSpecPicker(false)}
          onPickSpec={handlePickSpec}
        />
      )}
    </View>
  );
}

function alertOrLog(title: string, msg: string) {
  if (Platform.OS === "web") {
    console.warn(`${title}: ${msg}`);
  } else {
    Alert.alert(title, msg);
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0a0a14",
    alignItems: "center",
    justifyContent: "center",
  },
  worldScrollX: { flex: 1 },
  lastResult: {
    color: COLORS.textSecondary,
    fontSize: 12,
    textAlign: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  offlinePill: {
    backgroundColor: "rgba(255, 152, 0, 0.1)",
    borderWidth: 1,
    borderColor: COLORS.warning,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginTop: 6,
    borderRadius: 4,
    alignItems: "center",
  },
  offlinePillText: { color: COLORS.warning, fontSize: 11, fontWeight: "700" },
  bottomBar: {
    paddingBottom: 12,
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    width: "100%",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.accent,
    paddingVertical: 12,
    borderRadius: 6,
  },
  actionButtonText: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 1,
  },
});
