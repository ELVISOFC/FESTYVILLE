import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Easing,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS, GRADE_COLORS } from "../src/theme";
import { Ionicons } from "@expo/vector-icons";

const DIMS: { key: string; label: string; color: string; max: number }[] = [
  { key: "stage_score",      label: "STAGE SCORE",      color: "#FF0055", max: 100 },
  { key: "crowd_flow",       label: "CROWD FLOW",       color: "#00FFFF", max: 100 },
  { key: "vendor_coverage",  label: "VENDOR COVERAGE",  color: "#FF9900", max: 100 },
  { key: "utility_coverage", label: "UTILITY COVERAGE", color: "#00FF66", max: 100 },
  { key: "aesthetic",        label: "AESTHETIC",        color: "#FFD700", max: 100 },
];

export default function ResultScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { grade, score, breakdown } = useLocalSearchParams<{
    grade: string;
    score: string;
    breakdown: string;
  }>();

  const composite = score ? parseInt(score, 10) : 0;
  const bd = breakdown ? JSON.parse(breakdown) : {};
  const gradeColor = GRADE_COLORS[grade ?? "F"] ?? COLORS.accent;

  const barAnims = useRef(DIMS.map(() => new Animated.Value(0))).current;
  const gradeScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    barAnims.forEach((a) => a.setValue(0));
    gradeScale.setValue(0);

    Animated.stagger(
      100,
      DIMS.map((d, i) =>
        Animated.timing(barAnims[i], {
          toValue: bd[d.key] ?? 0,
          duration: 700,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        })
      )
    ).start(() => {
      Animated.spring(gradeScale, {
        toValue: 1,
        friction: 5,
        tension: 80,
        useNativeDriver: true,
      }).start();
    });
  }, []);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>FESTIVAL RESULTS</Text>

        <Animated.View style={{ transform: [{ scale: gradeScale }], alignItems: "center", marginBottom: 16 }}>
          <Text
            style={[styles.grade, { color: gradeColor, textShadowColor: gradeColor }]}
            testID={`results-grade-${grade}`}
          >
            {grade ?? "F"}
          </Text>
          <Text style={styles.compositeNum}>{composite}/100</Text>
        </Animated.View>

        <View style={styles.card} testID="simulation-results-modal">
          {DIMS.map((d, i) => {
            const val = bd[d.key] ?? 0;
            return (
              <View key={d.key} style={styles.dimRow} testID={`results-dim-${d.key}`}>
                <View style={styles.dimHeader}>
                  <Text style={styles.dimLabel}>{d.label}</Text>
                  <Text style={[styles.dimVal, { color: d.color }]}>{val}</Text>
                </View>
                <View style={styles.barOuter}>
                  <Animated.View
                    style={[
                      styles.barInner,
                      {
                        backgroundColor: d.color,
                        width: barAnims[i].interpolate({
                          inputRange: [0, d.max],
                          outputRange: ["0%", "100%"],
                          extrapolate: "clamp",
                        }),
                      },
                    ]}
                  />
                </View>
              </View>
            );
          })}
        </View>

        <TouchableOpacity
          style={[styles.cta, { borderColor: gradeColor + "66", shadowColor: gradeColor }]}
          onPress={() => router.replace("/")}
          testID="results-close"
        >
          <Ionicons name="arrow-forward" size={18} color="#fff" />
          <Text style={styles.ctaText}>CONTINUE</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#090A0F",
  },
  content: {
    alignItems: "center",
    padding: 20,
  },
  heading: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 4,
    marginBottom: 8,
    marginTop: 12,
  },
  grade: {
    fontSize: 110,
    fontWeight: "900",
    letterSpacing: -4,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
  },
  compositeNum: {
    color: COLORS.textSecondary,
    fontWeight: "700",
    fontSize: 14,
    letterSpacing: 1,
    marginBottom: 4,
  },
  card: {
    width: "100%",
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 18,
    gap: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  dimRow: { gap: 4 },
  dimHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  dimLabel: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  dimVal: {
    fontSize: 12,
    fontWeight: "800",
  },
  barOuter: {
    height: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 4,
    overflow: "hidden",
  },
  barInner: {
    height: 8,
    borderRadius: 4,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 999,
    borderWidth: 1,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  ctaText: {
    color: "#fff",
    fontWeight: "900",
    letterSpacing: 3,
    fontSize: 14,
  },
});
