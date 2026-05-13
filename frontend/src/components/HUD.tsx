import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../theme";

type Props = {
  coins: number;
  xp: number;
  level: number;
  phase: number;
  activeBuilds: number;
  onOpenLeaderboard: () => void;
};

export default function HUD({ coins, xp, level, phase, activeBuilds, onOpenLeaderboard }: Props) {
  return (
    <View style={styles.row}>
      <Pill icon="cash" color={COLORS.accent} label={formatNum(coins)} testID="hud-coin-balance" />
      <Pill icon="flash" color={COLORS.secondary} label={`${xp} XP`} testID="hud-xp-balance" />
      <Pill icon="trophy" color={COLORS.primary} label={`Lv ${level} · P${phase}`} testID="hud-level-phase" />
      <Pill
        icon="hammer"
        color={activeBuilds > 0 ? COLORS.warning : COLORS.textSecondary}
        label={`${activeBuilds}`}
        testID="hud-active-builds"
      />
      <TouchableOpacity
        onPress={onOpenLeaderboard}
        style={[styles.pill, styles.iconBtn]}
        testID="hud-open-leaderboard"
      >
        <Ionicons name="podium" size={16} color={COLORS.accent} />
      </TouchableOpacity>
    </View>
  );
}

function Pill({ icon, color, label, testID }: { icon: any; color: string; label: string; testID?: string }) {
  return (
    <View style={styles.pill} testID={testID}>
      <Ionicons name={icon} size={14} color={color} style={{ marginRight: 6 }} />
      <Text style={styles.pillText}>{label}</Text>
    </View>
  );
}

function formatNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    paddingHorizontal: 8,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  pillText: {
    color: COLORS.textPrimary,
    fontWeight: "800",
    fontSize: 13,
    letterSpacing: 0.5,
  },
  iconBtn: {
    paddingHorizontal: 10,
  },
});
