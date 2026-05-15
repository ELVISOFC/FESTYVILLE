import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Modal, TouchableOpacity, Animated, Easing } from "react-native";
import { COLORS } from "../theme";
import { TIER_META, type LegacyTier } from "../legacy";

type Props = {
  visible: boolean;
  fromTier: LegacyTier | null;
  toTier: LegacyTier | null;
  reputationScore: number;
  onClose: () => void;
};

export default function TierUpgradeModal({ visible, fromTier, toTier, reputationScore, onClose }: Props) {
  const scale = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    scale.setValue(0);
    glow.setValue(0);
    Animated.spring(scale, { toValue: 1, friction: 5, tension: 70, useNativeDriver: true }).start();
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(glow, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ])
    );
    glowLoop.start();
    return () => glowLoop.stop();
  }, [visible, scale, glow]);

  if (!toTier) return null;
  const meta = TIER_META[toTier];

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.overlay} testID="tier-upgrade-modal">
        <Animated.View
          style={[
            styles.card,
            {
              borderColor: meta.color,
              shadowColor: meta.color,
              shadowOpacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.95] }),
              transform: [{ scale }],
            },
          ]}
        >
          <Text style={styles.eyebrow}>✨ TIER UNLOCKED ✨</Text>
          <Text style={styles.fromLine}>
            {fromTier ? TIER_META[fromTier].label : "—"} → <Text style={{ color: meta.color }}>NEXT</Text>
          </Text>
          <Text style={[styles.tierName, { color: meta.color, textShadowColor: meta.color }]}>
            {meta.label}
          </Text>
          <Text style={styles.tagline}>{meta.tagline}</Text>
          <View style={[styles.repPill, { borderColor: meta.color + "AA" }]}>
            <Text style={[styles.repPillText, { color: meta.color }]}>
              {reputationScore.toLocaleString()} REP
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.cta, { backgroundColor: meta.color }]}
            onPress={onClose}
            testID="tier-upgrade-continue"
          >
            <Text style={styles.ctaText}>CONTINUE</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.85)",
    alignItems: "center", justifyContent: "center", padding: 20,
  },
  card: {
    width: "100%", maxWidth: 380,
    backgroundColor: COLORS.bg,
    borderRadius: 20, borderWidth: 2,
    paddingVertical: 28, paddingHorizontal: 22,
    alignItems: "center", gap: 10,
    shadowOffset: { width: 0, height: 0 }, shadowRadius: 24,
  },
  eyebrow: {
    color: COLORS.textSecondary, fontWeight: "900",
    fontSize: 11, letterSpacing: 4,
  },
  fromLine: { color: COLORS.textSecondary, fontWeight: "800", fontSize: 12, letterSpacing: 2 },
  tierName: {
    fontSize: 44, fontWeight: "900", letterSpacing: 6,
    textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 16,
    marginVertical: 4, textAlign: "center",
  },
  tagline: {
    color: COLORS.textPrimary, fontStyle: "italic",
    fontSize: 13, textAlign: "center", marginBottom: 8, paddingHorizontal: 8,
  },
  repPill: {
    paddingHorizontal: 16, paddingVertical: 6, borderRadius: 999,
    borderWidth: 1.5, backgroundColor: "rgba(0,0,0,0.4)", marginTop: 4,
  },
  repPillText: { fontWeight: "900", fontSize: 13, letterSpacing: 2 },
  cta: {
    paddingHorizontal: 40, paddingVertical: 14, borderRadius: 999, marginTop: 14,
  },
  ctaText: { color: "#000", fontWeight: "900", fontSize: 14, letterSpacing: 4 },
});
