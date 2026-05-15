import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Share,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { api, type PlayerState } from "../src/api";
import { COLORS } from "../src/theme";
import { Analytics } from "../src/analytics";
import {
  ALL_MILESTONES,
  GENRE_TINT,
  TIER_META,
  tierProgress,
  type LegacyTier,
} from "../src/legacy";

export default function Legacy() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [state, setState] = useState<PlayerState | null>(null);

  useEffect(() => {
    Analytics.screenView("legacy");
    (async () => {
      try {
        const s = await api.state();
        setState(s as PlayerState);
      } catch {}
    })();
  }, []);

  const close = () => router.back();

  if (!state) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  const tier = (state.legacy_tier || "unknown") as LegacyTier;
  const meta = TIER_META[tier];
  const { nextTier, currentFloor, nextThreshold, progress01 } = tierProgress(
    tier,
    state.reputation_score,
  );
  const earned = new Set(state.milestone_ids);
  const earnedCount = ALL_MILESTONES.filter((m) => earned.has(m.id)).length;

  const genre = state.genre_identity;
  const genreColor = genre ? GENRE_TINT[genre] || COLORS.accent : COLORS.textSecondary;

  const onShare = async () => {
    try {
      const msg =
        `🎪 ${state.name || "Festival Boss"} — ${meta.label} TIER\n` +
        `${state.reputation_score.toLocaleString()} reputation · ${earnedCount}/${ALL_MILESTONES.length} milestones\n` +
        (genre ? `Genre identity: ${genre.toUpperCase()}\n` : "") +
        `#FestyVille`;
      if (Platform.OS === "web") {
        // Best-effort: use clipboard if Share isn't available on web.
        try {
          await (navigator as any).clipboard?.writeText(msg);
        } catch {}
      } else {
        await Share.share({ message: msg });
      }
    } catch {}
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={close} style={styles.iconBtn} testID="legacy-back">
          <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>LEGACY</Text>
        <TouchableOpacity onPress={onShare} style={styles.iconBtn} testID="legacy-share">
          <Ionicons name="share-social" size={20} color={COLORS.accent} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
        {/* Hero card — the screenshot moment */}
        <View
          style={[
            styles.hero,
            { borderColor: meta.color + "AA", shadowColor: meta.color },
          ]}
          testID="legacy-hero"
        >
          <Text style={styles.heroEyebrow}>FESTIVAL</Text>
          <Text style={styles.heroName} numberOfLines={2} testID="legacy-festival-name">
            {state.name || "Festival Boss"}
          </Text>

          <View style={styles.badgeRow}>
            <View
              style={[
                styles.tierBadge,
                { borderColor: meta.color, backgroundColor: meta.color + "1A" },
              ]}
              testID="legacy-tier-badge"
            >
              <Text style={[styles.tierBadgeText, { color: meta.color }]}>
                {meta.label}
              </Text>
            </View>
            <View
              style={[
                styles.genreBadge,
                {
                  borderColor: genreColor + (genre ? "AA" : "55"),
                  backgroundColor: genreColor + (genre ? "1A" : "08"),
                },
              ]}
              testID="legacy-genre-badge"
            >
              <Ionicons name="musical-notes" size={13} color={genreColor} style={{ marginRight: 5 }} />
              <Text style={[styles.genreBadgeText, { color: genreColor }]}>
                {genre ? genre.toUpperCase() : "NO IDENTITY"}
              </Text>
            </View>
          </View>

          <Text style={[styles.heroTagline, { color: meta.color }]}>{meta.tagline}</Text>

          {/* Reputation bar */}
          <View style={styles.repHeader}>
            <Text style={styles.repLabel}>REPUTATION</Text>
            <Text style={styles.repValue} testID="legacy-rep-value">
              {state.reputation_score.toLocaleString()}
            </Text>
          </View>
          <View style={styles.barTrack}>
            <View
              style={[
                styles.barFill,
                { width: `${progress01 * 100}%`, backgroundColor: meta.color },
              ]}
              testID="legacy-rep-bar"
            />
          </View>
          <View style={styles.repFootRow}>
            <Text style={styles.repFootText}>{currentFloor.toLocaleString()}</Text>
            <Text style={styles.repFootText}>
              {nextTier
                ? `${nextThreshold.toLocaleString()} → ${TIER_META[nextTier].label}`
                : "MAX TIER"}
            </Text>
          </View>

          {/* Quick stats row */}
          <View style={styles.statsRow}>
            <Stat label="FESTIVALS" value={`${state.festivals_run}`} />
            <Stat label="MILESTONES" value={`${earnedCount}/${ALL_MILESTONES.length}`} />
            <Stat label="LEVEL" value={`${state.level}`} />
          </View>
        </View>

        {/* Milestones grid */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>MILESTONES</Text>
          <Text style={styles.sectionCount}>{earnedCount}/{ALL_MILESTONES.length}</Text>
        </View>

        <View style={styles.msGrid} testID="legacy-milestone-grid">
          {ALL_MILESTONES.map((m) => {
            const done = earned.has(m.id);
            return (
              <View
                key={m.id}
                style={[styles.msCard, done && styles.msCardDone]}
                testID={`legacy-milestone-${m.id}${done ? "-earned" : ""}`}
              >
                <Text style={[styles.msEmoji, !done && { opacity: 0.25 }]}>{m.emoji}</Text>
                <Text
                  style={[styles.msName, !done && { color: COLORS.textSecondary }]}
                  numberOfLines={1}
                >
                  {m.name}
                </Text>
                <Text style={styles.msDesc} numberOfLines={2}>{m.desc}</Text>
                <Text style={[styles.msRep, done && { color: "#00FFFF" }]}>
                  +{m.reward_rep} REP
                </Text>
                {done && <View style={styles.msDoneDot} />}
              </View>
            );
          })}
        </View>

        <Text style={styles.footnote}>
          Build it. Run it. Own the night.
        </Text>
      </ScrollView>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  center: { alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14, paddingBottom: 8,
    borderBottomWidth: 1, borderColor: "rgba(255,255,255,0.06)",
  },
  iconBtn: { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
  title: { color: COLORS.textPrimary, fontWeight: "900", letterSpacing: 4, fontSize: 14 },
  hero: {
    backgroundColor: COLORS.surface,
    borderRadius: 20, borderWidth: 2,
    padding: 18, marginBottom: 22,
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 20,
  },
  heroEyebrow: {
    color: COLORS.textSecondary, fontWeight: "800",
    fontSize: 10, letterSpacing: 3,
  },
  heroName: {
    color: COLORS.textPrimary, fontWeight: "900",
    fontSize: 28, marginTop: 2, marginBottom: 12,
  },
  badgeRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 10 },
  tierBadge: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 999, borderWidth: 1.5,
  },
  tierBadgeText: { fontWeight: "900", fontSize: 12, letterSpacing: 3 },
  genreBadge: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 999, borderWidth: 1,
  },
  genreBadgeText: { fontWeight: "800", fontSize: 11, letterSpacing: 2 },
  heroTagline: {
    fontStyle: "italic", fontSize: 12, marginBottom: 14, opacity: 0.9,
  },
  repHeader: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "baseline", marginBottom: 6,
  },
  repLabel: { color: COLORS.textSecondary, fontWeight: "800", fontSize: 10, letterSpacing: 2 },
  repValue: { color: COLORS.textPrimary, fontWeight: "900", fontSize: 18 },
  barTrack: {
    height: 10, borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)", overflow: "hidden",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
  },
  barFill: { height: "100%", borderRadius: 999 },
  repFootRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  repFootText: { color: COLORS.textSecondary, fontSize: 10, fontWeight: "700" },
  statsRow: {
    flexDirection: "row", justifyContent: "space-between",
    marginTop: 14, paddingTop: 14,
    borderTopWidth: 1, borderColor: "rgba(255,255,255,0.06)",
  },
  stat: { alignItems: "center", flex: 1 },
  statValue: { color: COLORS.textPrimary, fontWeight: "900", fontSize: 18 },
  statLabel: { color: COLORS.textSecondary, fontSize: 9, letterSpacing: 2, marginTop: 2 },
  sectionHeaderRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionLabel: { color: COLORS.textSecondary, fontWeight: "800", fontSize: 11, letterSpacing: 2 },
  sectionCount: { color: COLORS.accent, fontWeight: "900", fontSize: 11 },
  msGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  msCard: {
    width: "30.8%",
    backgroundColor: COLORS.surface,
    borderRadius: 12, padding: 10,
    alignItems: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.07)",
    position: "relative",
    minHeight: 110,
  },
  msCardDone: {
    borderColor: "#00FFFF55",
    backgroundColor: "#00FFFF09",
  },
  msEmoji: { fontSize: 22, marginBottom: 4 },
  msName: { color: COLORS.textPrimary, fontWeight: "800", fontSize: 10, textAlign: "center", marginBottom: 2 },
  msDesc: { color: COLORS.textSecondary, fontSize: 9, textAlign: "center", lineHeight: 12, flex: 1 },
  msRep: { color: COLORS.textSecondary, fontSize: 9, fontWeight: "900", letterSpacing: 1, marginTop: 4 },
  msDoneDot: {
    position: "absolute", top: 6, right: 6,
    width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#00FFFF",
  },
  footnote: {
    color: COLORS.textSecondary, fontSize: 10,
    textAlign: "center", letterSpacing: 2, marginTop: 24,
  },
});
