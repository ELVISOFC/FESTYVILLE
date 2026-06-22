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
  
  const buildSlotColor = buildCap === 0 ? COLORS.textSecondary : buildSlotsUsed >= buildCap ? COLORS.danger : buildSlotsUsed >= buildCap * 0.8 ? COLORS.warning : COLORS.textSecondary;
  const artistSlotColor = artistCap === 0 ? COLORS.textSecondary : artistSlotsUsed >= artistCap ? COLORS.danger : artistSlotsUsed >= artistCap * 0.8 ? COLORS.warning : COLORS.textSecondary;
  
  return (
    <View style={styles.root}>
      {/* ── TOP ROW: Resources ── */}
      <View style={styles.topRow}>
        <TouchableOpacity onPress={onOpenMenu} style={styles.iconButton} testID="hud-open-menu">
          <Ionicons name="menu" size={20} color={COLORS.textPrimary} />
        </TouchableOpacity>
        
        <Text style={styles.stat} testID="hud-level">Lv {level}</Text>
        
        <View style={styles.spacer} />
        
        <View style={styles.resourceGroup}>
          <Ionicons name="cash" size={14} color={COLORS.accent} />
          <Text style={[styles.stat, { color: COLORS.accent, marginLeft: 4 }]} testID="hud-coin-balance">
            {formatNum(coins)}
          </Text>
        </View>
        
        <View style={styles.resourceGroup}>
          <Ionicons name="flash" size={14} color={COLORS.secondary} />
          <Text style={[styles.stat, { color: COLORS.secondary, marginLeft: 4 }]} testID="hud-xp-balance">
            {xp}
          </Text>
        </View>
        
        <View style={styles.spacer} />
        
        <TouchableOpacity onPress={onOpenLegacy} style={styles.iconButton} testID="hud-open-legacy">
          <Ionicons name="ribbon" size={16} color={COLORS.primary} />
        </TouchableOpacity>
        
        <TouchableOpacity onPress={onOpenLeaderboard} style={styles.iconButton} testID="hud-open-leaderboard">
          <Ionicons name="podium" size={16} color={COLORS.accent} />
        </TouchableOpacity>
      </View>
      
      <View style={styles.divider} />
      
      {/* ── MIDDLE ROW: Festival Info ── */}
      <View style={styles.middleRow}>
        <TouchableOpacity onPress={onOpenPlanning} style={styles.infoChip} testID="hud-day-chip">
          <Text style={styles.chipText}>Day {day}/7</Text>
          <Text style={[styles.chipText, { fontSize: 12, color: COLORS.textSecondary }]}>C{cycle}</Text>
        </TouchableOpacity>
        
        <View style={styles.chipDivider} />
        
        {genre ? (
          <TouchableOpacity onPress={onOpenPlanning} style={styles.infoChip} testID="hud-genre-chip">
            <Text style={[styles.chipText, { color: GENRE_TINT[genre] || COLORS.accent }]}>
              {genre.toUpperCase()}
            </Text>
            <Ionicons name="musical-notes" size={12} color={GENRE_TINT[genre] || COLORS.accent} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={onOpenPlanning} style={styles.infoChip} testID="hud-genre-chip">
            <Text style={[styles.chipText, { color: COLORS.textSecondary, fontStyle: "italic" }]}>
              Pick genre
            </Text>
          </TouchableOpacity>
        )}
        
        <View style={styles.chipDivider} />
        
        {spec && (
          <>
            <View style={styles.infoChip} testID="hud-spec-pill">
              <Text style={{ fontSize: 12, marginRight: 2 }}>{spec.emoji}</Text>
              <Text style={[styles.chipText, { color: spec.color, fontSize: 11 }]}>
                {spec.short}
              </Text>
            </View>
            <View style={styles.chipDivider} />
          </>
        )}
        
        <View style={[styles.infoChip, { borderColor: buildSlotColor + "44" }]} testID="hud-build-slots">
          <Text style={[styles.chipText, { color: buildSlotColor, fontSize: 11 }]}>
            {buildSlotsUsed}/{buildCap}
          </Text>
          <Ionicons name="cube" size={11} color={buildSlotColor} style={{ marginLeft: 2 }} />
        </View>
        
        <View style={styles.chipDivider} />
        
        <View style={[styles.infoChip, { borderColor: artistSlotColor + "44" }]} testID="hud-artist-slots">
          <Text style={[styles.chipText, { color: artistSlotColor, fontSize: 11 }]}>
            {artistSlotsUsed}/{artistCap}
          </Text>
          <Ionicons name="musical-notes" size={11} color={artistSlotColor} style={{ marginLeft: 2 }} />
        </View>
        
        <TouchableOpacity onPress={onOpenPlanning} style={styles.iconButton} testID="hud-open-planning">
          <Ionicons name="albums" size={16} color={COLORS.secondary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function formatNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: "rgba(0,0,0,0.3)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 28,
  },
  middleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    height: 24,
    marginTop: 3,
    gap: 4,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    marginVertical: 2,
  },
  stat: {
    color: COLORS.textPrimary,
    fontWeight: "800",
    fontSize: 13,
    letterSpacing: 0.5,
  },
  resourceGroup: {
    flexDirection: "row",
    alignItems: "center",
  },
  spacer: {
    flex: 1,
  },
  iconButton: {
    padding: 6,
  },
  infoChip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.12)",
    gap: 2,
  },
  chipText: {
    color: COLORS.textPrimary,
    fontWeight: "700",
    fontSize: 12,
    letterSpacing: 0.3,
  },
  chipDivider: {
    width: 1,
    height: 14,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
});
