import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
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
  // tick locally so countdown updates every second.
  const [now, setNow] = useState(Date.now() / 1000);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(id);
  }, []);

  // Use server clock offset to stay accurate.
  const offset = serverNow - Date.now() / 1000;
  const adjustedNow = now + offset;
  const remaining = Math.max(0, readyAt - adjustedNow);
  const total = Math.max(1, readyAt - placedAt);
  const progress = Math.min(1, 1 - remaining / total);

  return (
    <View style={[styles.wrap, { width: width + 8 }]} pointerEvents="box-none">
      <TouchableOpacity onPress={onSpeedup} activeOpacity={0.8} style={styles.pill} testID="construction-timer">
        <Ionicons name="time" size={10} color={COLORS.secondary} style={{ marginRight: 4 }} />
        <Text style={styles.text}>{formatRemaining(remaining)}</Text>
      </TouchableOpacity>
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
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.9)",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.secondary + "55",
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
