import React, { useEffect, useState, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Animated } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../theme";

type Props = {
  readyAt: number;
  placedAt: number;
  serverNow: number;
  onSpeedup: () => void;
  width?: number;
};

export default function ConstructionTimer({ readyAt, placedAt, serverNow, onSpeedup, width = 60 }: Props) {
  const [now, setNow] = useState(Date.now() / 1000);

  const pulseAnim = useRef(new Animated.Value(0)).current;
  const flashAnim = useRef(new Animated.Value(0)).current;
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const prevRemainingRef = useRef<number>(Infinity);
  const hasFlashedRef = useRef(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(id);
  }, []);

  const offset = serverNow - Date.now() / 1000;
  const adjustedNow = now + offset;
  const remaining = Math.max(0, readyAt - adjustedNow);
  const total = Math.max(1, readyAt - placedAt);
  const progress = Math.min(1, 1 - remaining / total);

  // When the building identity changes, reset all per-building state.
  useEffect(() => {
    hasFlashedRef.current = false;
    prevRemainingRef.current = Infinity;
    pulseAnim.setValue(0);
    flashAnim.setValue(0);
    pulseLoopRef.current?.stop();
    pulseLoopRef.current = null;
  }, [readyAt]);

  // Pulse glow: loop while last 10 seconds are ticking down.
  const isUrgent = remaining > 0 && remaining <= 10;
  useEffect(() => {
    if (isUrgent) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: false }),
          Animated.timing(pulseAnim, { toValue: 0, duration: 600, useNativeDriver: false }),
        ])
      );
      pulseLoopRef.current = loop;
      loop.start();
    } else {
      pulseLoopRef.current?.stop();
      pulseLoopRef.current = null;
      Animated.timing(pulseAnim, { toValue: 0, duration: 150, useNativeDriver: false }).start();
    }
    return () => {
      pulseLoopRef.current?.stop();
      pulseLoopRef.current = null;
    };
  }, [isUrgent]);

  // One-shot "ready" flash when remaining first crosses 0.
  useEffect(() => {
    if (prevRemainingRef.current > 0 && remaining === 0 && !hasFlashedRef.current) {
      hasFlashedRef.current = true;
      flashAnim.setValue(0);
      Animated.sequence([
        Animated.timing(flashAnim, { toValue: 1, duration: 180, useNativeDriver: false }),
        Animated.timing(flashAnim, { toValue: 0, duration: 360, useNativeDriver: false }),
      ]).start();
    }
    prevRemainingRef.current = remaining;
  }, [remaining]);

  // Pulse drives border color + shadow glow.
  const pulseBorderColor = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [COLORS.secondary + "55", COLORS.accent],
  });
  const pulseShadowOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.75],
  });

  // Flash drives scale + background color.
  const flashScale = flashAnim.interpolate({
    inputRange: [0, 0.35, 1],
    outputRange: [1, 1.13, 1],
  });
  const flashBg = flashAnim.interpolate({
    inputRange: [0, 0.35, 1],
    outputRange: ["rgba(0,0,0,0.9)", COLORS.accent + "EE", "rgba(0,0,0,0.9)"],
  });

  return (
    <View style={[styles.wrap, { width: width + 8 }]} pointerEvents="box-none">
      <Animated.View
        style={[
          styles.pill,
          {
            borderColor: pulseBorderColor,
            backgroundColor: flashBg,
            transform: [{ scale: flashScale }],
            shadowColor: COLORS.accent,
            shadowOpacity: pulseShadowOpacity,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 0 },
          },
        ]}
      >
        <TouchableOpacity
          onPress={onSpeedup}
          activeOpacity={0.8}
          testID="construction-timer"
          style={styles.pillInner}
        >
          <Ionicons name="time" size={10} color={COLORS.secondary} style={{ marginRight: 4 }} />
          <Text style={styles.text}>{formatRemaining(remaining)}</Text>
        </TouchableOpacity>
      </Animated.View>
      <View style={[styles.barOuter, { width }]}>
        <View style={[styles.barInner, { width: width * progress }]} />
      </View>
    </View>
  );
}

function formatRemaining(s: number) {
  if (s <= 0) return "DONE";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  if (m > 0) return `${m}m${sec.toString().padStart(2, "0")}`;
  return `${sec}s`;
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center" },
  pill: {
    borderRadius: 8,
    borderWidth: 1,
  },
  pillInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  text: { color: COLORS.secondary, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  barOuter: {
    height: 3,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 2,
    marginTop: 2,
    overflow: "hidden",
  },
  barInner: { height: 3, backgroundColor: COLORS.secondary },
});
