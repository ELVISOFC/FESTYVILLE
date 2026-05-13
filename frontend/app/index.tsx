import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { api, type CatalogItem, type PlayerState, type SimResult } from "../src/api";
import { COLORS, CATEGORY_COLORS } from "../src/theme";
import { ensurePermission, scheduleBuildComplete, cancelScheduled } from "../src/notifications";
import HUD from "../src/components/HUD";
import BuildDrawer from "../src/components/BuildDrawer";
import IsometricGrid, { TILE_W, TILE_H, gridToScreen } from "../src/components/IsometricGrid";
import BuildingSprite from "../src/components/BuildingSprite";
import ConstructionTimer from "../src/components/ConstructionTimer";
import SimulationModal from "../src/components/SimulationModal";
import SimulationOverlay from "../src/components/SimulationOverlay";

function alertOrLog(title: string, msg: string) {
  if (Platform.OS === "web") {
    // eslint-disable-next-line no-alert
    window.alert(`${title}\n\n${msg}`);
  } else {
    Alert.alert(title, msg);
  }
}

export default function Index() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [state, setState] = useState<PlayerState | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [gridSize, setGridSize] = useState(8);
  const [selectedTile, setSelectedTile] = useState<{ x: number; y: number } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [simResult, setSimResult] = useState<SimResult | null>(null);
  const [simOpen, setSimOpen] = useState(false);
  const [simAnimating, setSimAnimating] = useState(false);
  const pendingResultRef = useRef<SimResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0); // 1Hz refresh for timer→ready transitions
  const lastPolledRef = useRef(0);

  const refreshState = useCallback(async () => {
    const s = await api.state();
    setState(s as PlayerState);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [c, s] = await Promise.all([api.catalog(), api.state()]);
        setCatalog(c.catalog);
        setGridSize(c.grid_size);
        setState(s as PlayerState);
      } catch (e: any) {
        alertOrLog("Connection Error", e.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
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
    const set = new Set<string>();
    state?.buildings.forEach((b) => set.add(`${b.x},${b.y}`));
    return set;
  }, [state]);

  const activeBuilds = state?.buildings.filter((b) => b.status === "building").length ?? 0;

  const handleTilePress = useCallback(
    (x: number, y: number) => {
      if (occupied.has(`${x},${y}`)) {
        // Tap an occupied tile: speed up if building, otherwise no-op.
        const b = state?.buildings.find((bb) => bb.x === x && bb.y === y);
        if (b && b.status === "building") {
          if (Platform.OS === "web") {
            // eslint-disable-next-line no-alert
            const ok = window.confirm("Speed up this build using coins?");
            if (ok) doSpeedup(b.id);
          } else {
            Alert.alert("Speed Up?", "Pay coins to finish this build now.", [
              { text: "Cancel", style: "cancel" },
              { text: "Speed Up", onPress: () => doSpeedup(b.id) },
            ]);
          }
        }
        return;
      }
      setSelectedTile({ x, y });
      setDrawerOpen(true);
    },
    [occupied, state]
  );

  const handlePick = async (item: CatalogItem) => {
    if (!selectedTile) {
      setDrawerOpen(false);
      return;
    }
    setBusy(true);
    try {
      const s = await api.place(item.id, selectedTile.x, selectedTile.y);
      setState(s as PlayerState);
      // Schedule a local push notification for when this build completes.
      const placed = (s as PlayerState).buildings.find(
        (b) => b.x === selectedTile.x && b.y === selectedTile.y
      );
      if (placed) {
        const granted = await ensurePermission();
        if (granted) {
          scheduleBuildComplete(
            placed.id,
            "Build complete!",
            `Your ${item.name} is ready to rock 🎤`,
            placed.ready_at
          ).catch(() => {});
        }
      }
      setSelectedTile(null);
      setDrawerOpen(false);
    } catch (e: any) {
      alertOrLog("Cannot place", e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const doSpeedup = async (id: string) => {
    setBusy(true);
    try {
      const s = await api.speedup(id);
      setState(s as PlayerState);
      cancelScheduled(id).catch(() => {});
    } catch (e: any) {
      alertOrLog("Cannot speed up", e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleRunFestival = async () => {
    if (!state) return;
    const readyCount = state.buildings.filter((b) => b.status === "ready").length;
    if (readyCount === 0) {
      alertOrLog("Festival Cancelled", "Place and finish at least one building first.");
      return;
    }
    // Start animation immediately, fire the API in parallel.
    setBusy(true);
    setSimAnimating(true);
    pendingResultRef.current = null;
    try {
      const r = await api.simulate();
      pendingResultRef.current = r as SimResult;
      // Refresh state in the background so the next cycle data is fresh.
      refreshState().catch(() => {});
    } catch (e: any) {
      setSimAnimating(false);
      alertOrLog("Festival Cancelled", e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleAnimationComplete = () => {
    setSimAnimating(false);
    const r = pendingResultRef.current;
    if (r) {
      setSimResult(r);
      setSimOpen(true);
    }
  };

  if (loading || !state) {
    return (
      <View style={[styles.center, { backgroundColor: COLORS.bg }]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={{ color: COLORS.textSecondary, marginTop: 12, letterSpacing: 2 }}>
          LOADING FESTIVAL...
        </Text>
      </View>
    );
  }

  const worldWidth = gridSize * TILE_W;
  const worldHeight = (gridSize + 1) * TILE_H + 80; // padding for tall buildings

  // Sort buildings by y+x for proper paint order
  const sortedBuildings = [...state.buildings].sort((a, b) => (a.x + a.y) - (b.x + b.y));

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
          onOpenLeaderboard={() => router.push("/leaderboard")}
          onOpenPlanning={() => router.push("/planning")}
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
          <Text style={styles.lastResult}>Day {state.day}/7 · {state.lineup.length} artist(s) booked · Build & wait</Text>
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
                occupiedSet={occupied}
              />
              {sortedBuildings.map((b) => {
                const item = catalog.find((c) => c.id === b.catalog_id);
                if (!item) return null;
                const { sx, sy } = gridToScreen(b.x, b.y, gridSize);
                const spriteHeight = 16 + item.tier * 8 + TILE_H; // matches BuildingSprite
                const top = sy - spriteHeight + TILE_H;
                return (
                  <View
                    key={b.id}
                    style={{ position: "absolute", left: sx, top, alignItems: "center" }}
                    testID={`building-${b.catalog_id}-${b.x}-${b.y}`}
                  >
                    <BuildingSprite
                      category={item.category}
                      tier={item.tier}
                      ready={b.status === "ready"}
                    />
                    {b.status === "building" && (
                      <View
                        style={{
                          position: "absolute",
                          top: -24,
                          left: -2,
                          width: TILE_W + 8,
                        }}
                      >
                        <ConstructionTimer
                          readyAt={b.ready_at}
                          placedAt={b.placed_at}
                          serverNow={state.server_time}
                          onSpeedup={() => doSpeedup(b.id)}
                        />
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        </ScrollView>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 10 }]}>
        <TouchableOpacity
          style={styles.buildBtn}
          onPress={() => {
            setSelectedTile(null);
            setDrawerOpen(true);
          }}
          testID="btn-open-build"
        >
          <Ionicons name="hammer" size={18} color="#fff" />
          <Text style={styles.buildBtnText}>BUILD</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.runBtn, busy && { opacity: 0.6 }]}
          disabled={busy}
          onPress={handleRunFestival}
          testID="btn-run-festival"
        >
          <Ionicons name="play" size={22} color="#fff" />
          <Text style={styles.runBtnText}>RUN FESTIVAL</Text>
        </TouchableOpacity>
      </View>

      <BuildDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        catalog={catalog}
        phase={state.phase}
        coins={state.coins}
        onPick={handlePick}
      />
      <SimulationOverlay
        visible={simAnimating}
        gridSize={gridSize}
        buildings={state.buildings}
        catalog={catalog}
        onComplete={handleAnimationComplete}
      />
      <SimulationModal
        visible={simOpen}
        result={simResult}
        onClose={() => setSimOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  lastResult: {
    color: COLORS.textSecondary,
    fontSize: 11,
    textAlign: "center",
    marginTop: 6,
    letterSpacing: 1,
  },
  worldScrollX: { flex: 1, marginTop: 4 },
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: "#0c0d15",
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  buildBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.surfaceElev,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  buildBtnText: {
    color: COLORS.textPrimary,
    fontWeight: "900",
    letterSpacing: 2,
    fontSize: 13,
  },
  runBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 999,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.6,
    shadowRadius: 14,
    elevation: 8,
  },
  runBtnText: {
    color: "#fff",
    fontWeight: "900",
    letterSpacing: 3,
    fontSize: 14,
  },
});
