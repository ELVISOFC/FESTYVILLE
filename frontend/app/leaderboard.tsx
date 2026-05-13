import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Platform,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { api } from "../src/api";
import { COLORS, GRADE_COLORS } from "../src/theme";

type Entry = {
  player_id: string;
  name: string;
  score: number;
  grade: string;
  timestamp: number;
};

export default function Leaderboard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pid, setPid] = useState<string>("");
  const [nameInput, setNameInput] = useState("");

  const load = useCallback(async () => {
    const data = await api.leaderboard();
    setEntries(data.entries || []);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const myId = await api.getPlayerId();
        setPid(myId);
        const me = await api.state();
        setNameInput(me.name || "");
        await load();
      } finally {
        setLoading(false);
      }
    })();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  };

  const saveName = async () => {
    const t = nameInput.trim();
    if (!t) return;
    try {
      await api.rename(t);
      await load();
      if (Platform.OS !== "web") Alert.alert("Saved", "Display name updated");
    } catch (e: any) {
      if (Platform.OS === "web") window.alert(e.message); else Alert.alert("Error", e.message);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="leaderboard-back" style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>LEADERBOARD</Text>
        <View style={{ width: 30 }} />
      </View>

      <View style={styles.nameRow}>
        <Ionicons name="person-circle" size={20} color={COLORS.secondary} />
        <TextInput
          value={nameInput}
          onChangeText={setNameInput}
          placeholder="Your display name"
          placeholderTextColor={COLORS.textSecondary}
          style={styles.nameInput}
          maxLength={20}
          testID="leaderboard-name-input"
        />
        <TouchableOpacity style={styles.saveBtn} onPress={saveName} testID="leaderboard-save-name">
          <Text style={styles.saveTxt}>SAVE</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item, idx) => `${item.player_id}-${item.timestamp}-${idx}`}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
          ListEmptyComponent={
            <Text style={{ color: COLORS.textSecondary, textAlign: "center", marginTop: 32 }}>
              No festivals yet — run yours to climb the ranks.
            </Text>
          }
          renderItem={({ item, index }) => {
            const isMe = item.player_id === pid;
            const gradeColor = GRADE_COLORS[item.grade] || COLORS.accent;
            return (
              <View
                style={[styles.row, isMe && { borderColor: COLORS.accent, backgroundColor: "#1c1d2c" }]}
                testID={`leaderboard-row-${index}`}
              >
                <Text style={[styles.rank, index < 3 && { color: COLORS.accent }]}>
                  #{index + 1}
                </Text>
                <Text style={styles.name} numberOfLines={1}>{item.name}{isMe ? " (you)" : ""}</Text>
                <View style={[styles.gradeChip, { borderColor: gradeColor + "AA" }]}>
                  <Text style={[styles.gradeText, { color: gradeColor }]}>{item.grade}</Text>
                </View>
                <Text style={styles.score}>{item.score}</Text>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14, paddingBottom: 10,
    borderBottomWidth: 1, borderColor: "rgba(255,255,255,0.06)",
  },
  back: { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
  title: { color: COLORS.textPrimary, fontWeight: "900", letterSpacing: 4, fontSize: 16 },
  nameRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    backgroundColor: COLORS.surface, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
  },
  nameInput: { flex: 1, color: COLORS.textPrimary, fontSize: 14, paddingVertical: 4 },
  saveBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  saveTxt: { color: "#fff", fontWeight: "800", fontSize: 11, letterSpacing: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: COLORS.surface, borderRadius: 12, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.06)",
  },
  rank: { color: COLORS.textSecondary, fontWeight: "900", width: 40, fontSize: 14 },
  name: { color: COLORS.textPrimary, flex: 1, fontWeight: "700", fontSize: 14 },
  gradeChip: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1.5,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  gradeText: { fontWeight: "900", fontSize: 14 },
  score: { color: COLORS.accent, fontWeight: "900", width: 50, textAlign: "right", fontSize: 14 },
});
