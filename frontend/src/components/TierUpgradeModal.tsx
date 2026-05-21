// frontend/src/components/TierUpgradeModal.tsx
//
// Celebration modal that fires BEFORE SimulationModal on a tier upgrade.
// Props derived from index.tsx usage:
//   visible, fromTier, toTier, reputationScore, onClose

import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Easing,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../theme";
import { TIER_META, TIER_ORDER, type LegacyTier } from "../legacy";

type Props = {
  visible: boolean;
  fromTier: LegacyTier | null;
  toTier: LegacyTier | null;
  reputationScore: number;
  onClose: () => void;
};

export default function TierUpgradeModal({
  visible,
  fromTier,
  toTier,
  reputationScore,
  onClose,
}: Props) {
  const scaleAnim = useRef(new Animated.Value(0.6)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      scaleAnim.setValue(0.6);
      opacityAnim.setValue(0);
      glowAnim.setValue(0);
      return;
    }

    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 60,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.sine),
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.3,
          duration: 900,
          easing: Easing.inOut(Easing.sine),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [visible]);

  if (!visible || !toTier) return null;

  const meta = TIER_META[toTier];
  const fromMeta = fromTier ? TIER_META[fromTier] : null;
  const tierIdx = TIER_ORDER.indexOf(toTier);

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.card,
            { borderColor: meta.color + "88" },
            {
              opacity: opacityAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
          testID="tier-upgrade-modal"
        >
          {/* Glow ring */}
          <Animated.View
            style={[
              styles.glowRing,
              { borderColor: meta.color, opacity: glowAnim },
            ]}
          />

          {/* Emoji badge */}
          <View style={[styles.emojiBadge, { backgroundColor: meta.color + "22", borderColor: meta.color + "66" }]}>
            <Text style={styles.emojiText}>{meta.emoji}</Text>
          </View>

          {/* Header */}
          <Text style={styles.unlocked}>TIER UNLOCKED</Text>
          <Text style={[styles.tierName, { color: meta.color }]}>
            {meta.label.toUpperCase()}
          </Text>

          {/* Tier progression dots */}
          <View style={styles.tierDots}>
            {TIER_ORDER.filter((t) => t !== "unknown").map((t, i) => {
              const tMeta = TIER_META[t];
              const filled = TIER_ORDER.indexOf(t) <= tierIdx;
              return (
                <View
                  key={t}
                  style={[
                    styles.dot,
                    filled && { backgroundColor: tMeta.color, borderColor: tMeta.color },
                  ]}
                />
              );
            })}
          </View>

          {/* From → To */}
          {fromMeta && fromTier !== toTier && (
            <View style={styles.fromToRow}>
              <Text style={[styles.fromLabel, { color: fromMeta.color }]}>
                {fromMeta.label}
              </Text>
              <Ionicons name="arrow-forward" size={14} color={COLORS.textSecondary} style={{ marginHorizontal: 8 }} />
              <Text style={[styles.toLabel, { color: meta.color }]}>
                {meta.label}
              </Text>
            </View>
          )}

          {/* Reputation score */}
          <View style={styles.repRow}>
            <Ionicons name="ribbon" size={16} color={meta.color} />
            <Text style={[styles.repScore, { color: meta.color }]}>
              {reputationScore.toLocaleString()} REP
            </Text>
          </View>

          {/* Flavour text */}
          <Text style={styles.flavour}>
            {flavourFor(toTier)}
          </Text>

          {/* CTA */}
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: meta.color }]}
            onPress={onClose}
            testID="tier-upgrade-close"
          >
            <Text style={styles.btnText}>LET'S GO 🎪</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

function flavourFor(tier: LegacyTier): string {
  switch (tier) {
    case "local":     return "Word's getting out. Local crowds are buzzing about your festival.";
    case "regional":  return "Artists are calling you. Your festival is on the regional circuit.";
    case "national":  return "Press coverage. Sponsorship deals. You're a national name now.";
    case "legendary": return "There's only one FestyVille. They'll be talking about this forever.";
    default:          return "Keep building. Your legacy starts here.";
  }
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    borderWidth: 2,
    padding: 28,
    alignItems: "center",
    gap: 12,
    overflow: "hidden",
  },
  glowRing: {
    position: "absolute",
    top: -20,
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 40,
  },
  emojiBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emojiText: { fontSize: 36 },
  unlocked: {
    color: COLORS.textSecondary,
    fontWeight: "900",
    fontSize: 11,
    letterSpacing: 4,
  },
  tierName: {
    fontWeight: "900",
    fontSize: 32,
    letterSpacing: 3,
    textAlign: "center",
  },
  tierDots: {
    flexDirection: "row",
    gap: 8,
    marginVertical: 4,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.2)",
  },
  fromToRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  fromLabel: {
    fontWeight: "800",
    fontSize: 14,
  },
  toLabel: {
    fontWeight: "900",
    fontSize: 14,
  },
  repRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  repScore: {
    fontWeight: "900",
    fontSize: 15,
    letterSpacing: 1,
  },
  flavour: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
    paddingHorizontal: 8,
  },
  btn: {
    marginTop: 8,
    width: "100%",
    paddingVertical: 15,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 15,
    letterSpacing: 3,
  },
});
