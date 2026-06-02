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
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  api,
  type Artist,
  type Genre,
  type PlayerState,
  type CatalogItem,
} from "../src/api";
import { COLORS } from "../src/theme";
import { Analytics } from "../src/analytics";
import HUD from "../src/components/HUD";
import BuildDrawer from "../src/components/BuildDrawer";
import IsometricGrid, { TILE_W, TILE_H } from "../src/components/IsometricGrid";
import AchievementToast from "../src/components/AchievementToast";
import TutorialModal from "../src/components/TutorialModal";
import CharacterBubble from "../src/components/CharacterBubble";
import MiniGameModal from "../src/components/MiniGameModal";

const SLOT_CAPS: Record<number, { build: number; artist: number }> = {
  1: { build: 4, artist: 2 },
  2: { build: 6, artist: 3 },
  3: { build: 9, artist: 4 },
  4: { build: 12, artist: 5 },
};

function getSlotCaps(phase: number) {
  return SLOT_CAPS[phase] || SLOT_CAPS[4];
}

export default function Index() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [state, setState] = useState<PlayerState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [showSpecPicker, setShowSpecPicker] = useState(false);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [gridSize, setGridSize] = useState(8);
  const [selectedTile, setSelectedTile] = useState<{ x: number; y: number } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<
    "build" | "view" | null
  >(null);
  const [drawerTile, setDrawerTile] = useState<{ x: number; y: number } | null>(null);
  const [achievementStack, setAchievementStack] = useState<
    { id: string; authID: number }[] | null
  >(null);
  const [tick, setTick] = useState(0);
  const lastPolledRef = useRef(0);

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
    } catch (e) {
      // Network down — keep showing cached state, just flag offline.
      setOffline(true);
      throw e;
    }
  }, []);

  const [oldState, setOldState] = useState<PlayerState | null>(null);

  useEffect(() => {
    let cancelled = false;

    // 1) Instant hydrate from local cache (do not block on network).
    //    Use functional setState guards so a slow cache read can never overwrite
    //    a faster server response.
    (async () => {
      const [cachedCat, cachedState] = await Promise.all([api.loadCachedCatalog(), api.loadCachedState()]);
      if (cancelled) return;
      if (cachedCat) {
        setCatalog((prev) => (prev.length ? prev : cachedCat.catalog));
        setGridSize((prev) => prev || cachedCat.grid_size);
      }
      if (cachedState) {
        setState((prev) => {
          if (prev) return prev; // server already populated — keep fresher data
          setLoading(false);
          return cachedState;
        });
      }
    })();

    // 2) Background sync from server. If it fails but we have cache, mark offline.
    (async () => {
      try {
        const [c, s] = await Promise.all([api.catalog(), api.state()]);
        if (cancelled) return;
        setCatalog(c.catalog);
        setGridSize(c.grid_size);
        setState(s as PlayerState);
        setOffline(false);
        setLoadError(null);
      } catch (e: any) {
        if (cancelled) return;
        const msg = e?.message || String(e);
        Analytics.errorOccurred("load_failed", msg, "index_init");
        if (state) {
          // We have local data — degrade gracefully instead of blocking the UI.
          setOffline(true);
        } else {
          setLoadError(msg);
          alertOrLog("Connection Error", msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 1Hz tick. Every 5s, re-poll state so 'building'->'ready' status is reflected from server.
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

  const occupied = useMemo(() => {
    return new Set((state?.buildings ?? []).map((b) => `${b.x},${b.y}`));
  }, [state?.buildings, tick]);

  const activeBuilds = useMemo(() => {
    return (state?.buildings ?? []).filter((b) => b.status === "ready").length;
  }, [state?.buildings, tick]);

  const handleTilePress = (x: number, y: number) => {
    const occ = occupied.has(`${x},${y}`);
    if (occ) {
      setDrawerMode("view");
      const b = (state?.buildings ?? []).find((b) => b.x === x && b.y === y);
      if (b) {
        setDrawerTile({ x, y });
        setSelectedTile({ x, y });
        setDrawerOpen(true);
      }
    } else {
      setDrawerMode("build");
      setDrawerTile({ x, y });
      setSelectedTile({ x, y });
      setDrawerOpen(true);
    }
  };

  const doPlace = async (cid: string) => {
    if (!drawerTile) return;
    try {
      const result = await api.place(cid, drawerTile.x, drawerTile.y);
      setState(result as PlayerState);
      setDrawerOpen(false);
    } catch (e: any) {
      alertOrLog("Place Error", e.message || String(e));
    }
  };

  const doSpeedup = async (bid: string) => {
    try {
      const result = await api.speedup(bid);
      setState(result as PlayerState);
      setDrawerOpen(false);
    } catch (e: any) {
      alertOrLog("Speedup Error", e.message || String(e));
    }
  };

  const doDemolish = async (bid: string) => {
    Alert.alert("Demolish", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Demolish",
        style: "destructive",
        onPress: async () => {
          try {
            const result = await api.demolish(bid);
            setState(result as PlayerState);
            setDrawerOpen(false);
          } catch (e: any) {
            alertOrLog("Demolish Error", e.message || String(e));
          }
        },
      },
    ]);
  };

  const doRunFestival = async () => {
    if (!state) return;
    const ready = state.buildings.filter((b) => b.status === "ready");
    if (ready.length === 0) {
      Alert.alert("No Ready Buildings", "Finish at least one building to run a festival.");
      return;
    }
    if (!state.genre) {
      Alert.alert("No Genre Selected", "Pick a genre in the planning screen.");
      return;
    }

    setOldState(state);
    const breakdown = await import("../src/lib/scoring").then((m) =>
      m.computeScore({
        gridSize,
        buildings: ready,
        lineup: state.lineup ?? [],
        genre: state.genre ?? "mixed",
        allCatalog: catalog,
        allArtists: await api.artists(),
      })
    );

    try {
      const result = await api.simulate({
        client_score: breakdown,
      });

      setState(result.state as PlayerState);
      Analytics.eventOccurred("festival_run", {
        grade: result.grade,
        score: result.composite,
      });

      if (result.new_achievements && result.new_achievements.length > 0) {
        setAchievementStack(
          result.new_achievements.map((a: any) => ({
            id: a.id,
            authID: 0,
          }))
        );
      }

      router.push({
        pathname: "/result",
        params: {
          grade: result.grade,
          score: JSON.stringify(result.composite),
          breakdown: JSON.stringify(result.breakdown),
        },
      });
    } catch (e: any) {
      alertOrLog("Festival Error", e.message || String(e));
    }
  };

  const getCatalogItem = (cid: string) => catalog.find((c) => c.id === cid);

  if (loading && loadError) {
    return (
      <View style={styles.root}>
        <Text style={{ color: COLORS.danger, marginTop: 20, textAlign: "center" }}>
          Connection Error
        </Text>
        <Text style={{ color: COLORS.textSecondary, marginTop: 8, textAlign: "center", fontSize: 12 }}>
          {loadError}
        </Text>
      </View>
    );
  }

  if (!state) {
    return (
      <View style={styles.root}>
        {loadError ? (
          <>
            <Text style={{ color: COLORS.danger, marginTop: 20, textAlign: "center", fontSize: 14 }}>
              ✗ Failed to load
            </Text>
            <Text style={{ color: COLORS.textSecondary, marginTop: 16, textAlign: "center", maxWidth: 480, fontSize: 12 }}>
              If this is "auth/admin-restricted-operation" or HTTP 400, enable Anonymous sign-in:
              {"\n"}Firebase Console → Authentication → Sign-in method → Anonymous → Enable
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

  const worldWidth = gridSize * TILE_W;
  const worldHeight = (gridSize + 1) * TILE_H + 80;

  const sortedBuildings = [...state.buildings].sort((a, b) => (a.x + a.y) - (b.x + b.y));

  const caps = getSlotCaps(state.phase);
  const buildSlotsUsed = state.buildings.filter((b) => b.status !== "destroyed").length;
  const artistSlotsUsed = state.lineup.length;

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
          buildCap={caps.build}
          artistCap={caps.artist}
          buildSlotsUsed={buildSlotsUsed}
          artistSlotsUsed={artistSlotsUsed}
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
              />
            </View>
          </View>
        </ScrollView>
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity
          onPress={() => doRunFestival()}
          style={[
            styles.actionButton,
            state.day < 7 && { opacity: 0.5 },
          ]}
          disabled={state.day < 7}
          testID="run-festival-button"
        >
          <Ionicons name="play" size={20} color={COLORS.textPrimary} />
          <Text style={styles.actionButtonText}>RUN FESTIVAL</Text>
        </TouchableOpacity>
      </View>

      {drawerOpen && (
        <BuildDrawer
          mode={drawerMode ?? "build"}
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
          onDismiss={() => setAchievementStack(null)}
        />
      )}

      {showSpecPicker && (
        <TutorialModal
          onClose={() => setShowSpecPicker(false)}
          onPickSpec={handlePickSpec}
        />
      )}

      <CharacterBubble state={state} oldState={oldState ?? undefined} />
      <MiniGameModal state={state} onStateChange={setState} />
    </View>
  );
}

function alertOrLog(title: string, msg: string) {
  if (Platform.OS === "web") {
    console.log(`${title}: ${msg}`);
  } else {
    Alert.alert(title, msg);
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0a0a14",
  },
  worldScrollX: {
    flex: 1,
  },
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
  offlinePillText: {
    color: COLORS.warning,
    fontSize: 11,
    fontWeight: "700",
  },
  bottomBar: {
    paddingBottom: 12,
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
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
