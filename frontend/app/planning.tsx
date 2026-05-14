import React, { useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { api, type Artist, type Genre, type PlayerState } from "../src/api";
import { COLORS } from "../src/theme";
import { Analytics } from "../src/analytics";
import TutorialModal from "../src/components/TutorialModal";

const GENRE_COLORS: Record<string, string> = {
  edm:    "#00FFFF",
  indie:  "#00FF66",
  hiphop: "#FF9900",
  rock:   "#FF0055",
  mixed:  "#FFD700",
};

function alertOrLog(title: string, msg: string) {
  if (Platform.OS === "web") window.alert(`${title}\n\n${msg}`);
  else Alert.alert(title, msg);
}

export default function Planning() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [state, setState] = useState<PlayerState | null>(null);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Analytics.screenView("planning");
    (async () => {
      try {
        const [a, s] = await Promise.all([api.artists(), api.state()]);
        setArtists(a.artists);
        setGenres(a.genres);
        setState(s as PlayerState);
      } catch (e: any) {
        Analytics.errorOccurred("load_failed", e.message || String(e), "planning_init");
        alertOrLog("Connection Error", e.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filteredArtists = useMemo(() => {
    if (!state?.genre || state.genre === "mixed") return artists;
    return artists.filter((a) => a.genre === state.genre);
  }, [artists, state?.genre]);

  const pickGenre = async (gid: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const s = await api.setGenre(gid);
      setState(s as PlayerState);
      Analytics.genreSelected(gid);
    } catch (e: any) { alertOrLog("Cannot set genre", e.message); }
    finally { setBusy(false); }
  };

  const toggleArtist = async (a: Artist) => {
    if (!state || busy) return;
    setBusy(true);
    const inLineup = state.lineup.includes(a.id);
    try {
      const s = inLineup ? await api.unbookArtist(a.id) : await api.bookArtist(a.id);
      setState(s as PlayerState);
      if (inLineup) {
        Analytics.artistUnbooked(a.id);
      } else {
        Analytics.artistBooked(a.id, a.genre, a.tier, a.fee);
      }
    } catch (e: any) { alertOrLog(inMessage(inLineup), e.message); }
    finally { setBusy(false); }
  };

  const endDay = async () => {
    if (!state || busy) return;
    setBusy(true);
    try {
      const s = await api.advanceDay();
      setState(s as PlayerState);
      Analytics.dayAdvanced(s.day, s.cycle);
      if (s.last_event) {
        alertOrLog(`Day ${s.day} — Daily News`, `${s.last_event.text}\n+${s.last_event.coins} coins · +${s.last_event.xp} XP`);
      }
    } catch (e: any) { alertOrLog("Cannot end day", e.message); }
    finally { setBusy(false); }
  };

  if (loading || !state) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  const day = state.day;
  const isFestivalDay = day >= 7;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="planning-back" style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={{ alignItems: "center" }}>
          <Text style={styles.title}>PRE-PLANNING</Text>
          <Text style={styles.subtitle}>Cycle {state.cycle} · Day {day} / 7</Text>
        </View>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 120 }}>
        <Text style={styles.sectionLabel}>1. PICK A GENRE</Text>
        <View style={styles.genreRow}>
          {genres.map((g) => {
            const sel = state.genre === g.id;
            const c = GENRE_COLORS[g.id] || COLORS.accent;
            return (
              <TouchableOpacity
                key={g.id}
                onPress={() => pickGenre(g.id)}
                style={[styles.genreChip, sel && { borderColor: c, backgroundColor: c + "22" }]}
                testID={`genre-chip-${g.id}`}
              >
                <View style={[styles.genreDot, { backgroundColor: c }]} />
                <Text style={[styles.genreLabel, sel && { color: COLORS.textPrimary }]}>{g.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.sectionLabel, { marginTop: 18 }]}>2. BOOK THE LINEUP</Text>
        {!state.genre && (
          <Text style={styles.hint}>Pick a genre first to see eligible artists.</Text>
        )}
        {state.genre && (
          <View style={{ gap: 8 }}>
            {filteredArtists.map((a) => {
              const locked = a.phase > state.phase;
              const booked = state.lineup.includes(a.id);
              const tooPoor = !booked && state.coins < a.fee;
              const disabled = locked || (tooPoor && !booked);
              const c = GENRE_COLORS[a.genre] || COLORS.accent;
              return (
                <TouchableOpacity
                  key={a.id}
                  onPress={() => toggleArtist(a)}
                  disabled={disabled || busy}
                  style={[
                    styles.artistRow,
                    booked && { borderColor: c, backgroundColor: c + "16" },
                    disabled && { opacity: 0.4 },
                  ]}
                  testID={`artist-row-${a.id}`}
                >
                  <View style={[styles.artistAvatar, { backgroundColor: c + "33", borderColor: c }]}>
                    <Text style={[styles.artistInitial, { color: c }]}>
                      {a.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.artistName}>{a.name}</Text>
                    <Text style={styles.artistMeta}>
                      Tier {a.tier} · +{a.boost} stage boost
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <View style={styles.feePill}>
                      <Ionicons name="cash" size={11} color={COLORS.accent} />
                      <Text style={styles.feeText}>{a.fee}</Text>
                    </View>
                    {locked ? (
                      <Text style={styles.lockedTxt}>Phase {a.phase}</Text>
                    ) : booked ? (
                      <Text style={[styles.bookedTxt, { color: c }]}>BOOKED ✓</Text>
                    ) : (
                      <Text style={styles.tapTxt}>tap to book</Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {state.day_log.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: 18 }]}>DAILY NEWS</Text>
            <View style={{ gap: 6 }}>
              {state.day_log.slice().reverse().map((log, i) => (
                <View key={i} style={styles.logRow} testID={`day-log-${i}`}>
                  <Text style={styles.logDay}>D{log.day}</Text>
                  <Text style={styles.logText}>{log.text}</Text>
                  <Text style={styles.logReward}>+{log.coins}c · +{log.xp}xp</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        {isFestivalDay ? (
          <TouchableOpacity
            style={[styles.bigBtn, { backgroundColor: COLORS.primary }]}
            onPress={() => router.replace("/")}
            testID="planning-go-festival"
          >
            <Ionicons name="play" size={20} color="#fff" />
            <Text style={styles.bigBtnText}>FESTIVAL DAY — RUN FESTIVAL</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.bigBtn, { backgroundColor: COLORS.surfaceElev }]}
            disabled={busy}
            onPress={endDay}
            testID="planning-end-day"
          >
            <Ionicons name="moon" size={18} color={COLORS.secondary} />
            <Text style={[styles.bigBtnText, { color: COLORS.textPrimary }]}>
              END DAY {day}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <TutorialModal />
    </View>
  );
}

function inMessage(wasBooked: boolean) {
  return wasBooked ? "Cannot unbook" : "Cannot book";
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
  subtitle: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2, letterSpacing: 1 },
  sectionLabel: { color: COLORS.textSecondary, fontWeight: "800", fontSize: 11, letterSpacing: 2, marginBottom: 10 },
  genreRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  genreChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },
  genreDot: { width: 8, height: 8, borderRadius: 4 },
  genreLabel: { color: COLORS.textSecondary, fontWeight: "700", fontSize: 12 },
  hint: { color: COLORS.textSecondary, fontSize: 12, fontStyle: "italic" },
  artistRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: COLORS.surface, borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
  },
  artistAvatar: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1.5,
  },
  artistInitial: { fontWeight: "900", fontSize: 12 },
  artistName: { color: COLORS.textPrimary, fontWeight: "700", fontSize: 14 },
  artistMeta: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2 },
  feePill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
  },
  feeText: { color: COLORS.textPrimary, fontWeight: "800", fontSize: 11 },
  bookedTxt: { fontWeight: "900", fontSize: 10, marginTop: 4, letterSpacing: 1 },
  lockedTxt: { color: COLORS.warning, fontSize: 10, fontWeight: "700", marginTop: 4 },
  tapTxt: { color: COLORS.textSecondary, fontSize: 10, marginTop: 4 },
  logRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: COLORS.surface, borderRadius: 10, padding: 10,
  },
  logDay: { color: COLORS.accent, fontWeight: "800", fontSize: 11, width: 28 },
  logText: { color: COLORS.textPrimary, fontSize: 12, flex: 1 },
  logReward: { color: COLORS.success, fontSize: 11, fontWeight: "700" },
  bottomBar: {
    paddingHorizontal: 16, paddingTop: 12,
    backgroundColor: "#0c0d15",
    borderTopWidth: 1, borderColor: "rgba(255,255,255,0.06)",
  },
  bigBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 14, borderRadius: 999,
  },
  bigBtnText: { color: "#fff", fontWeight: "900", letterSpacing: 2, fontSize: 13 },
});
