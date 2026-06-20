import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, type PlayerState } from "../src/api";
import { COLORS } from "../src/theme";
import {
  TIER_META,
  TIER_ORDER,
  TIER_THRESHOLDS,
  MILESTONES,
  tierProgress,
  type LegacyTier,
} from "../src/legacy";

export default function LegacyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [state, setState] = useState<PlayerState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const s = await api.state();
        setState(s as PlayerState);
      } catch {}
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) {
    return (
      <View style={[styles.root, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  const rep = state?.reputation_score ?? 0;
  const tier = (state?.legacy_tier ?? "unknown") as LegacyTier;
  const { pct, next, pointsToNext } = tierProgress(rep);
  const tierMeta = TIER_META[tier];
  const nextMeta = next ? TIER_META[next] : null;
  const earned = new Set(state?.milestone_ids ?? []);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="legacy-back">
          <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>LEGACY</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}>

        {/* Current tier card */}
        <View style={[styles.tierCard, { borderColor: tierMeta.color + "66" }]}>
          <Text style={styles.tierEmoji}>{tierMeta.emoji}</Text>
          <Text style={[styles.tierLabel, { color: tierMeta.color }]}>{tierMeta.label.toUpperCase()}</Text>
          <Text style={styles.repScore}>{rep.toLocaleString()} rep</Text>
        </View>

        {/* Progress to next tier */}
        {next && nextMeta && (
          <View style={styles.progressSection}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressLabel}>Progress to {nextMeta.label}</Text>
              <Text style={[styles.progressPoints, { color: nextMeta.color }]}>
                {pointsToNext.toLocaleString()} to go
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.round(pct * 100)}%` as any, backgroundColor: nextMeta.color },
                ]}
              />
            </View>
          </View>
        )}

        {/* Tier ladder */}
        <Text style={styles.sectionLabel}>TIER LADDER</Text>
        <View style={styles.ladderCard}>
          {[...TIER_ORDER].reverse().map((t) => {
            const m = TIER_META[t];
            const isCurrentOrBelow = TIER_ORDER.indexOf(t) <= TIER_ORDER.indexOf(tier);
            return (
              <View key={t} style={styles.ladderRow}>
                <Text style={styles.ladderEmoji}>{m.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.ladderName, { color: isCurrentOrBelow ? m.color : COLORS.textSecondary }]}>
                    {m.label}
                  </Text>
                  <Text style={styles.ladderReq}>{TIER_THRESHOLDS[t].toLocaleString()} rep</Text>
                </View>
                {t === tier && (
                  <View style={[styles.currentBadge, { backgroundColor: m.color + "22", borderColor: m.color + "66" }]}>
                    <Text style={[styles.currentBadgeText, { color: m.color }]}>YOU</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Milestones */}
        <Text style={[styles.sectionLabel, { marginTop: 20 }]}>
          MILESTONES · {earned.size}/{MILESTONES.length}
        </Text>
        <View style={styles.milestonesList}>
          {MILESTONES.map((ms) => {
            const done = earned.has(ms.id);
            return (
              <View
                key={ms.id}
                style={[styles.msRow, done && styles.msDone]}
                testID={`milestone-${ms.id}`}
              >
                <Text style={[styles.msEmoji, !done && { opacity: 0.3 }]}>{ms.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.msName, !done && { color: COLORS.textSecondary }]}>
                    {ms.name}
                  </Text>
                  <Text style={styles.msDesc}>{ms.desc}</Text>
                </View>
                {done ? (
                  <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
                ) : (
                  <Ionicons name="lock-closed" size={14} color={COLORS.textSecondary} />
                )}
              </View>
            );
          })}
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#090A0F" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  iconBtn: { padding: 6, minWidth: 34 },
  title: { color: COLORS.textPrimary, fontSize: 18, fontWeight: "900", letterSpacing: 3 },
  body: { padding: 16, gap: 0 },
  tierCard: {
    alignItems: "center",
    borderWidth: 2,
    borderRadius: 20,
    padding: 24,
    backgroundColor: COLORS.surface,
    marginBottom: 16,
  },
  tierEmoji: { fontSize: 48, marginBottom: 8 },
  tierLabel: { fontSize: 22, fontWeight: "900", letterSpacing: 3, marginBottom: 4 },
  repScore: { color: COLORS.textSecondary, fontSize: 14, fontWeight: "700" },
  progressSection: { marginBottom: 20 },
  progressHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  progressLabel: { color: COLORS.textSecondary, fontSize: 12, fontWeight: "700" },
  progressPoints: { fontSize: 12, fontWeight: "800" },
  progressTrack: {
    height: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: { height: 8, borderRadius: 4 },
  sectionLabel: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 10,
  },
  ladderCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  ladderRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  ladderEmoji: { fontSize: 22, width: 30, textAlign: "center" },
  ladderName: { fontWeight: "800", fontSize: 14 },
  ladderReq: { color: COLORS.textSecondary, fontSize: 10, marginTop: 1 },
  currentBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  currentBadgeText: { fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  milestonesList: { gap: 8 },
  msRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  msDone: { borderColor: COLORS.success + "33", backgroundColor: COLORS.success + "08" },
  msEmoji: { fontSize: 20, width: 28, textAlign: "center" },
  msName: { color: COLORS.textPrimary, fontWeight: "800", fontSize: 13 },
  msDesc: { color: COLORS.textSecondary, fontSize: 10, marginTop: 2 },
});
