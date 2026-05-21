import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { COLORS } from "../theme";

const STORAGE_KEY = "festyville.tutorial.planning_seen";

type Step = { icon: any; title: string; body: string };

const STEPS: Step[] = [
  {
    icon: "calendar",
    title: "7 Days. One Festival.",
    body: "Each cycle is 7 in-game days. You'll plan, build, and on Day 7 the gates open. Tap END DAY to advance.",
  },
  {
    icon: "musical-notes",
    title: "Day 1: Pick a Genre",
    body: "Lock in EDM, Indie/Folk, Hip-Hop, Rock, or Mixed. Your genre filters which artists you can book — and unlocks a +10 pure-genre bonus on simulation.",
  },
  {
    icon: "people",
    title: "Book Your Lineup",
    body: "Booking an artist costs coins and adds a stage-score boost. You can unbook at any time for a 50% refund.",
  },
  {
    icon: "newspaper",
    title: "Daily News",
    body: "Each END DAY triggers a micro-progression event (press buzz, sponsor deals, lucky weather…) for bonus coins + XP. The log lives at the bottom of this screen.",
  },
];

type Props = {
  onClose?: () => void;
  forceVisible?: boolean; // for replay from menu
};

export default function TutorialModal({ onClose, forceVisible }: Props) {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (forceVisible) {
      setVisible(true);
      setStep(0);
      return;
    }
    (async () => {
      try {
        const seen = await AsyncStorage.getItem(STORAGE_KEY);
        if (!seen) setVisible(true);
      } catch {
        // fail open: show tutorial
        setVisible(true);
      }
    })();
  }, [forceVisible]);

  const finish = async () => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, "1");
    } catch {}
    setVisible(false);
    onClose?.();
  };

  const handleNext = () => {
    if (step >= STEPS.length - 1) finish();
    else setStep(step + 1);
  };

  if (!visible) return null;
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card} testID="planning-tutorial">
          <View style={styles.iconWrap}>
            <Ionicons name={current.icon} size={36} color={COLORS.secondary} />
          </View>
          <Text style={styles.stepLabel}>STEP {step + 1} OF {STEPS.length}</Text>
          <Text style={styles.title}>{current.title}</Text>
          <Text style={styles.body}>{current.body}</Text>

          <View style={styles.dots}>
            {STEPS.map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i === step && styles.dotActive]}
              />
            ))}
          </View>

          <View style={styles.actions}>
            <TouchableOpacity onPress={finish} style={styles.skipBtn} testID="tutorial-skip">
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleNext} style={styles.nextBtn} testID="tutorial-next">
              <Text style={styles.nextText}>{isLast ? "GOT IT" : "NEXT"}</Text>
              {!isLast && <Ionicons name="arrow-forward" size={14} color="#fff" />}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.88)",
    justifyContent: "center", alignItems: "center", padding: 20,
  },
  card: {
    width: "100%", maxWidth: 420,
    backgroundColor: COLORS.surface,
    borderRadius: 22, padding: 22,
    borderWidth: 1, borderColor: COLORS.secondary + "55",
    alignItems: "center",
    shadowColor: COLORS.secondary, shadowOpacity: 0.4, shadowRadius: 18,
  },
  iconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: COLORS.surfaceElev,
    borderWidth: 1.5, borderColor: COLORS.secondary + "AA",
    alignItems: "center", justifyContent: "center",
    marginBottom: 14,
  },
  stepLabel: { color: COLORS.textSecondary, fontWeight: "800", fontSize: 10, letterSpacing: 3, marginBottom: 6 },
  title: { color: COLORS.textPrimary, fontWeight: "900", fontSize: 20, textAlign: "center", marginBottom: 8 },
  body: { color: COLORS.textSecondary, fontSize: 13, textAlign: "center", lineHeight: 19, marginBottom: 18 },
  dots: { flexDirection: "row", gap: 6, marginBottom: 18 },
  dot: {
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  dotActive: { backgroundColor: COLORS.secondary, width: 20 },
  actions: { flexDirection: "row", gap: 10, width: "100%" },
  skipBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 999,
    alignItems: "center", justifyContent: "center",
    backgroundColor: COLORS.surfaceElev,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },
  skipText: { color: COLORS.textSecondary, fontWeight: "800", fontSize: 12, letterSpacing: 2 },
  nextBtn: {
    flex: 2, paddingVertical: 12, borderRadius: 999,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary, shadowOpacity: 0.4, shadowRadius: 10,
  },
  nextText: { color: "#fff", fontWeight: "900", fontSize: 13, letterSpacing: 3 },
});
