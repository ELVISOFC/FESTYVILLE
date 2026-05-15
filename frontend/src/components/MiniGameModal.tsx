import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Easing,
  ScrollView,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../theme";
import { api } from "../api";

type Props = {
  visible: boolean;
  onClose: () => void;
  onReward: (coins: number, xp: number) => void;
};

type Game = "menu" | "rhythm_rush" | "roulette" | "stage_sweep";

type LastResult = { coins: number; xp: number; cooldownSeconds: number; buildingsSpeeded: number } | null;

export default function MiniGameModal({ visible, onClose, onReward }: Props) {
  const [game, setGame] = useState<Game>("menu");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<LastResult>(null);

  const reset = () => {
    setGame("menu");
    setDone(false);
    setLast(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const submitReward = async (gameName: string, score: number) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await api.minigameReward(gameName, score);
      onReward(result.coins_earned, result.xp_earned);
      setLast({
        coins: result.coins_earned,
        xp: result.xp_earned,
        cooldownSeconds: result.cooldown_bonus_seconds ?? 0,
        buildingsSpeeded: result.buildings_speeded ?? 0,
      });
      setDone(true);
    } catch (e: any) {
      setDone(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>🎮 MINI GAMES</Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          {game === "menu" && <GameMenu onPick={setGame} />}
          {game === "rhythm_rush" && (
            <RhythmRush onFinish={(s) => submitReward("rhythm_rush", s)} done={done} last={last} onBack={reset} />
          )}
          {game === "roulette" && (
            <SponsorRoulette onFinish={(s) => submitReward("roulette", s)} done={done} last={last} onBack={reset} />
          )}
          {game === "stage_sweep" && (
            <StageSweep onFinish={(s) => submitReward("stage_sweep", s)} done={done} last={last} onBack={reset} />
          )}
        </View>
      </View>
    </Modal>
  );
}

function GameMenu({ onPick }: { onPick: (g: Game) => void }) {
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={styles.menuSub}>Pick a mini game to earn bonus coins, XP & cooldown speedups</Text>

      <TouchableOpacity style={styles.gameCard} onPress={() => onPick("rhythm_rush")} activeOpacity={0.8}>
        <View style={[styles.gameIcon, { backgroundColor: "#00FFFF22", borderColor: "#00FFFF66" }]}>
          <Text style={styles.gameEmoji}>🎸</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.gameName}>Rhythm Rush</Text>
          <Text style={styles.gameDesc}>Tap notes as they hit the line. Guitar Hero style.</Text>
        </View>
        <Text style={styles.gameReward}>Up to +220c</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.gameCard} onPress={() => onPick("roulette")} activeOpacity={0.8}>
        <View style={[styles.gameIcon, { backgroundColor: "#FFD70022", borderColor: "#FFD70066" }]}>
          <Text style={styles.gameEmoji}>🃏</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.gameName}>Sponsor Roulette</Text>
          <Text style={styles.gameDesc}>Pick a sponsor card and reveal your deal. High risk, high reward.</Text>
        </View>
        <Text style={styles.gameReward}>Up to +220c</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.gameCard} onPress={() => onPick("stage_sweep")} activeOpacity={0.8}>
        <View style={[styles.gameIcon, { backgroundColor: "#FF005522", borderColor: "#FF005566" }]}>
          <Text style={styles.gameEmoji}>⛈️</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.gameName}>Stage Sweep</Text>
          <Text style={styles.gameDesc}>Reveal safe tiles, avoid the storms. Win shaves time off active builds.</Text>
        </View>
        <Text style={[styles.gameReward, { color: "#FF77AA" }]}>Up to -5m build</Text>
      </TouchableOpacity>

      <Text style={styles.hint}>One mini game per day. Rewards are saved to your account.</Text>
    </ScrollView>
  );
}

/* ───────────────────────── RHYTHM RUSH ───────────────────────── */

