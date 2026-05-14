import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Easing,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../theme";
import { api } from "../api";

type Props = {
  visible: boolean;
  onClose: () => void;
  onReward: (coins: number, xp: number) => void;
};

type Game = "menu" | "sound_check" | "roulette";

export default function MiniGameModal({ visible, onClose, onReward }: Props) {
  const [game, setGame] = useState<Game>("menu");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setGame("menu");
    setDone(false);
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
      setDone(true);
    } catch (e: any) {
      // Already played today or other error — still show result
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
          {game === "sound_check" && (
            <SoundCheck
              onFinish={(score) => submitReward("sound_check", score)}
              done={done}
              onBack={reset}
            />
          )}
          {game === "roulette" && (
            <SponsorRoulette
              onFinish={(score) => submitReward("roulette", score)}
              done={done}
              onBack={reset}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

function GameMenu({ onPick }: { onPick: (g: Game) => void }) {
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={styles.menuSub}>Pick a mini game to earn bonus coins & XP</Text>

      <TouchableOpacity style={styles.gameCard} onPress={() => onPick("sound_check")} activeOpacity={0.8}>
        <View style={[styles.gameIcon, { backgroundColor: "#00FFFF22", borderColor: "#00FFFF66" }]}>
          <Text style={styles.gameEmoji}>🥁</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.gameName}>Sound Check</Text>
          <Text style={styles.gameDesc}>Match the beat sequence — Simon Says style. Up to 5 rounds.</Text>
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

      <Text style={styles.hint}>One mini game per day. Rewards are saved to your account.</Text>
    </ScrollView>
  );
}

const PAD_COLORS = ["#FF0055", "#00FFFF", "#FFD700", "#00FF66"];
const PAD_LABELS = ["🎸", "🎧", "🎺", "🥁"];

function SoundCheck({ onFinish, done, onBack }: { onFinish: (s: number) => void; done: boolean; onBack: () => void }) {
  const [phase, setPhase] = useState<"idle" | "showing" | "input" | "result">("idle");
  const [sequence, setSequence] = useState<number[]>([]);
  const [playerSeq, setPlayerSeq] = useState<number[]>([]);
  const [round, setRound] = useState(0);
  const [lit, setLit] = useState<number | null>(null);
  const [wrongIdx, setWrongIdx] = useState<number | null>(null);
  const [finalScore, setFinalScore] = useState(0);
  const maxRounds = 5;

  const startGame = () => {
    const first = Math.floor(Math.random() * 4);
    setSequence([first]);
    setPlayerSeq([]);
    setRound(1);
    setPhase("showing");
  };

  const flashSequence = useCallback(async (seq: number[]) => {
    for (let i = 0; i < seq.length; i++) {
      await delay(300);
      setLit(seq[i]);
      await delay(500);
      setLit(null);
    }
    await delay(300);
    setPhase("input");
    setPlayerSeq([]);
  }, []);

  useEffect(() => {
    if (phase === "showing") {
      flashSequence(sequence);
    }
  }, [phase, sequence, flashSequence]);

  const handlePad = (idx: number) => {
    if (phase !== "input") return;
    const next = [...playerSeq, idx];
    const pos = next.length - 1;

    if (idx !== sequence[pos]) {
      setWrongIdx(idx);
      setTimeout(() => {
        setWrongIdx(null);
        setFinalScore(round - 1);
        setPhase("result");
        onFinish(round - 1);
      }, 600);
      return;
    }

    setLit(idx);
    setTimeout(() => setLit(null), 200);

    if (next.length === sequence.length) {
      if (round >= maxRounds) {
        setFinalScore(maxRounds);
        setPhase("result");
        onFinish(maxRounds);
        return;
      }
      const nextSeq = [...sequence, Math.floor(Math.random() * 4)];
      setSequence(nextSeq);
      setRound((r) => r + 1);
      setPlayerSeq([]);
      setTimeout(() => setPhase("showing"), 600);
    } else {
      setPlayerSeq(next);
    }
  };

  return (
    <View style={{ padding: 16, alignItems: "center" }}>
      <Text style={styles.gameTitle}>🥁 SOUND CHECK</Text>
      <Text style={styles.roundLabel}>
        {phase === "idle" ? "Watch the sequence, then repeat it!" :
         phase === "showing" ? `Round ${round} — Watch!` :
         phase === "input" ? `Round ${round} — Your turn!` :
         `Done! Score: ${finalScore}/${maxRounds}`}
      </Text>

      <View style={styles.padGrid}>
        {PAD_COLORS.map((c, i) => {
          const isLit = lit === i;
          const isWrong = wrongIdx === i;
          return (
            <TouchableOpacity
              key={i}
              onPress={() => handlePad(i)}
              activeOpacity={0.7}
              style={[
                styles.pad,
                { backgroundColor: isLit ? c : c + "33", borderColor: isWrong ? "#fff" : c },
                isWrong && { backgroundColor: "#ffffff44" },
              ]}
            >
              <Text style={styles.padEmoji}>{PAD_LABELS[i]}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {phase === "idle" && (
        <TouchableOpacity style={styles.primaryBtn} onPress={startGame}>
          <Text style={styles.primaryBtnText}>START</Text>
        </TouchableOpacity>
      )}

      {phase === "result" && done && (
        <View style={{ alignItems: "center", marginTop: 12 }}>
          <Text style={styles.rewardLine}>
            {finalScore >= 4 ? "🏆 Amazing!" : finalScore >= 2 ? "⭐ Nice work!" : "Keep practising!"}
          </Text>
          <Text style={styles.rewardCoins}>+{finalScore * 40 + 20} coins · +{finalScore * 8 + 5} XP</Text>
          <TouchableOpacity style={[styles.primaryBtn, { marginTop: 12 }]} onPress={onBack}>
            <Text style={styles.primaryBtnText}>BACK TO GAMES</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const SPONSORS = [
  { name: "NeonDrink Co.", emoji: "🥤", tier: "RISKY", score: 5, desc: "Big upfront demand, huge payout" },
  { name: "SoundGear Ltd.", emoji: "🎧", tier: "FAIR", score: 3, desc: "Steady deal, reliable reward" },
  { name: "LocalBrew FM", emoji: "📻", tier: "SAFE", score: 1, desc: "Small commitment, small return" },
];

function SponsorRoulette({ onFinish, done, onBack }: { onFinish: (s: number) => void; done: boolean; onBack: () => void }) {
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
              <Animated.View style={[
                styles.sponsorCard,
                isPicked && revealed && { borderColor: "#FFD700", backgroundColor: "#FFD70011" },
                !isPicked && picked !== null && { opacity: 0.4 },
                { transform: [{ scaleX: isPicked ? flipScale : 1 }] },
              ]}>
                {isPicked && revealed ? (
                  <>
                    <Text style={styles.cardEmoji}>{s.emoji}</Text>
                    <Text style={styles.cardSponsor}>{s.name}</Text>
                    <Text style={[styles.cardTier, {
                      color: s.tier === "RISKY" ? "#FF0055" : s.tier === "FAIR" ? "#FFD700" : "#00FF66"
                    }]}>{s.tier}</Text>
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

      {revealed && done && (
        <TouchableOpacity style={[styles.primaryBtn, { marginTop: 8 }]} onPress={onBack}>
          <Text style={styles.primaryBtnText}>BACK TO GAMES</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "flex-end",
  },
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
  roundLabel: { color: COLORS.textSecondary, fontSize: 12, marginBottom: 20, textAlign: "center" },
  padGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "center",
    marginBottom: 20,
  },
  pad: {
    width: 110,
    height: 110,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  padEmoji: { fontSize: 36 },
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
  cardRow: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    marginBottom: 16,
    flexWrap: "wrap",
  },
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
});
