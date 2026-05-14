import React, { useEffect, useRef } from "react";
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
import { COLORS, GRADE_COLORS } from "../theme";
import type { SimResult } from "../api";

type Props = {
  visible: boolean;
  result: SimResult | null;
  onClose: () => void;
};

const DIMS: { key: keyof SimResult["breakdown"]; label: string; color: string }[] = [
  { key: "stage_score",      label: "STAGE SCORE",      color: "#FF0055" },
  { key: "crowd_flow",       label: "CROWD FLOW",       color: "#00FFFF" },
  { key: "vendor_coverage",  label: "VENDOR COVERAGE",  color: "#FF9900" },
  { key: "utility_coverage", label: "UTILITY COVERAGE", color: "#00FF66" },
  { key: "aesthetic",        label: "AESTHETIC",        color: "#FFD700" },
];

export default function SimulationModal({ visible, result, onClose }: Props) {
  const barAnims = useRef(DIMS.map(() => new Animated.Value(0))).current;
  const gradeScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible || !result) return;
    barAnims.forEach((a) => a.setValue(0));
    gradeScale.setValue(0);

    Animated.stagger(
      120,
      DIMS.map((d, i) =>
        Animated.timing(barAnims[i], {
          toValue: result.breakdown[d.key] / 100,
          duration: 700,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        })
      )
    ).start(() => {
      Animated.spring(gradeScale, {
        toValue: 1,
        friction: 5,
        tension: 80,
        useNativeDriver: true,
      }).start();
    });
  }, [visible, result, barAnims, gradeScale]);

  if (!result) return null;
  const gradeColor = GRADE_COLORS[result.grade] || COLORS.accent;
  const hasChallengeBonus = result.challenge?.completed && (result.challenge.bonus_coins > 0 || result.challenge.bonus_xp > 0);
  const hasAchs = result.new_achievements && result.new_achievements.length > 0;

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <ScrollView
          style={{ width: "100%", maxWidth: 420 }}
          contentContainerStyle={{ alignItems: "center", paddingVertical: 20, paddingHorizontal: 4 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.card, { borderColor: gradeColor + "AA", shadowColor: gradeColor }]} testID="simulation-results-modal">
            <Text style={styles.heading}>FESTIVAL RESULTS</Text>
            <Animated.View style={{ transform: [{ scale: gradeScale }], alignItems: "center", marginBottom: 12 }}>
              <Text
                style={[styles.grade, { color: gradeColor, textShadowColor: gradeColor }]}
                testID={`results-grade-${result.grade}`}
              >
                {result.grade}
              </Text>
              <Text style={styles.compositeNum}>{result.composite}/100</Text>
            </Animated.View>

            <View style={{ width: "100%", gap: 10, marginBottom: 16 }}>
              {DIMS.map((d, i) => {
                const v = result.breakdown[d.key];
                return (
                  <View key={d.key} testID={`results-dim-${d.key}`}>
                    <View style={styles.dimHeader}>
                      <Text style={styles.dimLabel}>{d.label}</Text>
                      <Text style={[styles.dimVal, { color: d.color }]}>{v}</Text>
                    </View>
                    <View style={styles.barOuter}>
                      <Animated.View
                        style={[
                          styles.barInner,
                          {
                            backgroundColor: d.color,
                            width: barAnims[i].interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
                          },
                        ]}
                      />
                    </View>
                  </View>
                );
              })}
            </View>

            {result.penalty > 0 && (
              <View style={styles.penalty} testID="results-penalty">
                <Ionicons name="warning" size={14} color={COLORS.warning} />
                <Text style={styles.penaltyText}> Unfinished builds penalty: -{result.penalty}</Text>
              </View>
            )}

            <View style={styles.rewards}>
              <View style={styles.rewardPill}>
                <Ionicons name="cash" size={14} color={COLORS.accent} />
                <Text style={styles.rewardText}>+{result.rewards.coins}</Text>
              </View>
              <View style={styles.rewardPill}>
                <Ionicons name="flash" size={14} color={COLORS.secondary} />
                <Text style={styles.rewardText}>+{result.rewards.xp} XP</Text>
              </View>
              <View style={styles.rewardPill}>
                <Ionicons name="trophy" size={14} color={COLORS.primary} />
                <Text style={styles.rewardText}>Lv {result.state.level} · P{result.state.phase}</Text>
              </View>
            </View>

            {/* Daily Challenge bonus */}
            {hasChallengeBonus && (
              <View style={styles.challengeBonus}>
                <Text style={styles.challengeBonusLabel}>🎯 DAILY CHALLENGE COMPLETE!</Text>
                <Text style={styles.challengeBonusName}>{result.challenge!.name}</Text>
                <View style={styles.challengeBonusRewards}>
                  <Text style={styles.challengeBonusCoins}>+{result.challenge!.bonus_coins} coins</Text>
                  <Text style={styles.challengeBonusXp}>+{result.challenge!.bonus_xp} XP</Text>
                </View>
              </View>
            )}

            {/* Achievement unlocks */}
            {hasAchs && (
              <View style={styles.achSection}>
                <Text style={styles.achSectionLabel}>🏆 ACHIEVEMENT{result.new_achievements.length > 1 ? "S" : ""} UNLOCKED</Text>
                {result.new_achievements.map((a) => (
                  <View key={a.id} style={styles.achRow}>
                    <Text style={styles.achEmoji}>{a.emoji}</Text>
                    <View>
                      <Text style={styles.achName}>{a.name}</Text>
                      <Text style={styles.achDesc}>{a.desc}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            <TouchableOpacity style={styles.cta} onPress={onClose} testID="results-close">
              <Text style={styles.ctaText}>CONTINUE</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.88)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    borderWidth: 2,
    padding: 22,
    alignItems: "center",
    shadowOpacity: 0.6,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  heading: {
    color: COLORS.textPrimary, fontSize: 16, fontWeight: "800", letterSpacing: 4, marginBottom: 8,
  },
  grade: {
    fontSize: 110, fontWeight: "900", letterSpacing: -4,
    textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 18,
  },
  compositeNum: { color: COLORS.textSecondary, fontWeight: "700", fontSize: 14, letterSpacing: 1 },
  dimHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  dimLabel: { color: COLORS.textSecondary, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  dimVal: { fontSize: 12, fontWeight: "800" },
  barOuter: { height: 8, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 4, overflow: "hidden" },
  barInner: { height: 8, borderRadius: 4 },
  penalty: {
    flexDirection: "row", alignItems: "center", marginBottom: 12,
    backgroundColor: "rgba(255,153,0,0.12)", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
  },
  penaltyText: { color: COLORS.warning, fontSize: 11, fontWeight: "700" },
  rewards: { flexDirection: "row", gap: 8, marginBottom: 14, flexWrap: "wrap", justifyContent: "center" },
  rewardPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: COLORS.surfaceElev, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },
  rewardText: { color: COLORS.textPrimary, fontWeight: "800", fontSize: 12 },
  challengeBonus: {
    width: "100%",
    backgroundColor: "#FFD70011",
    borderWidth: 1,
    borderColor: "#FFD70066",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    marginBottom: 12,
  },
  challengeBonusLabel: { color: "#FFD700", fontWeight: "900", fontSize: 10, letterSpacing: 1.5, marginBottom: 4 },
  challengeBonusName: { color: COLORS.textPrimary, fontSize: 12, fontWeight: "700", textAlign: "center", marginBottom: 6 },
  challengeBonusRewards: { flexDirection: "row", gap: 12 },
  challengeBonusCoins: { color: COLORS.success, fontWeight: "900", fontSize: 13 },
  challengeBonusXp: { color: COLORS.secondary, fontWeight: "800", fontSize: 13 },
  achSection: {
    width: "100%",
    backgroundColor: "#FFD70009",
    borderWidth: 1,
    borderColor: "#FFD70044",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    gap: 8,
  },
  achSectionLabel: { color: "#FFD700", fontWeight: "900", fontSize: 10, letterSpacing: 1.5, marginBottom: 2 },
  achRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  achEmoji: { fontSize: 20 },
  achName: { color: COLORS.textPrimary, fontWeight: "800", fontSize: 13 },
  achDesc: { color: COLORS.textSecondary, fontSize: 10, marginTop: 1 },
  cta: {
    backgroundColor: COLORS.primary, paddingHorizontal: 32, paddingVertical: 12, borderRadius: 999,
    shadowColor: COLORS.primary, shadowOpacity: 0.5, shadowRadius: 12,
  },
  ctaText: { color: "#fff", fontWeight: "900", letterSpacing: 3, fontSize: 14 },
});
