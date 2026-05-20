import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { api, loadCachedState, loadCachedCatalog, type CatalogItem, type PlayerState, type SimResult } from "../src/api";
import { COLORS, CATEGORY_COLORS } from "../src/theme";
import { computeScore, type ScoreBreakdown } from "../src/lib/scoring";
import { ensurePermission, scheduleBuildComplete, cancelScheduled } from "../src/notifications";
import { Analytics } from "../src/analytics";
import HUD from "../src/components/HUD";
import BuildDrawer from "../src/components/BuildDrawer";
import IsometricGrid, { TILE_W, TILE_H, gridToScreen } from "../src/components/IsometricGrid";
import BuildingSprite from "../src/components/BuildingSprite";
import ConstructionTimer from "../src/components/ConstructionTimer";
import SimulationModal from "../src/components/SimulationModal";
import SimulationOverlay from "../src/components/SimulationOverlay";
import TierUpgradeModal from "../src/components/TierUpgradeModal";
import type { LegacyTier } from "../src/legacy";

const SPEC_CHOICES = [
  { path: "producer", label: "Producer", emoji: "🎛", color: "#FF0055", bonus: "+ Stage Score",     detail: "Your stages hit harder" },
  { path: "promoter", label: "Promoter", emoji: "📣", color: "#FF9900", bonus: "+ Vendor Score",    detail: "Your vendors pull bigger crowds" },
  { path: "operator", label: "Operator", emoji: "⚙️", color: "#00FFFF", bonus: "½ Build Penalty",   detail: "Unfinished builds hurt less" },
  { path: "curator",  label: "Curator",  emoji: "🎨", color: "#FFD700", bonus: "+ Aesthetic Score", detail: "Your decor wows the crowd" },
] as const;

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
  // Tier upgrade is shown FIRST (full-screen) before the normal results modal,
  // so the new tier feels like a milestone and not a footnote.
  const [tierUpgradeOpen, setTierUpgradeOpen] = useState(false);
  const [pendingTierUpgrade, setPendingTierUpgrade] = useState<{
    from: LegacyTier;
    to: LegacyTier;
    reputation_score: number;
  } | null>(null);
  const [simAnimating, setSimAnimating] = useState(false);
  const [simBreakdown, setSimBreakdown] = useState<ScoreBreakdown>({
    stage_score: 0, crowd_flow: 0, vendor_coverage: 0,
    utility_coverage: 0, aesthetic: 0, chemistry_bonus: 0, composite: 0,
  });
  const pendingResultRef = useRef<SimResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const lastPolledRef = useRef(0);

  useEffect(() => {
    Analytics.screenView("main_game");
  }, []);

  // Auto-show specialization picker for saves that haven't chosen a path yet.
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

  const [loadError, setLoadError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [showSpecPicker, setShowSpecPicker] = useState(false);
  const hydratedFromCacheRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    // 1) Instant hydrate from local cache (do not block on network).
    //    Use functional setState guards so a slow cache read can never overwrite
    //    a faster server response.
    (async () => {
      const [cachedCat, cachedState] = await Promise.all([loadCachedCatalog(), loadCachedState()]);
      if (cancelled) return;
      if (cachedCat) {
        setCatalog((prev) => (prev.length ? prev : cachedCat.catalog));
        setGridSize((prev) => prev || cachedCat.grid_size);
      }
      if (cachedState) {
        setState((prev) => {
          if (prev) return prev; // server already populated — keep fresher data
          hydratedFromCacheRef.current = true;
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
        if (hydratedFromCacheRef.current) {
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
    const set = new Set<string>();
    state?.buildings.forEach((b) => set.add(`${b.x},${b.y}`));
    return set;
  }, [state]);

  const activeBuilds = state?.buildings.filter((b) => b.status === "building").length ?? 0;

  const handleTilePress = useCallback(
    (x: number, y: number) => {
      if (occupied.has(`${x},${y}`)) {
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
      setOffline(false);
      Analytics.buildingPlaced(item.id, item.category, item.tier, item.cost);
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
      Analytics.errorOccurred("place_failed", e.message || String(e), "handlePick");
      alertOrLog("Cannot place", e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const doSpeedup = async (id: string) => {
    setBusy(true);
    try {
      const building = state?.buildings.find((b) => b.id === id);
      const s = await api.speedup(id);
      setState(s as PlayerState);
      setOffline(false);
      if (building) {
        const item = catalog.find((c) => c.id === building.catalog_id);
        const coinsSpent = item ? Math.ceil(item.cost * 0.5) : 0;
        Analytics.buildingSpedUp(building.catalog_id, coinsSpent);
      }
      cancelScheduled(id).catch(() => {});
    } catch (e: any) {
      Analytics.errorOccurred("speedup_failed", e.message || String(e), "doSpeedup");
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
    // Compute client-side score breakdown so the overlay agents reflect
    // the actual festival layout before the server responds.
    const breakdown = computeScore(
      state.buildings,
      state.lineup,
      state.genre ?? null,
      catalog,
    );
    setSimBreakdown(breakdown);
    setBusy(true);
    setSimAnimating(true);
    pendingResultRef.current = null;
    try {
      const r = await api.simulate(breakdown);
      pendingResultRef.current = r as SimResult;
      setOffline(false);
      Analytics.festivalRun(
        r.grade,
        r.composite,
        state.cycle,
        r.rewards.coins,
        r.rewards.xp
      );
      refreshState().catch(() => {});
    } catch (e: any) {
      setSimAnimating(false);
      Analytics.errorOccurred("simulate_failed", e.message || String(e), "handleRunFestival");
      alertOrLog("Festival Cancelled", e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleAnimationComplete = () => {
    setSimAnimating(false);
    const r = pendingResultRef.current;
    if (!r) return;
    setSimResult(r);
    // If the player crossed a tier this run, celebrate it BEFORE the normal
    // results modal — it's the headline event of the session.
    if (r.tier_upgrade && r.tier_upgrade.to !== r.tier_upgrade.from) {
      setPendingTierUpgrade({
        from: r.tier_upgrade.from as LegacyTier,
        to: r.tier_upgrade.to as LegacyTier,
        reputation_score: r.tier_upgrade.reputation_score,
      });
      setTierUpgradeOpen(true);
    } else {
      setSimOpen(true);
    }
  };

  const handleTierUpgradeClose = () => {
    setTierUpgradeOpen(false);
    setPendingTierUpgrade(null);
    // Then surface the regular results card.
    setSimOpen(true);
  };

  if (loading || !state) {
    return (
      <View style={[styles.center, { backgroundColor: COLORS.bg, padding: 24 }]}>
        {loadError ? (
          <>
            <Text style={{ color: COLORS.primary, fontSize: 16, fontWeight: "700", letterSpacing: 2, marginBottom: 8 }}>
              SIGN-IN FAILED
            </Text>
            <Text style={{ color: COLORS.textSecondary, textAlign: "center", maxWidth: 480, lineHeight: 20 }}>
              {loadError}
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
          <Text style={styles.lastResult}>Day {state.day}/7 · {state.lineup.length} artist(s) booked · Build & wait</Text>
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
                occupiedSet={occupied}
              />
              {sortedBuildings.map((b) => {
                const item = catalog.find((c) => c.id === b.catalog_id);
                if (!item) return null;
                const { sx, sy } = gridToScreen(b.x, b.y, gridSize);
                const spriteHeight = 16 + item.tier * 8 + TILE_H;
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
        scoreBreakdown={simBreakdown}
        onComplete={handleAnimationComplete}
      />
      <TierUpgradeModal
        visible={tierUpgradeOpen}
        fromTier={pendingTierUpgrade?.from ?? null}
        toTier={pendingTierUpgrade?.to ?? null}
        reputationScore={pendingTierUpgrade?.reputation_score ?? 0}
        onClose={handleTierUpgradeClose}
      />
      <SimulationModal
        visible={simOpen}
        result={simResult}
        onClose={() => setSimOpen(false)}
      />

      {/* ── Specialization Picker ── */}
      <Modal visible={showSpecPicker} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.specOverlay}>
          <View style={styles.specModal}>
            <Text style={styles.specTitle}>CHOOSE YOUR PATH</Text>
            <Text style={styles.specSubtitle}>
              Your specialization gives a permanent passive bonus. Chosen once — choose wisely.
            </Text>
            <View style={styles.specGrid}>
              {SPEC_CHOICES.map((s) => (
                <TouchableOpacity
                  key={s.path}
                  style={[styles.specCard, { borderColor: s.color + "66" }]}
                  onPress={() => handlePickSpec(s.path)}
                  testID={`spec-choice-${s.path}`}
                >
                  <Text style={styles.specCardEmoji}>{s.emoji}</Text>
                  <Text style={[styles.specCardLabel, { color: s.color }]}>{s.label.toUpperCase()}</Text>
                  <Text style={styles.specCardBonus}>{s.bonus}</Text>
                  <Text style={styles.specCardDetail}>{s.detail}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>
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
  offlinePill: {
    alignSelf: "center",
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,153,0,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,153,0,0.55)",
  },
  offlinePillText: {
    color: "#FFB347",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  worldScrollX: { flex: 1, marginTop: 4 },
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
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
    fontSize: 15,
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
    fontSize: 16,
  },
  specOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.88)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  specModal: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: "#0e0f1a",
    borderRadius: 18,
    padding: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
  },
  specTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 3,
    marginBottom: 8,
    textAlign: "center",
  },
  specSubtitle: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 12,
    textAlign: "center",
    marginBottom: 22,
    lineHeight: 18,
  },
  specGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "center",
    width: "100%",
  },
  specCard: {
    width: "46%",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 12,
    alignItems: "center",
    gap: 4,
  },
  specCardEmoji: { fontSize: 30, marginBottom: 6 },
  specCardLabel: { fontWeight: "900", fontSize: 13, letterSpacing: 1.5 },
  specCardBonus: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginTop: 4,
  },
  specCardDetail: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 10,
    textAlign: "center",
    lineHeight: 14,
  },
});
