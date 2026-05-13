import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { api, type PlayerState } from "../src/api";
import { COLORS, GRADE_COLORS } from "../src/theme";
import AsyncStorage from "@react-native-async-storage/async-storage";

function confirm(title: string, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (Platform.OS === "web") {
      resolve(window.confirm(`${title}\n\n${message}`));
    } else {
      Alert.alert(title, message, [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: "Confirm", style: "destructive", onPress: () => resolve(true) },
      ]);
    }
  });
}

export default function Menu() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [state, setState] = useState<PlayerState | null>(null);
  const [pid, setPid] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const myId = await api.getPlayerId();
        setPid(myId);
        const s = await api.state();
        setState(s as PlayerState);
      } catch {}
    })();
  }, []);

  const close = () => router.back();

  const doNewSave = async () => {
    const ok = await confirm("Start a new save?", "Your current progress is kept under its player ID, but the app will switch to a fresh game.");
    if (!ok) return;
    setBusy(true);
    try {
      await api.newSave();
      router.replace("/");
    } finally { setBusy(false); }
  };

  const doReset = async () => {
    const ok = await confirm("Reset this save?", "Your buildings, coins, XP, and lineup will be wiped. Your display name and player ID stay.");
    if (!ok) return;
    setBusy(true);
    try {
      await api.resetSave();
      router.replace("/");
    } finally { setBusy(false); }
  };

  const doDelete = async () => {
    const ok = await confirm("Delete this save?", "Your player record is removed from the server and the app starts fresh next launch. This cannot be undone.");
    if (!ok) return;
    setBusy(true);
    try {
      await api.deleteSave();
      router.replace("/");
    } finally { setBusy(false); }
  };

  const replayTutorial = async () => {
    try { await AsyncStorage.removeItem("festyville.tutorial.planning_seen"); } catch {}
    router.replace("/planning");
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={close} style={styles.iconBtn} testID="menu-back">
          <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>MENU</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
        {/* Save summary card */}
        <View style={styles.card} testID="menu-save-card">
          <Text style={styles.cardLabel}>CURRENT SAVE</Text>
          {!state ? (
            <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 16 }} />
          ) : (
            <>
              <Text style={styles.bossName} numberOfLines={1}>{state.name || "Festival Boss"}</Text>
              <Text style={styles.pidLine}>ID: {pid}</Text>
              <View style={styles.statsRow}>
                <Stat icon="cash" label={`${state.coins}`} color={COLORS.accent} />
                <Stat icon="flash" label={`${state.xp} XP`} color={COLORS.secondary} />
                <Stat icon="trophy" label={`Lv ${state.level} · P${state.phase}`} color={COLORS.primary} />
              </View>
              <View style={styles.statsRow}>
                <Stat icon="calendar" label={`Cycle ${state.cycle} · Day ${state.day}/7`} color={COLORS.warning} />
                <Stat icon="musical-notes" label={state.genre ? state.genre.toUpperCase() : "—"} color={COLORS.secondary} />
                <Stat icon="business" label={`${state.buildings.length} bldgs`} color={COLORS.textSecondary} />
              </View>
              {state.last_grade && (
                <View style={[styles.lastGradeRow, { borderColor: (GRADE_COLORS[state.last_grade] || COLORS.accent) + "AA" }]}>
                  <Text style={styles.lastGradeLabel}>LAST GRADE</Text>
                  <Text style={[styles.lastGradeLetter, { color: GRADE_COLORS[state.last_grade] || COLORS.accent }]}>
                    {state.last_grade}
                  </Text>
                  <Text style={styles.lastGradeScore}>{state.last_score}/100 · {state.festivals_run} run{state.festivals_run === 1 ? "" : "s"}</Text>
                </View>
              )}
            </>
          )}
        </View>

        <Text style={styles.sectionLabel}>SAVE OPTIONS</Text>

        <ActionBtn
          icon="play"
          color={COLORS.primary}
          title="Resume"
          subtitle="Back to the festival"
          onPress={close}
          testID="menu-resume"
        />
        <ActionBtn
          icon="add-circle"
          color={COLORS.secondary}
          title="New Save"
          subtitle="Start a fresh game · keeps your current save on the server"
          onPress={doNewSave}
          disabled={busy}
          testID="menu-new-save"
        />
        <ActionBtn
          icon="refresh"
          color={COLORS.warning}
          title="Reset This Save"
          subtitle="Wipe progress, keep your player ID and display name"
          onPress={doReset}
          disabled={busy}
          testID="menu-reset-save"
          dangerous
        />
        <ActionBtn
          icon="trash"
          color={COLORS.error}
          title="Delete Save"
          subtitle="Purge your save from the server. Starts fresh on next launch"
          onPress={doDelete}
          disabled={busy}
          testID="menu-delete-save"
          dangerous
        />

        <Text style={[styles.sectionLabel, { marginTop: 20 }]}>HELP</Text>
        <ActionBtn
          icon="help-circle"
          color={COLORS.secondary}
          title="Replay Planning Tutorial"
          subtitle="Walk through the 4-step pre-planning intro again"
          onPress={replayTutorial}
          testID="menu-replay-tutorial"
        />

        <Text style={[styles.footnote, { marginTop: 24 }]}>
          FestyVille prototype · Build the festival. Run the show. Own the night.
        </Text>
      </ScrollView>
    </View>
  );
}

