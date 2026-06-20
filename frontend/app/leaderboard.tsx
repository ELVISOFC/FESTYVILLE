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
import { api } from "../src/api";
import { COLORS, GRADE_COLORS } from "../src/theme";

type Entry = { player_id: string; name: string; score: number; grade: string; timestamp: number };

export default function LeaderboardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [myId, setMyId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [lb, pid] = await Promise.all([api.leaderboard(), api.getPlayerId()]);
        setEntries((lb as any).entries ?? []);
        setMyId(pid);
      } catch {}
      finally { setLoading(false); }
    })();
  }, []);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="leaderboard-back">
          <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>LEADERBOARD</Text>
        <View style={styles.iconBtn} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : entries.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.empty}>No scores yet. Run your first festival!</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 20 }]}>
          {entries.map((e, i) => {
            const isMe = e.player_id === myId;
            const gc = GRADE_COLORS[e.grade] ?? COLORS.accent;
            const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
            return (
              <View
                key={`${e.player_id}-${e.timestamp}`}
                style={[styles.row, isMe && styles.rowMe]}
                testID={`leaderboard-entry-${i}`}
              >
                <Text style={styles.rank}>
                  {medal ?? `#${i + 1}`}
                </Text>
                <View style={styles.nameCol}>
                  <Text style={[styles.name, isMe && { color: COLORS.accent }]}>
                    {e.name}{isMe ? " (you)" : ""}
                  </Text>
                  <Text style={styles.date}>
                    {new Date(e.timestamp * 1000).toLocaleDateString()}
                  </Text>
                </View>
                <View style={[styles.gradePill, { borderColor: gc + "66", backgroundColor: gc + "18" }]}>
                  <Text style={[styles.gradeLetter, { color: gc }]}>{e.grade}</Text>
                </View>
                <Text style={[styles.score, { color: gc }]}>{e.score}</Text>
              </View>
            );
          })}
        </ScrollView>
      )}
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
  title: {
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 3,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { color: COLORS.textSecondary, fontSize: 14 },
  list: { padding: 16, gap: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  rowMe: {
    borderColor: COLORS.accent + "55",
    backgroundColor: COLORS.accent + "0A",
  },
  rank: {
    color: COLORS.textSecondary,
    fontWeight: "800",
    fontSize: 14,
    minWidth: 28,
    textAlign: "center",
  },
  nameCol: { flex: 1 },
  name: {
    color: COLORS.textPrimary,
    fontWeight: "700",
    fontSize: 14,
  },
  date: {
    color: COLORS.textSecondary,
    fontSize: 10,
    marginTop: 2,
  },
  gradePill: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  gradeLetter: { fontSize: 13, fontWeight: "900" },
  score: { fontWeight: "900", fontSize: 16, minWidth: 36, textAlign: "right" },
});
