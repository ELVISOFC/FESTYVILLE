import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { COLORS } from "../theme";

const CHARACTER_DATA: Record<string, { name: string; role: string; emoji: string; color: string }> = {
  sky:   { name: "Sky",   role: "PR Manager",      emoji: "📣", color: "#FF9900" },
  vault: { name: "Vault", role: "Finance Wizard",  emoji: "💰", color: "#FFD700" },
  marcy: { name: "Marcy", role: "Merch Queen",     emoji: "👑", color: "#FF0055" },
  baz:   { name: "DJ Baz",role: "Stage Director",  emoji: "🎧", color: "#00FFFF" },
  frank: { name: "Frank", role: "Health Inspector",emoji: "🏥", color: "#00FF66" },
  axle:  { name: "Axle",  role: "Site Foreman",    emoji: "🔧", color: "#9966FF" },
};

type Props = {
  day: number;
  text: string;
  coins: number;
  xp: number;
  character_id?: string;
  streak_bonus?: boolean;
};

export default function CharacterBubble({ day, text, coins, xp, character_id, streak_bonus }: Props) {
  const char = character_id ? CHARACTER_DATA[character_id] : null;
  const color = char?.color ?? COLORS.accent;

  return (
    <View style={[styles.row, { borderLeftColor: color }]}>
      <View style={[styles.avatar, { backgroundColor: color + "22", borderColor: color + "88" }]}>
        <Text style={styles.avatarEmoji}>{char?.emoji ?? "📋"}</Text>
      </View>
      <View style={{ flex: 1 }}>
        {char && (
          <Text style={[styles.charName, { color }]}>{char.name} · {char.role}</Text>
        )}
        <Text style={styles.logText}>{text}</Text>
        {streak_bonus && (
          <Text style={styles.streakTag}>🔥 Streak bonus included!</Text>
        )}
      </View>
      <View style={styles.right}>
        <Text style={styles.dayLabel}>D{day}</Text>
        <Text style={styles.reward}>+{coins}c</Text>
        <Text style={styles.rewardXp}>+{xp}xp</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 10,
    borderLeftWidth: 3,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    marginTop: 2,
  },
  avatarEmoji: { fontSize: 16 },
  charName: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5, marginBottom: 2 },
  logText: { color: COLORS.textPrimary, fontSize: 12, lineHeight: 16 },
  streakTag: { color: "#FF9900", fontSize: 10, fontWeight: "700", marginTop: 4 },
  right: { alignItems: "flex-end", justifyContent: "center", gap: 2 },
  dayLabel: { color: COLORS.accent, fontWeight: "800", fontSize: 10 },
  reward: { color: COLORS.success, fontWeight: "800", fontSize: 11 },
  rewardXp: { color: COLORS.secondary, fontWeight: "700", fontSize: 10 },
});