function Stat({ icon, label, color }: { icon: any; label: string; color: string }) {
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={13} color={color} style={{ marginRight: 4 }} />
      <Text style={styles.statText}>{label}</Text>
    </View>
  );
}

function ActionBtn({
  icon, color, title, subtitle, onPress, disabled, testID, dangerous,
}: {
  icon: any; color: string; title: string; subtitle: string;
  onPress: () => void; disabled?: boolean; testID?: string; dangerous?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[styles.actionBtn, { borderColor: color + (dangerous ? "AA" : "55") }, disabled && { opacity: 0.5 }]}
      testID={testID}
      activeOpacity={0.8}
    >
      <View style={[styles.actionIcon, { backgroundColor: color + "22", borderColor: color + "88" }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.actionTitle, dangerous && { color }]}>{title}</Text>
        <Text style={styles.actionSubtitle}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={COLORS.textSecondary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14, paddingBottom: 8,
    borderBottomWidth: 1, borderColor: "rgba(255,255,255,0.06)",
  },
  iconBtn: { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
  title: { color: COLORS.textPrimary, fontWeight: "900", letterSpacing: 4, fontSize: 14 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
    marginBottom: 18,
  },
  cardLabel: { color: COLORS.textSecondary, fontWeight: "800", fontSize: 10, letterSpacing: 2, marginBottom: 8 },
  bossName: { color: COLORS.textPrimary, fontWeight: "900", fontSize: 22, marginBottom: 2 },
  pidLine: { color: COLORS.textSecondary, fontSize: 11, marginBottom: 12 },
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 6 },
  stat: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.4)", borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
  },
  statText: { color: COLORS.textPrimary, fontWeight: "700", fontSize: 11 },
  lastGradeRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginTop: 10, padding: 10, borderRadius: 12,
    borderWidth: 1, backgroundColor: "rgba(0,0,0,0.3)",
  },
  lastGradeLabel: { color: COLORS.textSecondary, fontSize: 10, fontWeight: "800", letterSpacing: 2 },
  lastGradeLetter: { fontSize: 28, fontWeight: "900" },
  lastGradeScore: { color: COLORS.textSecondary, fontSize: 11, flex: 1, textAlign: "right" },
  sectionLabel: { color: COLORS.textSecondary, fontWeight: "800", fontSize: 11, letterSpacing: 2, marginBottom: 10 },
  actionBtn: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: COLORS.surface, borderRadius: 14,
    paddingVertical: 12, paddingHorizontal: 14,
    borderWidth: 1, marginBottom: 10,
  },
  actionIcon: {
    width: 38, height: 38, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1,
  },
  actionTitle: { color: COLORS.textPrimary, fontWeight: "800", fontSize: 14, marginBottom: 2 },
  actionSubtitle: { color: COLORS.textSecondary, fontSize: 11 },
  footnote: { color: COLORS.textSecondary, fontSize: 10, textAlign: "center", letterSpacing: 1 },
});
