import React, { useEffect, useRef } from "react";
import { View, Text, Animated, StyleSheet } from "react-native";
import type { ViewStyle } from "react-native";
import { COLORS } from "../theme";

export type FloatingRewardEntry = {
  id: string;
  amount: number;
  kind: "coins" | "xp";
  sign: "+" | "-";
};

type Props = {
  rewards: FloatingRewardEntry[];
  onDone: (id: string) => void;
  style?: ViewStyle;
};

function FloatingRewardItem({
  entry,
  onDone,
}: {
  entry: FloatingRewardEntry;
  onDone: (id: string) => void;
}) {
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.parallel([
      Animated.timing(translateY, {
        toValue: -44,
        duration: 900,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(350),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 550,
          useNativeDriver: true,
        }),
      ]),
    ]);
    anim.start(() => onDone(entry.id));
    return () => anim.stop();
  }, []);

  const isNegative = entry.sign === "-";
  const color = isNegative
    ? COLORS.error
    : entry.kind === "coins"
    ? COLORS.accent
    : COLORS.secondary;

  const label =
    entry.kind === "coins"
      ? `${entry.sign}${entry.amount}`
      : `${entry.sign}${entry.amount} XP`;

  return (
    <Animated.View
      style={[styles.item, { transform: [{ translateY }], opacity }]}
      pointerEvents="none"
    >
      <Text style={[styles.text, { color }]}>{label}</Text>
    </Animated.View>
  );
}

export default function FloatingReward({ rewards, onDone, style }: Props) {
  if (rewards.length === 0) return null;
  return (
    <View style={[styles.container, style]} pointerEvents="none">
      {rewards.map((r) => (
        <FloatingRewardItem key={r.id} entry={r} onDone={onDone} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    alignItems: "flex-end",
  },
  item: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "rgba(0,0,0,0.65)",
    marginBottom: 4,
  },
  text: {
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
});
