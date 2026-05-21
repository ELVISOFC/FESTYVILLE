import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, Easing } from "react-native";
import { COLORS } from "../theme";
import type { Achievement } from "../api";

type Props = {
  achievements: Achievement[];
  onDone: () => void;
};

export default function AchievementToast({ achievements, onDone }: Props) {
  const slideAnim = useRef(new Animated.Value(-120)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (achievements.length === 0) return;
    slideAnim.setValue(-120);
    opacityAnim.setValue(0);

    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 400,
        easing: Easing.out(Easing.back(1.5)),
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -120,
          duration: 350,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => onDone());
    }, 3200);

    return () => clearTimeout(timer);
  }, [achievements, slideAnim, opacityAnim, onDone]);

  if (achievements.length === 0) return null;
  const ach = achievements[0];

  return (
    <Animated.View
      style={[
        styles.toast,
        { transform: [{ translateY: slideAnim }], opacity: opacityAnim },
      ]}
      pointerEvents="none"
    >
      <View style={styles.emojiBox}>
        <Text style={styles.emoji}>{ach.emoji}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>ACHIEVEMENT UNLOCKED</Text>
        <Text style={styles.name}>{ach.name}</Text>
        <Text style={styles.desc}>{ach.desc}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    top: 0,
    left: 12,
    right: 12,
    backgroundColor: "#1a1b2e",
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#FFD700AA",
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
    shadowColor: "#FFD700",
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 20,
    zIndex: 9999,
  },
  emojiBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#FFD70022",
    borderWidth: 1.5,
    borderColor: "#FFD70088",
    alignItems: "center",
    justifyContent: "center",
  },
  emoji: { fontSize: 24 },
  label: {
    color: "#FFD700",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 2,
    marginBottom: 2,
  },
  name: { color: COLORS.textPrimary, fontWeight: "900", fontSize: 14 },
  desc: { color: COLORS.textSecondary, fontSize: 10, marginTop: 1 },
});
