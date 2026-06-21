import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Animated,
  Easing,
  Dimensions,
} from "react-native";
import { COLORS } from "../theme";

type Props = {
  visible: boolean;
  day: number;
  onComplete: () => void;
};

export default function DayTransition({ visible, day, onComplete }: Props) {
  const fade = useRef(new Animated.Value(0)).current;
  const sweepX = useRef(new Animated.Value(0)).current;
  const textFade = useRef(new Animated.Value(0)).current;
  const completed = useRef(false);

  useEffect(() => {
    if (!visible) {
      completed.current = false;
      return;
    }

    fade.setValue(0);
    sweepX.setValue(0);
    textFade.setValue(0);

    // Phase 1 (parallel, ~370ms): fade in overlay + sweep bar + text in
    // Phase 2: hold 110ms
    // Phase 3 (parallel, ~240ms): fade out overlay + text
    // Total ≈ 720ms
    Animated.sequence([
      Animated.parallel([
        Animated.timing(fade, {
          toValue: 1,
          duration: 140,
          useNativeDriver: true,
        }),
        Animated.timing(sweepX, {
          toValue: 1,
          duration: 370,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(80),
          Animated.timing(textFade, {
            toValue: 1,
            duration: 180,
            useNativeDriver: true,
          }),
        ]),
      ]),
      Animated.delay(110),
      Animated.parallel([
        Animated.timing(fade, {
          toValue: 0,
          duration: 240,
          useNativeDriver: true,
        }),
        Animated.timing(textFade, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      if (!completed.current) {
        completed.current = true;
        onComplete();
      }
    });
  }, [visible]);

  if (!visible) return null;

  const { width } = Dimensions.get("window");
  const nextDay = day + 1;
  const subtitle = nextDay >= 7 ? "FESTIVAL DAY" : "ADVANCING";

  const sweepTranslate = sweepX.interpolate({
    inputRange: [0, 1],
    outputRange: [-width, width],
  });

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <Animated.View style={[styles.overlay, { opacity: fade }]}>
        {/* Warm accent wash tint */}
        <View style={styles.wash} pointerEvents="none" />

        {/* Luminous sweep bar */}
        <Animated.View
          pointerEvents="none"
          style={[styles.sweepBar, { transform: [{ translateX: sweepTranslate }] }]}
        />

        {/* Day label */}
        <Animated.View
          pointerEvents="none"
          style={[styles.labelWrap, { opacity: textFade }]}
        >
          <Text style={styles.subtitle}>{subtitle}</Text>
          <Text style={styles.dayNum}>DAY {nextDay}</Text>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(10,10,20,0.90)",
    justifyContent: "center",
    alignItems: "center",
  },
  wash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.accent + "18",
  },
  sweepBar: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 5,
    backgroundColor: COLORS.accent,
    shadowColor: COLORS.accent,
    shadowOpacity: 0.95,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  labelWrap: {
    alignItems: "center",
  },
  subtitle: {
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 4,
    marginBottom: 6,
  },
  dayNum: {
    color: COLORS.textPrimary,
    fontSize: 52,
    fontWeight: "900",
    letterSpacing: 2,
    textShadowColor: COLORS.accent,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 22,
  },
});