const LANE_COLORS = ["#FF0055", "#00FFFF", "#FFD700", "#00FF66"];
const LANE_LABELS = ["A", "S", "D", "F"];
const LANE_COUNT = 4;
const TRACK_HEIGHT = 360;
const HIT_Y = 300;
const HIT_WINDOW = 55;
const NOTE_SPEED = 260; // px/sec
const NOTE_SIZE = 48;

type Note = { id: number; lane: number; time: number; hit: boolean | null }; // null=pending, true=hit, false=miss

function buildSequence(): Note[] {
  const notes: Note[] = [];
  let t = 800;
  let id = 0;
  const totalNotes = 22;
  let lastLane = -1;
  for (let i = 0; i < totalNotes; i++) {
    let lane = Math.floor(Math.random() * LANE_COUNT);
    if (lane === lastLane && Math.random() < 0.6) lane = (lane + 1 + Math.floor(Math.random() * 3)) % LANE_COUNT;
    lastLane = lane;
    notes.push({ id: id++, lane, time: t, hit: null });
    const gap = 380 + Math.floor(Math.random() * 220) - i * 5; // accelerates slightly
    t += Math.max(220, gap);
  }
  return notes;
}

function RhythmRush({
  onFinish,
  done,
  last,
  onBack,
}: {
  onFinish: (s: number) => void;
  done: boolean;
  last: LastResult;
  onBack: () => void;
}) {
  const [phase, setPhase] = useState<"idle" | "playing" | "result">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [notes, setNotes] = useState<Note[]>([]);
  const [hits, setHits] = useState(0);
  const [misses, setMisses] = useState(0);
  const [lanePulse, setLanePulse] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; color: string; key: number } | null>(null);
  const startRef = useRef<number>(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const finishedRef = useRef(false);

  const totalNotes = notes.length;
  const songEndTime = useMemo(() => (notes.length ? notes[notes.length - 1].time + 1500 : 0), [notes]);

  const finish = useCallback(
    (h: number) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      if (tickRef.current) clearInterval(tickRef.current);
      const pct = totalNotes > 0 ? h / totalNotes : 0;
      let score = 0;
      if (pct >= 0.9) score = 5;
      else if (pct >= 0.75) score = 4;
      else if (pct >= 0.6) score = 3;
      else if (pct >= 0.4) score = 2;
      else if (pct >= 0.2) score = 1;
      setPhase("result");
      onFinish(score);
    },
    [onFinish, totalNotes]
  );

  const start = () => {
    const seq = buildSequence();
    setNotes(seq);
    setHits(0);
    setMisses(0);
    setElapsed(0);
    finishedRef.current = false;
    setPhase("playing");
    startRef.current = Date.now();
  };

  useEffect(() => {
    if (phase !== "playing") return;
    tickRef.current = setInterval(() => {
      const now = Date.now() - startRef.current;
      setElapsed(now);
      // Auto-miss notes whose hit window has fully passed
      setNotes((prev) => {
        let missDelta = 0;
        const next = prev.map((n) => {
          if (n.hit === null && now > n.time + HIT_WINDOW * (1000 / NOTE_SPEED)) {
            missDelta++;
            return { ...n, hit: false };
          }
          return n;
        });
        if (missDelta > 0) setMisses((m) => m + missDelta);
        return next;
      });
      if (now >= songEndTime && songEndTime > 0) {
        setHits((currentHits) => {
          finish(currentHits);
          return currentHits;
        });
      }
    }, 33);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [phase, songEndTime, finish]);

  const tapLane = (lane: number) => {
    if (phase !== "playing") return;
    setLanePulse(lane);
    setTimeout(() => setLanePulse((cur) => (cur === lane ? null : cur)), 100);
    const now = elapsed;
    let bestIdx = -1;
    let bestDist = Infinity;
    notes.forEach((n, i) => {
      if (n.lane !== lane || n.hit !== null) return;
      const dist = Math.abs(n.time - now);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    });
    const windowMs = HIT_WINDOW * (1000 / NOTE_SPEED);
    if (bestIdx >= 0 && bestDist <= windowMs) {
      setNotes((prev) => prev.map((n, i) => (i === bestIdx ? { ...n, hit: true } : n)));
      setHits((h) => h + 1);
      const pct = bestDist / windowMs;
      const fb =
        pct < 0.35
          ? { text: "PERFECT", color: "#FFD700" }
          : pct < 0.7
          ? { text: "GREAT", color: "#00FFFF" }
          : { text: "GOOD", color: "#00FF66" };
      setFeedback({ ...fb, key: Date.now() });
    } else {
      setMisses((m) => m + 1);
      setFeedback({ text: "MISS", color: "#FF0055", key: Date.now() });
    }
  };

  // Web keyboard support
  useEffect(() => {
    if (phase !== "playing") return;
    const handler = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const idx = ["a", "s", "d", "f"].indexOf(key);
      if (idx >= 0) tapLane(idx);
    };
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", handler);
      return () => window.removeEventListener("keydown", handler);
    }
  }, [phase, elapsed, notes]); // eslint-disable-line react-hooks/exhaustive-deps

  const accuracy = totalNotes > 0 ? Math.round((hits / Math.max(1, hits + misses)) * 100) : 0;

  return (
    <View style={{ padding: 12, alignItems: "center" }}>
      <Text style={styles.gameTitle}>🎸 RHYTHM RUSH</Text>
      <Text style={styles.roundLabel}>
        {phase === "idle"
          ? "Tap each lane button as the note hits the line. Keys A/S/D/F also work."
          : phase === "playing"
          ? `Hits: ${hits} · Misses: ${misses} · ${accuracy}%`
          : `Done! ${hits}/${totalNotes} hits · ${accuracy}%`}
      </Text>

      {phase !== "result" && (
        <View style={styles.track}>
          <View style={styles.hitLine} />
          {phase === "playing" &&
            notes.map((n) => {
              const y = HIT_Y - (n.time - elapsed) * (NOTE_SPEED / 1000);
              if (y < -NOTE_SIZE || y > TRACK_HEIGHT + NOTE_SIZE) return null;
              if (n.hit === true) return null;
              const laneX = n.lane * (NOTE_SIZE + 12) + 8;
              const isMiss = n.hit === false;
              return (
                <View
                  key={n.id}
                  style={[
                    styles.note,
                    {
                      left: laneX,
                      top: y,
                      backgroundColor: isMiss ? "#33333366" : LANE_COLORS[n.lane],
                      borderColor: isMiss ? "#666" : "#fff",
                      opacity: isMiss ? 0.3 : 1,
                    },
                  ]}
                />
              );
            })}
          {feedback && (
            <Text key={feedback.key} style={[styles.feedbackText, { color: feedback.color }]}>
              {feedback.text}
            </Text>
          )}
        </View>
      )}

      {phase !== "result" && (
        <View style={styles.laneRow}>
          {LANE_COLORS.map((c, i) => (
            <Pressable
              key={i}
              onPressIn={() => tapLane(i)}
              style={[
                styles.laneBtn,
                {
                  backgroundColor: lanePulse === i ? c : c + "33",
                  borderColor: c,
                },
              ]}
            >
              <Text style={styles.laneBtnText}>{LANE_LABELS[i]}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {phase === "idle" && (
        <TouchableOpacity style={styles.primaryBtn} onPress={start}>
          <Text style={styles.primaryBtnText}>START</Text>
        </TouchableOpacity>
      )}

      {phase === "result" && done && last && (
        <View style={{ alignItems: "center", marginTop: 12 }}>
          <Text style={styles.rewardLine}>
            {accuracy >= 90 ? "🏆 Headliner!" : accuracy >= 60 ? "⭐ Solid set!" : "Keep practising!"}
          </Text>
          <Text style={styles.rewardCoins}>+{last.coins} coins · +{last.xp} XP</Text>
          <TouchableOpacity style={[styles.primaryBtn, { marginTop: 12 }]} onPress={onBack}>
            <Text style={styles.primaryBtnText}>BACK TO GAMES</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

/* ───────────────────────── SPONSOR ROULETTE (unchanged) ───────────────────────── */

const SPONSORS = [
  { name: "NeonDrink Co.", emoji: "🥤", tier: "RISKY", score: 5, desc: "Big upfront demand, huge payout" },
  { name: "SoundGear Ltd.", emoji: "🎧", tier: "FAIR", score: 3, desc: "Steady deal, reliable reward" },
  { name: "LocalBrew FM", emoji: "📻", tier: "SAFE", score: 1, desc: "Small commitment, small return" },
];

function SponsorRoulette({
  onFinish,
  done,
  last,
  onBack,
}: {
  onFinish: (s: number) => void;
  done: boolean;
  last: LastResult;
  onBack: () => void;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const flipAnims = useRef(SPONSORS.map(() => new Animated.Value(0))).current;

  const pick = (i: number) => {
    if (picked !== null) return;
    setPicked(i);
    Animated.timing(flipAnims[i], {
      toValue: 1,
      duration: 500,
      easing: Easing.out(Easing.back(1.5)),
      useNativeDriver: true,
    }).start(() => {
      setRevealed(true);
      onFinish(SPONSORS[i].score);
    });
  };

  const shuffled = useRef([...SPONSORS].sort(() => Math.random() - 0.5)).current;

  return (
    <View style={{ padding: 16, alignItems: "center" }}>
      <Text style={styles.gameTitle}>🃏 SPONSOR ROULETTE</Text>
      <Text style={styles.roundLabel}>
        {picked === null ? "Pick a sponsor card to reveal your deal" : revealed ? "Deal revealed!" : "Flipping..."}
      </Text>

      <View style={styles.cardRow}>
        {shuffled.map((s, i) => {
          const isPicked = picked === i;
          const flipScale = flipAnims[i].interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.2, 1] });
          return (
            <TouchableOpacity key={i} onPress={() => pick(i)} activeOpacity={0.85} disabled={picked !== null}>
              <Animated.View
                style={[
                  styles.sponsorCard,
                  isPicked && revealed && { borderColor: "#FFD700", backgroundColor: "#FFD70011" },
                  !isPicked && picked !== null && { opacity: 0.4 },
                  { transform: [{ scaleX: isPicked ? flipScale : 1 }] },
                ]}
              >
                {isPicked && revealed ? (
                  <>
                    <Text style={styles.cardEmoji}>{s.emoji}</Text>
                    <Text style={styles.cardSponsor}>{s.name}</Text>
                    <Text
                      style={[
                        styles.cardTier,
                        { color: s.tier === "RISKY" ? "#FF0055" : s.tier === "FAIR" ? "#FFD700" : "#00FF66" },
                      ]}
                    >
                      {s.tier}
                    </Text>
                    <Text style={styles.cardDesc}>{s.desc}</Text>
                    <Text style={styles.cardReward}>+{s.score * 40 + 20}c</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.cardEmoji}>🎴</Text>
                    <Text style={styles.cardSponsor}>Sponsor?</Text>
                    <Text style={styles.cardTier}>Tap to reveal</Text>
                  </>
                )}
              </Animated.View>
            </TouchableOpacity>
          );
        })}
      </View>

      {revealed && done && last && (
        <View style={{ alignItems: "center" }}>
          <Text style={styles.rewardCoins}>+{last.coins} coins · +{last.xp} XP</Text>
          <TouchableOpacity style={[styles.primaryBtn, { marginTop: 12 }]} onPress={onBack}>
            <Text style={styles.primaryBtnText}>BACK TO GAMES</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

/* ───────────────────────── STAGE SWEEP (minesweeper) ───────────────────────── */

const SWEEP_SIZE = 5;
const SWEEP_STORMS = 5;

type Cell = { storm: boolean; revealed: boolean; flagged: boolean; adjacent: number };

function buildBoard(): Cell[][] {
  const cells: Cell[][] = Array.from({ length: SWEEP_SIZE }, () =>
    Array.from({ length: SWEEP_SIZE }, () => ({ storm: false, revealed: false, flagged: false, adjacent: 0 }))
  );
  let placed = 0;
  while (placed < SWEEP_STORMS) {
    const x = Math.floor(Math.random() * SWEEP_SIZE);
    const y = Math.floor(Math.random() * SWEEP_SIZE);
    if (!cells[y][x].storm) {
      cells[y][x].storm = true;
      placed++;
    }
  }
  for (let y = 0; y < SWEEP_SIZE; y++) {
    for (let x = 0; x < SWEEP_SIZE; x++) {
      if (cells[y][x].storm) continue;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx,
            ny = y + dy;
          if (nx >= 0 && nx < SWEEP_SIZE && ny >= 0 && ny < SWEEP_SIZE && cells[ny][nx].storm) n++;
        }
      }
      cells[y][x].adjacent = n;
    }
  }
  return cells;
}

function StageSweep({
  onFinish,
  done,
  last,
  onBack,
}: {
  onFinish: (s: number) => void;
  done: boolean;
  last: LastResult;
  onBack: () => void;
}) {
  const [phase, setPhase] = useState<"idle" | "playing" | "result">("idle");
  const [board, setBoard] = useState<Cell[][]>([]);
  const [mode, setMode] = useState<"reveal" | "flag">("reveal");
  const [outcome, setOutcome] = useState<"win" | "lose" | null>(null);
  const totalSafe = SWEEP_SIZE * SWEEP_SIZE - SWEEP_STORMS;
  const finishedRef = useRef(false);

  const start = () => {
    finishedRef.current = false;
    setBoard(buildBoard());
    setOutcome(null);
    setPhase("playing");
    setMode("reveal");
  };

  const revealedCount = useMemo(
    () => board.flat().filter((c) => c.revealed && !c.storm).length,
    [board]
  );

  const finish = (revealedSafe: number, win: boolean) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    let score: number;
    if (win) {
      score = 5;
    } else {
      // Partial credit: 0..3 based on how many safe cells were revealed before the storm.
      const pct = revealedSafe / totalSafe;
      if (pct >= 0.75) score = 3;
      else if (pct >= 0.5) score = 2;
      else if (pct >= 0.25) score = 1;
      else score = 0;
    }
    setOutcome(win ? "win" : "lose");
    setPhase("result");
    onFinish(score);
  };

  const floodReveal = (b: Cell[][], x: number, y: number) => {
    if (x < 0 || x >= SWEEP_SIZE || y < 0 || y >= SWEEP_SIZE) return;
    const c = b[y][x];
    if (c.revealed || c.flagged || c.storm) return;
    c.revealed = true;
    if (c.adjacent === 0) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx !== 0 || dy !== 0) floodReveal(b, x + dx, y + dy);
        }
      }
    }
  };

  const onTap = (x: number, y: number) => {
    if (phase !== "playing") return;
    const b = board.map((row) => row.map((c) => ({ ...c })));
    const cell = b[y][x];
    if (cell.revealed) return;
    if (mode === "flag") {
      cell.flagged = !cell.flagged;
      setBoard(b);
      return;
    }
    if (cell.flagged) return;
    if (cell.storm) {
      // Reveal all storms on lose
      for (let yy = 0; yy < SWEEP_SIZE; yy++)
        for (let xx = 0; xx < SWEEP_SIZE; xx++) if (b[yy][xx].storm) b[yy][xx].revealed = true;
      setBoard(b);
      const safeRevealed = b.flat().filter((c) => c.revealed && !c.storm).length;
      finish(safeRevealed, false);
      return;
    }
    floodReveal(b, x, y);
    setBoard(b);
    const safeRevealed = b.flat().filter((c) => c.revealed && !c.storm).length;
    if (safeRevealed >= totalSafe) {
      finish(safeRevealed, true);
    }
  };

  return (
    <View style={{ padding: 16, alignItems: "center" }}>
      <Text style={styles.gameTitle}>⛈️ STAGE SWEEP</Text>
      <Text style={styles.roundLabel}>
        {phase === "idle"
          ? "Reveal every safe tile. Avoid the storms. Win = -5 min on every active build."
          : phase === "playing"
          ? `${revealedCount}/${totalSafe} safe revealed · ${SWEEP_STORMS} storms hidden`
          : outcome === "win"
          ? "🏆 Cleared! Storms dodged."
          : "⛈️ Storm hit! Partial credit."}
      </Text>

      {phase === "playing" && (
        <View style={styles.modeRow}>
          <TouchableOpacity
            onPress={() => setMode("reveal")}
            style={[styles.modeBtn, mode === "reveal" && styles.modeBtnActive]}
          >
            <Ionicons name="eye" size={14} color={mode === "reveal" ? "#000" : COLORS.textSecondary} />
            <Text style={[styles.modeBtnText, mode === "reveal" && { color: "#000" }]}>REVEAL</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setMode("flag")}
            style={[styles.modeBtn, mode === "flag" && styles.modeBtnActive]}
          >
            <Ionicons name="flag" size={14} color={mode === "flag" ? "#000" : COLORS.textSecondary} />
            <Text style={[styles.modeBtnText, mode === "flag" && { color: "#000" }]}>FLAG</Text>
          </TouchableOpacity>
        </View>
      )}

      {phase !== "idle" && board.length > 0 && (
        <View style={styles.sweepBoard}>
          {board.map((row, y) => (
            <View key={y} style={{ flexDirection: "row" }}>
              {row.map((c, x) => (
                <TouchableOpacity
                  key={x}
                  onPress={() => onTap(x, y)}
                  activeOpacity={0.7}
                  style={[
                    styles.sweepCell,
                    c.revealed && (c.storm ? styles.sweepCellStorm : styles.sweepCellSafe),
                    c.flagged && !c.revealed && styles.sweepCellFlag,
                  ]}
                >
                  {c.revealed ? (
                    c.storm ? (
                      <Text style={styles.sweepCellEmoji}>⛈️</Text>
                    ) : c.adjacent > 0 ? (
                      <Text style={[styles.sweepCellNum, { color: adjColor(c.adjacent) }]}>{c.adjacent}</Text>
                    ) : null
                  ) : c.flagged ? (
                    <Text style={styles.sweepCellEmoji}>🚩</Text>
                  ) : null}
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>
      )}

      {phase === "idle" && (
        <TouchableOpacity style={styles.primaryBtn} onPress={start}>
          <Text style={styles.primaryBtnText}>START</Text>
        </TouchableOpacity>
      )}

      {phase === "result" && done && last && (
        <View style={{ alignItems: "center", marginTop: 12 }}>
          <Text style={styles.rewardCoins}>+{last.coins} coins · +{last.xp} XP</Text>
          {last.cooldownSeconds > 0 && (
            <Text style={[styles.rewardCoins, { color: "#00FFFF", marginTop: 4 }]}>
              ⚡ -{Math.round(last.cooldownSeconds / 60)} min off {last.buildingsSpeeded} active build
              {last.buildingsSpeeded === 1 ? "" : "s"}
            </Text>
          )}
          {last.cooldownSeconds === 0 && outcome === "win" && (
            <Text style={[styles.hint, { marginTop: 4 }]}>(No active builds to speed up — try building first!)</Text>
          )}
          <TouchableOpacity style={[styles.primaryBtn, { marginTop: 12 }]} onPress={onBack}>
            <Text style={styles.primaryBtnText}>BACK TO GAMES</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function adjColor(n: number) {
  return ["#888", "#00FFFF", "#00FF66", "#FFD700", "#FF8800", "#FF0055", "#FF0055", "#FF0055", "#FF0055"][n] || "#fff";
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    maxHeight: "90%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  title: { color: COLORS.textPrimary, fontWeight: "900", fontSize: 16, letterSpacing: 2 },
  closeBtn: { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
  menuSub: { color: COLORS.textSecondary, fontSize: 12, marginBottom: 4 },
  gameCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: COLORS.surfaceElev,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  gameIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  gameEmoji: { fontSize: 22 },
  gameName: { color: COLORS.textPrimary, fontWeight: "800", fontSize: 14 },
  gameDesc: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2 },
  gameReward: { color: COLORS.success, fontWeight: "900", fontSize: 11 },
  hint: { color: COLORS.textSecondary, fontSize: 10, textAlign: "center", marginTop: 4, fontStyle: "italic" },
  gameTitle: { color: COLORS.textPrimary, fontWeight: "900", fontSize: 18, letterSpacing: 2, marginBottom: 6 },
  roundLabel: { color: COLORS.textSecondary, fontSize: 12, marginBottom: 14, textAlign: "center" },
  primaryBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 999,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  primaryBtnText: { color: "#fff", fontWeight: "900", letterSpacing: 2, fontSize: 13 },
  rewardLine: { color: COLORS.textPrimary, fontWeight: "800", fontSize: 16, marginBottom: 4 },
  rewardCoins: { color: COLORS.success, fontWeight: "900", fontSize: 14 },
  // Rhythm Rush
  track: {
    width: LANE_COUNT * (NOTE_SIZE + 12) + 4,
    height: TRACK_HEIGHT,
    backgroundColor: "#0008",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    overflow: "hidden",
    position: "relative",
    marginBottom: 10,
  },
  hitLine: {
    position: "absolute",
    left: 0,
    right: 0,
    top: HIT_Y,
    height: 3,
    backgroundColor: "#fff",
    opacity: 0.5,
  },
  note: {
    position: "absolute",
    width: NOTE_SIZE,
    height: NOTE_SIZE,
    borderRadius: 8,
    borderWidth: 2,
  },
  feedbackText: {
    position: "absolute",
    alignSelf: "center",
    top: HIT_Y - 60,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 2,
    textShadowColor: "#000",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  laneRow: { flexDirection: "row", gap: 12, marginBottom: 10 },
  laneBtn: {
    width: NOTE_SIZE,
    height: NOTE_SIZE,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  laneBtnText: { color: "#fff", fontWeight: "900", fontSize: 16 },
  // Sponsor Roulette
  cardRow: { flexDirection: "row", gap: 10, justifyContent: "center", marginBottom: 16, flexWrap: "wrap" },
  sponsorCard: {
    width: 100,
    backgroundColor: COLORS.surfaceElev,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.15)",
    padding: 12,
    alignItems: "center",
    gap: 4,
    minHeight: 140,
    justifyContent: "center",
  },
  cardEmoji: { fontSize: 28, marginBottom: 4 },
  cardSponsor: { color: COLORS.textPrimary, fontWeight: "800", fontSize: 11, textAlign: "center" },
  cardTier: { fontWeight: "900", fontSize: 10, letterSpacing: 1, textAlign: "center" },
  cardDesc: { color: COLORS.textSecondary, fontSize: 9, textAlign: "center", marginTop: 2 },
  cardReward: { color: COLORS.success, fontWeight: "900", fontSize: 13, marginTop: 4 },
  // Stage Sweep
  modeRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  modeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: COLORS.surfaceElev,
  },
  modeBtnActive: { backgroundColor: "#FFD700", borderColor: "#FFD700" },
  modeBtnText: { color: COLORS.textSecondary, fontWeight: "900", fontSize: 11, letterSpacing: 1 },
  sweepBoard: {
    backgroundColor: "#0006",
    padding: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    marginBottom: 12,
  },
  sweepCell: {
    width: 48,
    height: 48,
    margin: 2,
    borderRadius: 8,
    backgroundColor: "#1a1f3a",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  sweepCellSafe: { backgroundColor: "#0a1f1a", borderColor: "rgba(0,255,102,0.3)" },
  sweepCellStorm: { backgroundColor: "#3a0a1a", borderColor: "#FF0055" },
  sweepCellFlag: { backgroundColor: "#3a2a0a", borderColor: "#FFD700" },
  sweepCellEmoji: { fontSize: 22 },
  sweepCellNum: { fontWeight: "900", fontSize: 18 },
});
