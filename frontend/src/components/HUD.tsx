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
  day: number;
  cycle: number;
  genre: string | null;
  specialization: string | null;
  buildCap: number;
  artistCap: number;
  buildSlotsUsed: number;
  artistSlotsUsed: number;
  onOpenLeaderboard: () => void;
  onOpenPlanning: () => void;
  onOpenMenu: () => void;
  onOpenLegacy: () => void;
};

const SPEC_META: Record<string, { emoji: string; color: string; short: string }> = {
  producer: { emoji: "🎛", color: "#FF0055", short: "PRODUCER" },
  promoter: { emoji: "📣", color: "#FF9900", short: "PROMOTER" },
  operator: { emoji: "⚙️", color: "#00FFFF", short: "OPERATOR" },
  curator:  { emoji: "🎨", color: "#FFD700", short: "CURATOR"  },
};

const GENRE_TINT: Record<string, string> = {
  edm: "#00FFFF", indie: "#00FF66", hiphop: "#FF9900", rock: "#FF0055", mixed: "#FFD700",
};

export default function HUD(props: Props) {
  const { coins, xp, level, phase, activeBuilds, day, cycle, genre, specialization, buildCap, artistCap, buildSlotsUsed, artistSlotsUsed, onOpenLeaderboard, onOpenPlanning, onOpenMenu, onOpenLegacy } = props;
  const spec = specialization ? SPEC_META[specialization] : null;
  const dayColor = day >= 7 ? COLORS.primary : day === 1 ? COLORS.warning : COLORS.accent;
  
  const buildSlotColor = buildCap === 0 ? COLORS.textSecondary : buildSlotsUsed >= buildCap ? COLORS.danger : buildSlotsUsed >= buildCap * 0.8 ? COLORS.warning : COLORS.textSecondary;
  const artistSlotColor = artistCap === 0 ? COLORS.textSecondary : artistSlotsUsed >= artistCap ? COLORS.danger : artistSlotsUsed >= artistCap * 0.8 ? COLORS.warning : COLORS.textSecondary;
  
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <TouchableOpacity onPress={onOpenMenu} style={[styles.pill, styles.iconBtn]} testID="hud-open-menu">
          <Ionicons name="menu" size={20} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Pill icon="cash" color={COLORS.accent} label={formatNum(coins)} testID="hud-coin-balance" />
        <Pill icon="flash" color={COLORS.secondary} label={`${xp} XP`} testID="hud-xp-balance" />
        <Pill icon="trophy" color={COLORS.primary} label={`Lv ${level} · P${phase}`} testID="hud-level-phase" />
        <Pill
          icon="hammer"
          color={activeBuilds > 0 ? COLORS.warning : COLORS.textSecondary}
          label={`${activeBuilds}`}
          testID="hud-active-builds"
        />

        {/* Build Slots */}
        <Pill
          icon="cube"
          color={buildSlotColor}
          label={`${buildSlotsUsed}/${buildCap}`}
          testID="hud-build-slots"
        />

        {/* Artist Slots */}
        <Pill
          icon="musical-notes"
          color={artistSlotColor}
          label={`${artistSlotsUsed}/${artistCap}`}
          testID="hud-artist-slots"
        />

        <TouchableOpacity onPress={onOpenLegacy} style={styles.pill} testID="hud-open-legacy">
          <Ionicons name="ribbon" size={16} color={COLORS.primary} style={{ marginRight: 6 }} />
          <Text style={[styles.pillText, { color: COLORS.primary }]}>LEGACY</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onOpenLeaderboard} style={[styles.pill, styles.iconBtn]} testID="hud-open-leaderboard">
          <Ionicons name="podium" size={18} color={COLORS.accent} />
        </TouchableOpacity>
      </View>
      <View style={[styles.row, { marginTop: 8 }]}>
        <TouchableOpacity
          style={[styles.pill, { borderColor: dayColor + "AA" }]}
          onPress={onOpenPlanning}
          testID="hud-day-chip"
        >
          <Ionicons name="calendar" size={16} color={dayColor} style={{ marginRight: 6 }} />
          <Text style={styles.pillText}>
            C{cycle} · Day {day}/7
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.pill, genre ? { borderColor: (GENRE_TINT[genre] || COLORS.accent) + "AA" } : null]}
          onPress={onOpenPlanning}
          testID="hud-genre-chip"
        >
          <Ionicons name="musical-notes" size={16} color={genre ? (GENRE_TINT[genre] || COLORS.accent) : COLORS.textSecondary} style={{ marginRight: 6 }} />
          <Text style={[styles.pillText, !genre && { color: COLORS.textSecondary, fontStyle: "italic" }]}>
            {genre ? genre.toUpperCase() : "Pick genre"}
          </Text>
        </TouchableOpacity>
        {spec && (
          <View style={[styles.pill, { borderColor: spec.color + "88" }]} testID="hud-spec-pill">
            <Text style={{ fontSize: 13, marginRight: 4 }}>{spec.emoji}</Text>
            <Text style={[styles.pillText, { color: spec.color, fontSize: 12 }]}>{spec.short}</Text>
          </View>
        )}
        <TouchableOpacity
          style={[styles.pill, styles.iconBtn]}
          onPress={onOpenPlanning}
          testID="hud-open-planning"
        >
          <Ionicons name="albums" size={16} color={COLORS.secondary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Pill({ icon, color, label, testID }: { icon: any; color: string; label: string; testID?: string }) {
  return (
    <View style={styles.pill} testID={testID}>
      <Ionicons name={icon} size={16} color={color} style={{ marginRight: 6 }} />
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
  wrap: { paddingHorizontal: 12, alignItems: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  pill: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
  },
  pillText: { color: COLORS.textPrimary, fontWeight: "800", fontSize: 15, letterSpacing: 0.5 },
  iconBtn: { paddingHorizontal: 12 },
});
