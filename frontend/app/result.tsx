import { useEffect, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Easing,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Svg, Rect, Circle } from "react-native-svg";
import { COLORS, GRADE_COLORS } from "../src/theme";
import { Ionicons } from "@expo/vector-icons";


// ---------------------------------------------------------------------------
// Confetti
// ---------------------------------------------------------------------------

const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const CATEGORY_COLORS = ["#FF0055", "#00FFFF", "#FF9900", "#00FF66", "#FFD700"];
const PIECE_COUNT = 14;

type CPiece = {
  x: Animated.Value;
  y: Animated.Value;
  opacity: Animated.Value;
  targetX: number;
  targetY: number;
  color: string;
  size: number;
  isRect: boolean;
};

function ConfettiBurst({ cx, cy }: { cx: number; cy: number }) {
  const allColors = [...Object.values(GRADE_COLORS), ...CATEGORY_COLORS];

  const pieces = useRef<CPiece[]>(
    Array.from({ length: PIECE_COUNT }, (_, i) => {
      const angle =
        (i / PIECE_COUNT) * Math.PI * 2 + (((i * 7919) % 100) / 100 - 0.5) * 0.45;
      const dist = 58 + ((i * 1301) % 70);
      return {
        x: new Animated.Value(cx),
        y: new Animated.Value(cy),
        opacity: new Animated.Value(1),
        targetX: cx + Math.cos(angle) * dist,
        targetY: cy + Math.sin(angle) * dist,
        color: allColors[i % allColors.length],
        size: 5 + (i % 5),
        isRect: i % 3 !== 0,
      };
    })
  ).current;

  useEffect(() => {
    const anims = pieces.map((p) =>
      Animated.parallel([
        Animated.timing(p.x, {
          toValue: p.targetX,
          duration: 1200,
          easing: Easing.out(Easing.quad),
          useNativeDriver: false,
        }),
        Animated.timing(p.y, {
          toValue: p.targetY,
          duration: 1200,
          easing: Easing.out(Easing.quad),
          useNativeDriver: false,
        }),
        Animated.sequence([
          Animated.delay(240),
          Animated.timing(p.opacity, {
            toValue: 0,
            duration: 860,
            useNativeDriver: false,
          }),
        ]),
      ])
    );
    Animated.parallel(anims).start();
  }, []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%">
        {pieces.map((p, i) =>
          p.isRect ? (
            <AnimatedRect
              key={i}
              x={p.x}
              y={p.y}
              width={p.size}
              height={p.size * 1.6}
              fill={p.color}
              opacity={p.opacity}
            />
          ) : (
            <AnimatedCircle
              key={i}
              cx={p.x}
              cy={p.y}
              r={p.size * 0.65}
              fill={p.color}
              opacity={p.opacity}
            />
          )
        )}
      </Svg>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Dims config
// ---------------------------------------------------------------------------

const DIMS: { key: string; label: string; color: string; max: number }[] = [
  { key: "stage_score",      label: "STAGE SCORE",      color: "#FF0055", max: 100 },
  { key: "crowd_flow",       label: "CROWD FLOW",       color: "#00FFFF", max: 100 },
  { key: "vendor_coverage",  label: "VENDOR COVERAGE",  color: "#FF9900", max: 100 },
  { key: "utility_coverage", label: "UTILITY COVERAGE", color: "#00FF66", max: 100 },
  { key: "aesthetic",        label: "AESTHETIC",        color: "#FFD700", max: 100 },
];

// Total stagger wall-clock: 100ms * (N-1) + 700ms per bar = 1100ms for 5 bars.
const STAGGER_TOTAL_MS = 100 * (DIMS.length - 1) + 700;

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function ResultScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const { grade, score, breakdown } = useLocalSearchParams<{
    grade: string;
    score: string;
    breakdown: string;
  }>();

  const composite = score ? parseInt(score, 10) : 0;
  const bd = breakdown ? JSON.parse(breakdown) : {};
  const gradeColor = GRADE_COLORS[grade ?? "F"] ?? COLORS.accent;

  const [displayedScore, setDisplayedScore] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);

  const barAnims = useRef(DIMS.map(() => new Animated.Value(0))).current;
  const gradeScale = useRef(new Animated.Value(0)).current;
  const scoreAnim = useRef(new Animated.Value(0)).current;
  const gradeCenterRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    barAnims.forEach((a) => a.setValue(0));
    gradeScale.setValue(0);
    scoreAnim.setValue(0);
    setDisplayedScore(0);

    const listenerId = scoreAnim.addListener(({ value }) => {
      setDisplayedScore(Math.round(value));
    });

    Animated.parallel([
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
      ),
      Animated.timing(scoreAnim, {
        toValue: composite,
        duration: STAGGER_TOTAL_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start(() => {
      Animated.spring(gradeScale, {
        toValue: 1,
        friction: 5,
        tension: 80,
        useNativeDriver: true,
      }).start(() => {
        if (grade === "S") setShowConfetti(true);
      });
    });

    return () => {
      scoreAnim.removeListener(listenerId);
    };
  }, []);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>FESTIVAL RESULTS</Text>

        <Animated.View
          onLayout={(e) => {
            const { y, width: w, height: h } = e.nativeEvent.layout;
            gradeCenterRef.current = {
              x: windowWidth / 2,
              y: insets.top + 20 + y + h / 2,
            };
          }}
          style={{ transform: [{ scale: gradeScale }], alignItems: "center", marginBottom: 16 }}
        >
          <Text
            style={[styles.grade, { color: gradeColor, textShadowColor: gradeColor }]}
            testID={`results-grade-${grade}`}
          >
            {grade ?? "F"}
          </Text>
          <Text style={styles.compositeNum}>{displayedScore}/100</Text>
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

          {(bd.adjacency_bonus ?? 0) > 0 && (
            <View style={styles.adjRow} testID="results-adjacency-bonus">
              <Ionicons name="git-network" size={13} color="#A78BFA" />
              <Text style={styles.adjLabel}>ADJACENCY BONUSES</Text>
              <Text style={styles.adjVal}>+{bd.adjacency_bonus}</Text>
            </View>
          )}
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

      {showConfetti && (
        <ConfettiBurst
          cx={gradeCenterRef.current.x}
          cy={gradeCenterRef.current.y}
        />
      )}
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
  adjRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  adjLabel: {
    flex: 1,
    color: "#A78BFA",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  adjVal: {
    color: "#A78BFA",
    fontSize: 13,
    fontWeight: "900",
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
