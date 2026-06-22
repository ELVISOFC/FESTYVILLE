import { useEffect, useState, useMemo, useRef } from "react";
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
  loadCachedArtists,
  loadCachedState,
  loadCachedCatalog,
  type Artist,
  type Genre,
  type PlayerState,
  type Achievement,
  type CatalogItem,
} from "../src/api";
import { COLORS } from "../src/theme";
import { hapticLight } from "../src/haptics";
import { Analytics } from "../src/analytics";
import TutorialModal from "../src/components/TutorialModal";
import CharacterBubble from "../src/components/CharacterBubble";
import MiniGameModal from "../src/components/MiniGameModal";
import AchievementToast from "../src/components/AchievementToast";
import FloatingReward, { type FloatingRewardEntry } from "../src/components/FloatingReward";
import DayTransition from "../src/components/DayTransition";
import { computeScore, computeChemistry, type ScoreBreakdown } from "../src/lib/scoring";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GENRE_COLORS: Record<string, string> = {
  edm:    "#00FFFF",
  indie:  "#00FF66",
  hiphop: "#FF9900",
  rock:   "#FF0055",
  mixed:  "#FFD700",
};

const DIM_COLORS = {
  stage:   "#FF0055",
  crowd:   "#00FFFF",
  vendor:  "#FF9900",
  utility: "#00FF66",
  decor:   "#FFD700",
};

// ---------------------------------------------------------------------------
// Grade helper
// ---------------------------------------------------------------------------

function gradeFor(n: number): { letter: string; color: string } {
  if (n >= 90) return { letter: "S", color: "#00FFFF" };
  if (n >= 80) return { letter: "A", color: "#00FF66" };
  if (n >= 65) return { letter: "B", color: "#AAFF00" };
  if (n >= 50) return { letter: "C", color: "#FFD700" };
  if (n >= 35) return { letter: "D", color: "#FF9900" };
  return { letter: "F", color: "#FF4455" };
}

// ---------------------------------------------------------------------------
// ScoreLiveBar
// ---------------------------------------------------------------------------

type ScoreLiveBarProps = {
  score: ScoreBreakdown;
  hasReadyBuildings: boolean;
};

