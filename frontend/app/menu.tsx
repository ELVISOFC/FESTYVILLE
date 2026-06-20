import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../src/api";
import { COLORS } from "../src/theme";

export default function MenuScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [name, setName]       = useState("");
  const [busy, setBusy]       = useState(false);
  const [nameErr, setNameErr] = useState<string | null>(null);

  const doRename = async () => {
    if (!name.trim()) { setNameErr("Enter a name."); return; }
    setBusy(true);
    setNameErr(null);
    try {
      await api.rename(name.trim());
      alertOrLog("Renamed", `Your festival is now "${name.trim()}"`);
      setName("");
    } catch (e: any) {
      setNameErr(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const doReset = () => {
    if (Platform.OS === "web") {
      if (!window.confirm("Reset your save? This clears all progress.")) return;
      void runReset();
    } else {
      Alert.alert("Reset Save", "This will clear all your progress. Are you sure?", [
        { text: "Cancel", style: "cancel" },
        { text: "Reset", style: "destructive", onPress: () => void runReset() },
      ]);
    }
  };

  const runReset = async () => {
    setBusy(true);
    try {
      await api.resetSave();
      router.replace("/");
    } catch (e: any) {
      alertOrLog("Error", e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const doNewSave = () => {
    if (Platform.OS === "web") {
      if (!window.confirm("Start a brand-new save? Your current save will be deleted.")) return;
      void runNewSave();
    } else {
      Alert.alert("New Save", "This will permanently delete your current save. Are you sure?", [
        { text: "Cancel", style: "cancel" },
        { text: "New Save", style: "destructive", onPress: () => void runNewSave() },
      ]);
    }
  };

  const runNewSave = async () => {
    setBusy(true);
    try {
      await api.newSave();
      router.replace("/");
    } catch (e: any) {
      alertOrLog("Error", e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="menu-back">
          <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>MENU</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>RENAME YOUR FESTIVAL</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="New festival name…"
              placeholderTextColor={COLORS.textSecondary}
              value={name}
              onChangeText={(t) => { setName(t); setNameErr(null); }}
              maxLength={20}
              testID="menu-name-input"
            />
            <TouchableOpacity
              style={[styles.smallBtn, { backgroundColor: COLORS.secondary }]}
              onPress={doRename}
              disabled={busy}
              testID="menu-rename-btn"
            >
              <Text style={styles.smallBtnText}>SAVE</Text>
            </TouchableOpacity>
          </View>
          {nameErr && <Text style={styles.errText}>{nameErr}</Text>}
        </View>

        <View style={styles.divider} />

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>DANGER ZONE</Text>

          <TouchableOpacity
            style={[styles.dangerBtn, { borderColor: COLORS.warning }]}
            onPress={doReset}
            disabled={busy}
            testID="menu-reset-btn"
          >
            <Ionicons name="refresh" size={18} color={COLORS.warning} />
            <View>
              <Text style={[styles.dangerBtnTitle, { color: COLORS.warning }]}>Reset Save</Text>
              <Text style={styles.dangerBtnDesc}>Restart from cycle 1 with your same account</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.dangerBtn, { borderColor: COLORS.error, marginTop: 10 }]}
            onPress={doNewSave}
            disabled={busy}
            testID="menu-newsave-btn"
          >
            <Ionicons name="trash" size={18} color={COLORS.error} />
            <View>
              <Text style={[styles.dangerBtnTitle, { color: COLORS.error }]}>New Save</Text>
              <Text style={styles.dangerBtnDesc}>Delete this save entirely and start fresh</Text>
            </View>
          </TouchableOpacity>
        </View>

        {busy && (
          <ActivityIndicator color={COLORS.primary} style={{ marginTop: 20 }} />
        )}
      </ScrollView>
    </View>
  );
}

function alertOrLog(title: string, msg: string) {
  if (Platform.OS === "web") window.alert(`${title}\n\n${msg}`);
  else Alert.alert(title, msg);
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
  body: { padding: 20, gap: 0 },
  section: { gap: 10 },
  sectionLabel: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 4,
  },
  inputRow: { flexDirection: "row", gap: 8 },
  input: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.textPrimary,
    fontSize: 14,
  },
  smallBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  smallBtnText: {
    color: "#000",
    fontWeight: "900",
    fontSize: 12,
    letterSpacing: 1,
  },
  errText: { color: COLORS.error, fontSize: 12 },
  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    marginVertical: 20,
  },
  dangerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  dangerBtnTitle: {
    fontWeight: "800",
    fontSize: 14,
    marginBottom: 2,
  },
  dangerBtnDesc: {
    color: COLORS.textSecondary,
    fontSize: 11,
  },
});