function ScoreLiveBar({ score, hasReadyBuildings }: ScoreLiveBarProps) {
  const grade = gradeFor(score.composite);

  const dims: Array<{ key: string; label: string; value: number; max: number; color: string }> = [
    { key: "stage",   label: "Stage",    value: score.stage_score,      max: 30, color: DIM_COLORS.stage   },
    { key: "crowd",   label: "Crowd",    value: score.crowd_flow,        max: 20, color: DIM_COLORS.crowd   },
    { key: "vendor",  label: "Vendor",   value: score.vendor_coverage,   max: 20, color: DIM_COLORS.vendor  },
    { key: "utility", label: "Utility",  value: score.utility_coverage,  max: 15, color: DIM_COLORS.utility },
    { key: "decor",   label: "Aesthetic", value: score.aesthetic,        max: 15, color: DIM_COLORS.decor   },
  ];

  const fillPct = Math.min(100, (score.composite / 110) * 100); // 110 = theoretical max with genre bonus

  return (
    <View style={sb.container}>
      {/* Header row */}
      <View style={sb.headerRow}>
        <Text style={sb.label}>⚡ LIVE SCORE</Text>
        <View style={sb.compositeGroup}>
          <Text style={sb.compositeNum}>{score.composite}</Text>
          <View style={[sb.gradePill, { borderColor: grade.color + "66", backgroundColor: grade.color + "18" }]}>
            <Text style={[sb.gradeLetter, { color: grade.color }]}>{grade.letter}</Text>
          </View>
        </View>
      </View>

      {/* Composite progress bar */}
      <View style={sb.progressTrack}>
        <View style={[sb.progressFill, { width: `${fillPct}%` as any, backgroundColor: grade.color }]} />
      </View>

      {/* 5 dimension mini-bars */}
      <View style={sb.dimsRow}>
        {dims.map((d) => {
          const pct = d.max > 0 ? Math.min(1, d.value / d.max) : 0;
          return (
            <View key={d.key} style={sb.dimCell}>
              <Text style={sb.dimLabel}>{d.label}</Text>
              <View style={sb.dimTrack}>
                <View
                  style={[
                    sb.dimFill,
                    { width: `${Math.round(pct * 100)}%` as any, backgroundColor: d.color },
                  ]}
                />
              </View>
              <Text style={[sb.dimVal, { color: d.color }]}>
                {Math.round(d.value)}/{d.max}
              </Text>
            </View>
          );
        })}
      </View>

      {!hasReadyBuildings && (
        <Text style={sb.emptyHint}>Place buildings on your lot to see your score</Text>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function alertOrLog(title: string, msg: string) {
  if (Platform.OS === "web") window.alert(`${title}\n\n${msg}`);
  else Alert.alert(title, msg);
}

// ---------------------------------------------------------------------------
// CycleGoalCard Component
// ---------------------------------------------------------------------------

type CycleGoalCardProps = {
  goal: PlayerState["current_cycle_goal"];
};

function CycleGoalCard({ goal }: CycleGoalCardProps) {
  if (!goal) return null;

  const goalTypeColors: Record<string, string> = {
    infra: "#FF9900",
    lineup: "#A78BFA",
    score: "#00FF66",
    genre: "#FFD700",
  };

  const borderColor = goalTypeColors[goal.type] || "#999999";
  const isDone = goal.completed;

  return (
    <View style={[styles.cycleGoalCard, { borderColor }]}>
      <View style={styles.cycleGoalHeader}>
        <Text style={styles.cycleGoalLabel}>
          CYCLE GOAL · {goal.type.toUpperCase()}
        </Text>
        {isDone && <Text style={styles.cycleGoalDone}>✓ DONE</Text>}
      </View>
      <Text style={styles.cycleGoalText}>{goal.label}</Text>
      <Text style={styles.cycleGoalReward}>Reward: {goal.reward_label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Planning screen
// ---------------------------------------------------------------------------

export default function Planning() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [state,   setState]   = useState<PlayerState | null>(null);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [genres,  setGenres]  = useState<Genre[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [busy,    setBusy]    = useState(false);
  const [miniGameOpen, setMiniGameOpen] = useState(false);
  const [toastAchs,    setToastAchs]   = useState<Achievement[]>([]);
  const toastQueue = useRef<Achievement[][]>([]);
  const [floatingRewards, setFloatingRewards] = useState<FloatingRewardEntry[]>([]);
  const [dayTransitionVisible, setDayTransitionVisible] = useState(false);
  const dayTransitionResolveRef = useRef<(() => void) | null>(null);

  const showAchievements = (achs: Achievement[]) => {
    if (!achs || achs.length === 0) return;
    for (const a of achs) toastQueue.current.push([a]);
    if (toastAchs.length === 0) drainQueue();
  };

  const drainQueue = () => {
    const next = toastQueue.current.shift();
    if (next) setToastAchs(next);
  };

  const pushReward = (delta: number, kind: FloatingRewardEntry["kind"]) => {
    if (delta === 0) return;
    setFloatingRewards((prev) => [
      ...prev,
      { id: `${Date.now()}-${kind}-${Math.random()}`, amount: Math.abs(delta), kind, sign: delta > 0 ? "+" : "-" },
    ]);
  };

  useEffect(() => {
    Analytics.screenView("planning");
    let cancelled = false;

    // 1) Instant hydrate from local cache (do not block on network).
    //    Functional setState guards mean a slow cache read can never
    //    clobber a faster server response that already landed.
    (async () => {
      const [cachedArtists, cachedState, cachedCatalog] = await Promise.all([
        loadCachedArtists(),
        loadCachedState(),
        loadCachedCatalog(),
      ]);
      if (cancelled) return;
      if (cachedArtists) {
        setArtists((prev) => (prev.length ? prev : cachedArtists.artists));
        setGenres((prev) => (prev.length ? prev : cachedArtists.genres));
      }
      if (cachedCatalog) {
        setCatalog((prev) => (prev.length ? prev : cachedCatalog.catalog));
      }
      if (cachedState) {
        setState((prev) => {
          if (prev) return prev; // server already answered — keep the fresher data
          setLoading(false);
          return cachedState;
        });
      }
    })();

    // 2) Background sync from server. If it fails but we already have cached
    //    data on screen, degrade to an offline pill instead of blocking.
    (async () => {
      try {
        const [a, s, cat] = await Promise.all([api.artists(), api.state(), api.catalog()]);
        if (cancelled) return;
        setArtists(a.artists);
        setGenres(a.genres);
        setState(s as PlayerState);
        setCatalog((cat as any).catalog ?? []);
        setOffline(false);
      } catch (e: any) {
        if (cancelled) return;
        const msg = e.message || String(e);
        Analytics.errorOccurred("load_failed", msg, "planning_init");
        // Read the *live* state, not the one closed over at mount (which is
        // always null here) — a functional setState update is the safe way
        // to check "did cache hydration already put something on screen?".
        setState((current) => {
          if (current) {
            setOffline(true);
          } else {
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

  // Live score — recomputes whenever buildings, lineup or genre change
  const liveScore = useMemo<ScoreBreakdown>(() => {
    if (!state || catalog.length === 0) {
      return {
        stage_score: 0, crowd_flow: 0, vendor_coverage: 0,
        utility_coverage: 0, aesthetic: 0, chemistry_bonus: 0, composite: 0,
      };
    }
    return computeScore(state.buildings, state.lineup, state.genre ?? null, catalog);
  }, [state?.buildings, state?.lineup, state?.genre, catalog]);

  const hasReadyBuildings = useMemo(
    () => (state?.buildings ?? []).some((b) => b.status === "ready"),
    [state?.buildings],
  );

  const filteredArtists = useMemo(() => {
    if (!state?.genre || state.genre === "mixed") return artists;
    return artists.filter((a) => a.genre === state.genre);
  }, [artists, state?.genre]);

  // Live chemistry — recomputes whenever the booked lineup or roster changes.
  // Mirrors computeChemistry in scoring.ts (0–10 bonus). Hidden if <2 artists.
  const chemistry = useMemo(() => {
    const lineup = state?.lineup ?? [];
    if (lineup.length < 2 || artists.length === 0) return null;
    const byId = new Map(artists.map((a) => [a.id, a]));
    const genres = lineup.map((id) => byId.get(id)?.genre).filter(Boolean) as string[];
    if (genres.length < 2) return null;
    return computeChemistry(genres);
  }, [state?.lineup, artists]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const pickGenre = async (gid: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const s = await api.setGenre(gid);
      setState(s as PlayerState);
      Analytics.genreSelected(gid);
    } catch (e: any) { alertOrLog("Cannot set genre", e.message); }
    finally { setBusy(false); }
  };

  const toggleArtist = async (a: Artist) => {
    if (!state || busy) return;
    setBusy(true);
    const inLineup = state.lineup.includes(a.id);
    const prevCoins = state.coins;
    try {
      const s = inLineup ? await api.unbookArtist(a.id) : await api.bookArtist(a.id);
      setState(s as PlayerState);
      const coinDelta = (s as PlayerState).coins - prevCoins;
      if (coinDelta !== 0) pushReward(coinDelta, "coins");
      void hapticLight();
      if (!inLineup && (s as any).new_achievements?.length) {
        showAchievements((s as any).new_achievements);
      }
      if (inLineup) Analytics.artistUnbooked(a.id);
      else Analytics.artistBooked(a.id, a.genre, a.tier, a.fee);
    } catch (e: any) { alertOrLog(inMessage(inLineup), e.message); }
    finally { setBusy(false); }
  };

  const handleDayTransitionComplete = () => {
    dayTransitionResolveRef.current?.();
    dayTransitionResolveRef.current = null;
  };

  const endDay = async () => {
    if (!state || busy) return;
    setBusy(true);

    // Days 1-6: show the brief transition overlay immediately (before the await)
    // and run the API request in parallel. Promise.all ensures state is only
    // applied after BOTH the overlay animation AND the request are done, so the
    // overlay always plays its full ~720ms even on a fast connection.
    // Day 7+: no overlay — the Run Festival / SimulationOverlay handles that.
    const isRoutineAdvance = state.day < 7;
    let overlayDoneP: Promise<void> = Promise.resolve();
    if (isRoutineAdvance) {
      setDayTransitionVisible(true);
      overlayDoneP = new Promise<void>((resolve) => {
        dayTransitionResolveRef.current = resolve;
      });
    }

    try {
      const [s] = await Promise.all([api.advanceDay(), overlayDoneP]);
      setDayTransitionVisible(false);
      setState(s as PlayerState);
      const le = (s as PlayerState).last_event;
      if (le) {
        if (le.coins !== 0) pushReward(le.coins, "coins");
        if (le.xp !== 0) pushReward(le.xp, "xp");
      }
      void hapticLight();
      Analytics.dayAdvanced(s.day, s.cycle);
      if ((s as any).new_achievements?.length) {
        showAchievements((s as any).new_achievements);
      }
    } catch (e: any) {
      dayTransitionResolveRef.current = null;
      setDayTransitionVisible(false);
      alertOrLog("Cannot end day", e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleMiniGameReward = async (_coins: number, _xp: number) => {
    try {
      const s = await api.state();
      setState(s as PlayerState);
      if (_coins !== 0) pushReward(_coins, "coins");
      if (_xp !== 0) pushReward(_xp, "xp");
    } catch {}
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading || !state) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  const day = state.day;
  const isFestivalDay = day >= 7;
  const ch = state.daily_challenge;
  const miniPlayedToday = state.minigame_last === `${state.cycle}_${state.day}`;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      {/* Achievement toast */}
      <FloatingReward
        rewards={floatingRewards}
        onDone={(id) => setFloatingRewards((prev) => prev.filter((r) => r.id !== id))}
        style={{ top: insets.top + 50, right: 16 }}
      />
      <DayTransition
        visible={dayTransitionVisible}
        day={state?.day ?? 1}
        onComplete={handleDayTransitionComplete}
      />

      {toastAchs.length > 0 && (
        <AchievementToast achievements={toastAchs} onDone={() => { setToastAchs([]); drainQueue(); }} />
      )}

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="planning-back" style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={{ alignItems: "center" }}>
          <Text style={styles.title}>PRE-PLANNING</Text>
          <Text style={styles.subtitle}>Cycle {state.cycle} · Day {day} / 7</Text>
        </View>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => setMiniGameOpen(true)}
          disabled={miniPlayedToday}
          testID="planning-minigame-btn"
        >
          <Text style={{ fontSize: 20, opacity: miniPlayedToday ? 0.3 : 1 }}>🎮</Text>
        </TouchableOpacity>
      </View>

      {offline && (
        <View style={styles.offlinePill} testID="offline-pill">
          <Text style={styles.offlinePillText}>⚠ OFFLINE — showing last saved plan</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 200 }}>

        {/* Cycle Goal Card */}
        <CycleGoalCard goal={state.current_cycle_goal} />

        {/* Daily Challenge */}
        {ch && (
          <View style={[styles.challengeCard, ch.completed && styles.challengeDone]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.challengeLabel}>
                {ch.completed ? "✅ DAILY CHALLENGE — DONE!" : "🎯 DAILY CHALLENGE"}
              </Text>
              <Text style={styles.challengeText}>{ch.text}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.challengeReward}>+{ch.coins}c</Text>
              <Text style={styles.challengeRewardXp}>+{ch.xp} XP</Text>
            </View>
          </View>
        )}

        {/* Streak */}
        {state.streak > 0 && (
          <View style={styles.streakRow}>
            <Text style={styles.streakText}>🔥 Day streak: {state.streak}</Text>
            {state.streak >= 3 && <Text style={styles.streakBonus}>+100c bonus every 3 days!</Text>}
          </View>
        )}

        {/* Genre picker */}
        <Text style={styles.sectionLabel}>1. PICK A GENRE</Text>
        <View style={styles.genreRow}>
          {genres.map((g) => {
            const sel = state.genre === g.id;
            const c = GENRE_COLORS[g.id] || COLORS.accent;
            return (
              <TouchableOpacity
                key={g.id}
                onPress={() => pickGenre(g.id)}
                style={[styles.genreChip, sel && { borderColor: c, backgroundColor: c + "22" }]}
                testID={`genre-chip-${g.id}`}
              >
                <View style={[styles.genreDot, { backgroundColor: c }]} />
                <Text style={[styles.genreLabel, sel && { color: COLORS.textPrimary }]}>{g.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Lineup */}
        <Text style={[styles.sectionLabel, { marginTop: 18 }]}>2. BOOK THE LINEUP</Text>
        {!state.genre && (
          <Text style={styles.hint}>Pick a genre first to see eligible artists.</Text>
        )}
        {state.genre && chemistry !== null && (() => {
          const ratio = chemistry / 10;
          const color = ratio > 0.7 ? "#00FF66" : ratio >= 0.4 ? "#FFD700" : "#FF4455";
          const label = ratio > 0.7 ? "Great chemistry" : ratio >= 0.4 ? "Mixed bag" : "Genre clash";
          return (
            <View style={styles.chemCard} testID="chemistry-bar">
              <View style={styles.chemHeader}>
                <Text style={styles.chemLabel}>🎵 LINEUP CHEMISTRY</Text>
                <Text style={[styles.chemValue, { color }]}>
                  {chemistry.toFixed(1)} · {label}
                </Text>
              </View>
              <View style={styles.chemTrack}>
                <View
                  style={[
                    styles.chemFill,
                    { width: `${Math.round(ratio * 100)}%` as any, backgroundColor: color },
                  ]}
                />
              </View>
            </View>
          );
        })()}
        {state.genre && (
          <View style={{ gap: 8 }}>
            {filteredArtists.map((a) => {
              const locked    = a.phase > state.phase;
              const booked    = state.lineup.includes(a.id);
              const tooPoor   = !booked && state.coins < a.fee;
              const disabled  = locked || (tooPoor && !booked);
              const c = GENRE_COLORS[a.genre] || COLORS.accent;
              return (
                <TouchableOpacity
                  key={a.id}
                  onPress={() => toggleArtist(a)}
                  disabled={disabled || busy}
                  style={[
                    styles.artistRow,
                    booked && { borderColor: c, backgroundColor: c + "16" },
                    disabled && { opacity: 0.4 },
                  ]}
                  testID={`artist-row-${a.id}`}
                >
                  <View style={[styles.artistAvatar, { backgroundColor: c + "33", borderColor: c }]}>
                    <Text style={[styles.artistInitial, { color: c }]}>
                      {a.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.artistName}>{a.name}</Text>
                    <Text style={styles.artistMeta}>Tier {a.tier} · +{a.boost} stage boost</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <View style={styles.feePill}>
                      <Ionicons name="cash" size={11} color={COLORS.accent} />
                      <Text style={styles.feeText}>{a.fee}</Text>
                    </View>
                    {locked ? (
                      <Text style={styles.lockedTxt}>Phase {a.phase}</Text>
                    ) : booked ? (
                      <Text style={[styles.bookedTxt, { color: c }]}>BOOKED ✓</Text>
                    ) : (
                      <Text style={styles.tapTxt}>tap to book</Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Daily News / Character Log */}
        {state.day_log.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: 18 }]}>DAILY NEWS</Text>
            <View style={{ gap: 8 }}>
              {state.day_log.slice().reverse().map((log, i) => (
                <CharacterBubble
                  key={i}
                  day={log.day}
                  text={log.text}
                  coins={log.coins}
                  xp={log.xp}
                  character_id={log.character_id}
                  streak_bonus={log.streak_bonus}
                />
              ))}
            </View>
          </>
        )}
      </ScrollView>

      {/* ── Live Score Preview ───────────────────────────────────────────── */}
      <ScoreLiveBar score={liveScore} hasReadyBuildings={hasReadyBuildings} />

      {/* ── Bottom bar ───────────────────────────────────────────────────── */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        {!isFestivalDay && (
          <TouchableOpacity
            style={[styles.miniGameBtn, miniPlayedToday && { opacity: 0.35 }]}
            disabled={miniPlayedToday}
            onPress={() => setMiniGameOpen(true)}
            testID="planning-minigame-cta"
          >
            <Text style={styles.miniGameBtnText}>{miniPlayedToday ? "🎮 Played today" : "🎮 Mini Game"}</Text>
          </TouchableOpacity>
        )}

        {isFestivalDay ? (
          <TouchableOpacity
            style={[styles.bigBtn, { backgroundColor: COLORS.primary, flex: 1 }]}
            onPress={() => router.replace("/")}
            testID="planning-go-festival"
          >
            <Ionicons name="play" size={20} color="#fff" />
            <Text style={styles.bigBtnText}>FESTIVAL DAY — RUN FESTIVAL</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.bigBtn, { backgroundColor: COLORS.surfaceElev, flex: 1 }]}
            disabled={busy}
            onPress={endDay}
            testID="planning-end-day"
          >
            <Ionicons name="moon" size={18} color={COLORS.secondary} />
            <Text style={[styles.bigBtnText, { color: COLORS.textPrimary }]}>
              END DAY {day}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <TutorialModal />

      <MiniGameModal
        visible={miniGameOpen}
        onClose={() => setMiniGameOpen(false)}
        onReward={handleMiniGameReward}
      />
    </View>
  );
}

function inMessage(wasBooked: boolean) {
  return wasBooked ? "Cannot unbook" : "Cannot book";
}

// ---------------------------------------------------------------------------
// ScoreLiveBar styles
// ---------------------------------------------------------------------------

const sb = StyleSheet.create({
  container: {
    backgroundColor: "#0c0d15",
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 6,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  label: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2,
  },
  compositeGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  compositeNum: {
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  gradePill: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  gradeLetter: {
    fontSize: 13,
    fontWeight: "900",
  },
  progressTrack: {
    height: 4,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
    minWidth: 4,
  },
  dimsRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 2,
  },
  dimCell: {
    flex: 1,
    gap: 2,
  },
  dimLabel: {
    color: COLORS.textSecondary,
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  dimTrack: {
    height: 3,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 2,
    overflow: "hidden",
  },
  dimFill: {
    height: 3,
    borderRadius: 2,
    minWidth: 2,
  },
  dimVal: {
    fontSize: 8,
    fontWeight: "800",
  },
  emptyHint: {
    color: COLORS.textSecondary,
    fontSize: 9,
    fontStyle: "italic",
    textAlign: "center",
    marginTop: 2,
  },
});

// ---------------------------------------------------------------------------
// Planning screen styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  center: { alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14, paddingBottom: 8,
    borderBottomWidth: 1, borderColor: "rgba(255,255,255,0.06)",
  },
  iconBtn: { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
  offlinePill: {
    backgroundColor: "rgba(255, 152, 0, 0.1)",
    borderWidth: 1,
    borderColor: COLORS.warning,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginTop: 6,
    borderRadius: 4,
    alignItems: "center",
  },
  offlinePillText: {
    color: COLORS.warning,
    fontSize: 11,
    fontWeight: "700",
  },
  title: { color: COLORS.textPrimary, fontWeight: "900", letterSpacing: 4, fontSize: 14 },
  subtitle: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2, letterSpacing: 1 },
  cycleGoalCard: {
    backgroundColor: "#1a2030",
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1.5,
    gap: 6,
  },
  cycleGoalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cycleGoalLabel: {
    fontWeight: "900",
    fontSize: 9,
    letterSpacing: 1.5,
    color: "rgba(255,255,255,0.7)",
  },
  cycleGoalDone: {
    color: "#00FF66",
    fontWeight: "900",
    fontSize: 11,
    letterSpacing: 1,
  },
  cycleGoalText: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  cycleGoalReward: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
    fontWeight: "600",
  },
  challengeCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#1a2030", borderRadius: 12, padding: 12, marginBottom: 14,
    borderWidth: 1.5, borderColor: "#FFD70066", gap: 8,
  },
  challengeDone: { borderColor: "#00FF6666", backgroundColor: "#001a10" },
  challengeLabel: { color: "#FFD700", fontWeight: "900", fontSize: 9, letterSpacing: 1.5, marginBottom: 2 },
  challengeText: { color: COLORS.textPrimary, fontSize: 12, fontWeight: "700" },
  challengeReward: { color: COLORS.success, fontWeight: "900", fontSize: 13 },
  challengeRewardXp: { color: COLORS.secondary, fontWeight: "700", fontSize: 11 },
  streakRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "#FF990015", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 7, marginBottom: 14,
    borderWidth: 1, borderColor: "#FF990044",
  },
  streakText: { color: "#FF9900", fontWeight: "800", fontSize: 12 },
  streakBonus: { color: COLORS.success, fontWeight: "700", fontSize: 10 },
  sectionLabel: { color: COLORS.textSecondary, fontWeight: "800", fontSize: 11, letterSpacing: 2, marginBottom: 10 },
  genreRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  genreChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },
  genreDot: { width: 8, height: 8, borderRadius: 4 },
  genreLabel: { color: COLORS.textSecondary, fontWeight: "700", fontSize: 12 },
  hint: { color: COLORS.textSecondary, fontSize: 12, fontStyle: "italic" },
  chemCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    gap: 6,
  },
  chemHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  chemLabel: {
    color: COLORS.textSecondary,
    fontWeight: "900",
    fontSize: 10,
    letterSpacing: 1.5,
  },
  chemValue: {
    fontWeight: "900",
    fontSize: 11,
    letterSpacing: 0.5,
  },
  chemTrack: {
    height: 6,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 3,
    overflow: "hidden",
  },
  chemFill: {
    height: 6,
    borderRadius: 3,
    minWidth: 4,
  },
  artistRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: COLORS.surface, borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
  },
  artistAvatar: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: "center", justifyContent: "center", borderWidth: 1.5,
  },
  artistInitial: { fontWeight: "900", fontSize: 12 },
  artistName: { color: COLORS.textPrimary, fontWeight: "700", fontSize: 14 },
  artistMeta: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2 },
  feePill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
  },
  feeText: { color: COLORS.textPrimary, fontWeight: "800", fontSize: 11 },
  bookedTxt: { fontWeight: "900", fontSize: 10, marginTop: 4, letterSpacing: 1 },
  lockedTxt: { color: COLORS.warning, fontSize: 10, fontWeight: "700", marginTop: 4 },
  tapTxt: { color: COLORS.textSecondary, fontSize: 10, marginTop: 4 },
  bottomBar: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 16, paddingTop: 12,
    backgroundColor: "#0c0d15",
    borderTopWidth: 1, borderColor: "rgba(255,255,255,0.06)",
  },
  miniGameBtn: {
    backgroundColor: COLORS.surfaceElev,
    paddingHorizontal: 14, paddingVertical: 13, borderRadius: 999,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
  },
  miniGameBtnText: { color: COLORS.textPrimary, fontWeight: "800", fontSize: 12 },
  bigBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 14, borderRadius: 999,
  },
  bigBtnText: { color: "#fff", fontWeight: "900", letterSpacing: 2, fontSize: 13 },
});
