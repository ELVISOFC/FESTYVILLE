import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Animated,
  Easing,
  Dimensions,
} from "react-native";
import Svg, { Polygon, Circle, G } from "react-native-svg";
import { COLORS, CATEGORY_COLORS } from "../theme";
import { TILE_W, TILE_H, gridToScreen } from "./IsometricGrid";
import type { Building, CatalogItem } from "../api";
import type { ScoreBreakdown } from "../lib/scoring";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Props = {
  visible: boolean;
  gridSize: number;
  buildings: Building[];
  catalog: CatalogItem[];
  /** Live breakdown from computeScore() — controls agent behaviour. */
  scoreBreakdown: ScoreBreakdown;
  onComplete: () => void;
  duration?: number;
};

const AGENT_COUNT = 48;

// Agent colour palettes keyed by stage quality
const AGENT_COLORS_GREEN  = ["#00FF66", "#00FF88", "#33FFAA", "#00FFAA", "#22FF77", "#44FF88"];
const AGENT_COLORS_AMBER  = ["#FFD700", "#FFAA00", "#FF9900", "#FFB347", "#FFC000", "#FFCC44"];
const AGENT_COLORS_MIXED  = ["#FF0055", "#00FFFF", "#FFD700", "#00FF66", "#FF9900", "#FF66CC"];

type Waypoint = { x: number; y: number };
type Agent = {
  id: number;
  color: string;
  path: Waypoint[];
  startDelay: number;
  duration: number;
};

// ---------------------------------------------------------------------------
// Grade helper (mirrors planning.tsx)
// ---------------------------------------------------------------------------
function gradeFor(n: number): { letter: string; color: string } {
  if (n >= 90) return { letter: "S", color: "#00FFFF" };
  if (n >= 75) return { letter: "A", color: "#00FF66" };
  if (n >= 60) return { letter: "B", color: "#AAFF00" };
  if (n >= 45) return { letter: "C", color: "#FFD700" };
  if (n >= 30) return { letter: "D", color: "#FF9900" };
  return { letter: "F", color: "#FF4455" };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SimulationOverlay({
  visible,
  gridSize,
  buildings,
  catalog,
  scoreBreakdown,
  onComplete,
  duration = 5500,
}: Props) {
  const fade       = useRef(new Animated.Value(0)).current;
  const titleFade  = useRef(new Animated.Value(0)).current;
  const flash      = useRef(new Animated.Value(0)).current;
  const scoreBarAnim = useRef(new Animated.Value(0)).current; // 0 → 1 over duration
  const completed  = useRef(false);

  // Displayed count-up number (driven by scoreBarAnim listener)
  const [displayedScore, setDisplayedScore] = useState(0);

  // Derive raw (0-100) dimension scores from weighted breakdown
  // stage_score is weighted by 0.30, crowd_flow by 0.20
  const rawStage = scoreBreakdown.stage_score / 0.30; // 0–100
  const rawCrowd = scoreBreakdown.crowd_flow  / 0.20; // 0–100
  const composite = scoreBreakdown.composite;

  // ── Pre-compute agent paths ─────────────────────────────────────────────
  const { agents, stagePulseAnims, worldWidth, worldHeight } = useMemo(() => {
    const w = gridSize * TILE_W;
    const h = (gridSize + 1) * TILE_H + 80;
    const ready = buildings.filter((b) => b.status === "ready");
    const stageBuildings = ready.filter((b) => {
      const item = catalog.find((c) => c.id === b.catalog_id);
      return item?.category === "stage";
    });
    const allTargets = ready.length > 0 ? ready : [];

    const tileCenter = (gx: number, gy: number) => {
      const { sx, sy } = gridToScreen(gx, gy, gridSize);
      return { x: sx + TILE_W / 2, y: sy + TILE_H / 2 };
    };

    const spawnPoint = () => {
      const edge = Math.floor(Math.random() * 4);
      const t = Math.random() * gridSize;
      if (edge === 0) return tileCenter(t, -0.5);
      if (edge === 1) return tileCenter(gridSize + 0.5, t);
      if (edge === 2) return tileCenter(t, gridSize + 0.5);
      return tileCenter(-0.5, t);
    };

    // Colour palette: green at high stage quality, amber at low, mixed in between
    const agentColors =
      rawStage > 60 ? AGENT_COLORS_GREEN :
      rawStage < 40 ? AGENT_COLORS_AMBER :
      AGENT_COLORS_MIXED;

    // Stage attraction probability: 35 %→92 % as rawStage 0→100
    const stageAttractionP = Math.min(0.92, 0.35 + (rawStage / 100) * 0.57);

    // Jitter radius around target: tight at high rawStage (crowd clusters),
    // scattered at low (crowd wanders past stage without stopping)
    const jitterRadius = TILE_W * (0.25 + (1 - Math.min(rawStage, 100) / 100) * 0.65);

    // Crowd-leave probability: when raw crowd_flow < 30 some agents exit early
    const leaveP = rawCrowd < 30 ? 0.35 : 0;

    const list: Agent[] = [];
    for (let i = 0; i < AGENT_COUNT; i++) {
      const color = agentColors[i % agentColors.length];

      // "Crowd leaves" agent: starts at a building, exits to the edge
      if (Math.random() < leaveP && allTargets.length > 0) {
        const b = allTargets[Math.floor(Math.random() * allTargets.length)];
        const buildingPos = tileCenter(b.x, b.y);
        const exit = spawnPoint();
        list.push({
          id: i, color,
          path: [buildingPos, exit],
          startDelay: (i / AGENT_COUNT) * (duration * 0.35),
          duration: duration * 0.55,
        });
        continue;
      }

      // Normal agent: spawns at edge, walks toward stage / building
      const start = spawnPoint();
      let target: Waypoint;
      let target2: Waypoint | null = null;

      const r = Math.random();
      if (stageBuildings.length > 0 && r < stageAttractionP) {
        const b = stageBuildings[Math.floor(Math.random() * stageBuildings.length)];
        target = tileCenter(b.x, b.y);
        // Second hop to a vendor/utility for queue-like flow
        if (allTargets.length > 1) {
          const other = allTargets[Math.floor(Math.random() * allTargets.length)];
          target2 = tileCenter(other.x, other.y);
        }
      } else if (allTargets.length > 0) {
        const b = allTargets[Math.floor(Math.random() * allTargets.length)];
        target = tileCenter(b.x, b.y);
      } else {
        target = tileCenter(gridSize / 2 - 0.5, gridSize / 2 - 0.5);
      }

      // Jitter: smaller radius = tighter cluster at high stage quality
      const jitter = (n: number) => n + (Math.random() - 0.5) * jitterRadius * 2;
      target = { x: jitter(target.x), y: jitter(target.y) };
      if (target2) target2 = { x: jitter(target2.x), y: jitter(target2.y) };

      list.push({
        id: i, color,
        path: target2 ? [start, target, target2] : [start, target],
        startDelay: (i / AGENT_COUNT) * (duration * 0.45),
        duration: duration * 0.65,
      });
    }

    const stagePulse = stageBuildings.map(() => new Animated.Value(0));
    return { agents: list, stagePulseAnims: stagePulse, worldWidth: w, worldHeight: h };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, gridSize, buildings, catalog, duration, rawStage, rawCrowd]);

  const animValues = useRef<Animated.Value[]>([]).current;

  useEffect(() => {
    if (!visible) {
      completed.current = false;
      setDisplayedScore(0);
      return;
    }
    fade.setValue(0);
    titleFade.setValue(0);
    flash.setValue(0);
    scoreBarAnim.setValue(0);
    setDisplayedScore(0);

    // Per-agent progress values
    animValues.length = 0;
    agents.forEach(() => animValues.push(new Animated.Value(0)));

    // Overlay fade + title sequence
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 320, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(120),
        Animated.timing(titleFade, { toValue: 1, duration: 380, useNativeDriver: true }),
        Animated.delay(900),
        Animated.timing(titleFade, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]),
    ]).start();

    // Live score bar — useNativeDriver:false required for width layout
    const barAnim = Animated.timing(scoreBarAnim, {
      toValue: 1,
      duration: duration - 400,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    });
    const listenerId = scoreBarAnim.addListener(({ value }) => {
      setDisplayedScore(Math.round(value * composite));
    });
    barAnim.start();

    // Crowd movement
    agents.forEach((a, i) => {
      Animated.sequence([
        Animated.delay(a.startDelay),
        Animated.timing(animValues[i], {
          toValue: 1,
          duration: a.duration,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    });

    // Stage spotlight pulses
    stagePulseAnims.forEach((p) => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(p, { toValue: 1, duration: 700, useNativeDriver: true }),
          Animated.timing(p, { toValue: 0.3, duration: 700, useNativeDriver: true }),
        ])
      ).start();
    });

    // End flash + complete
    const timer = setTimeout(() => {
      Animated.sequence([
        Animated.timing(flash, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(flash, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start(() => {
        if (!completed.current) {
          completed.current = true;
          onComplete();
        }
      });
    }, duration);

    return () => {
      clearTimeout(timer);
      scoreBarAnim.removeListener(listenerId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;

  // Stage spotlight beams
  const stageBeams = buildings
    .map((b) => {
      const item = catalog.find((c) => c.id === b.catalog_id);
      if (!item || item.category !== "stage" || b.status !== "ready") return null;
      const { sx, sy } = gridToScreen(b.x, b.y, gridSize);
      return {
        id: b.id,
        cx: sx + TILE_W / 2,
        cy: sy + TILE_H / 2,
        color: CATEGORY_COLORS.stage.highlight,
      };
    })
    .filter(Boolean) as { id: string; cx: number; cy: number; color: string }[];

  const screen = Dimensions.get("window");
  const worldOriginX = (screen.width  - worldWidth)  / 2;
  const worldOriginY = (screen.height - worldHeight) / 2;

  // Score bar fill percentage (0 → composite/110)
  const maxComposite = 110; // theoretical max with genre bonus
  const targetFillPct = Math.min(100, (composite / maxComposite) * 100);
  const barWidth = scoreBarAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: ["0%", `${targetFillPct}%`],
  });
  const grade = gradeFor(composite);

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <Animated.View
        style={[styles.overlay, { opacity: fade }]}
        testID="simulation-overlay"
      >
        {/* ── World ── */}
        <View
          style={{
            position: "absolute",
            left: worldOriginX,
            top: worldOriginY,
            width: worldWidth,
            height: worldHeight,
          }}
        >
          {/* Isometric grid + buildings */}
          <Svg width={worldWidth} height={worldHeight}>
            <G>
              {Array.from({ length: gridSize }).map((_, y) =>
                Array.from({ length: gridSize }).map((__, x) => {
                  const { sx, sy } = gridToScreen(x, y, gridSize);
                  const cx = sx + TILE_W / 2;
                  const cy = sy + TILE_H / 2;
                  const pts = `${cx},${sy} ${sx + TILE_W},${cy} ${cx},${sy + TILE_H} ${sx},${cy}`;
                  return (
                    <Polygon
                      key={`bg-${x}-${y}`}
                      points={pts}
                      fill="rgba(11,46,29,0.45)"
                      stroke="rgba(0,255,255,0.06)"
                      strokeWidth={0.5}
                    />
                  );
                })
              )}
              {buildings.map((b) => {
                const item = catalog.find((c) => c.id === b.catalog_id);
                if (!item) return null;
                const { sx, sy } = gridToScreen(b.x, b.y, gridSize);
                const cx = sx + TILE_W / 2;
                const cy = sy + TILE_H / 2;
                const cat = CATEGORY_COLORS[item.category];
                return (
                  <Circle
                    key={`bld-${b.id}`}
                    cx={cx} cy={cy}
                    r={6 + item.tier * 1.5}
                    fill={b.status === "ready" ? cat.highlight : "#444"}
                    opacity={0.85}
                  />
                );
              })}
            </G>
          </Svg>

          {/* Stage spotlight beams */}
          {stageBeams.map((s, idx) => {
            const pulse = stagePulseAnims[idx] || new Animated.Value(0);
            return (
              <Animated.View
                key={s.id}
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: s.cx - 12, top: s.cy - 200,
                  width: 24, height: 200,
                  opacity: pulse,
                  backgroundColor: "transparent",
                }}
              >
                <View
                  style={{
                    flex: 1, borderRadius: 12,
                    backgroundColor: s.color + "44",
                    borderLeftWidth: 1, borderRightWidth: 1,
                    borderColor: s.color + "AA",
                  }}
                />
              </Animated.View>
            );
          })}

          {/* Crowd agents */}
          {agents.map((a, i) => {
            const v = animValues[i] || new Animated.Value(0);
            const ranges = a.path.map((_, idx) => idx / Math.max(1, a.path.length - 1));
            const tx = v.interpolate({ inputRange: ranges, outputRange: a.path.map((p) => p.x) });
            const ty = v.interpolate({ inputRange: ranges, outputRange: a.path.map((p) => p.y) });
            const scale = v.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 1, 1] });
            return (
              <Animated.View
                key={`agent-${a.id}`}
                pointerEvents="none"
                style={{
                  position: "absolute", left: -4, top: -4,
                  transform: [{ translateX: tx }, { translateY: ty }, { scale }],
                }}
              >
                <View
                  style={{
                    width: 8, height: 8, borderRadius: 4,
                    backgroundColor: a.color,
                    shadowColor: a.color, shadowOpacity: 0.9, shadowRadius: 4,
                  }}
                />
              </Animated.View>
            );
          })}
        </View>

        {/* ── Title ── */}
        <Animated.View style={[styles.titleWrap, { opacity: titleFade }]} pointerEvents="none">
          <Text style={styles.titleSub}>THE GATES OPEN</Text>
          <Text style={styles.titleMain}>{getRandomChant()}</Text>
        </Animated.View>

        {/* ── Live score bar ── */}
        <View style={styles.footerWrap} pointerEvents="none">
          <Text style={styles.footerText}>
            SIMULATING CROWD FLOW · STAGE RESPONSE · VENDOR FLOW
          </Text>

          {/* Score bar + count */}
          <View style={styles.scoreRow}>
            <View style={styles.scoringBar}>
              <Animated.View
                style={[
                  styles.scoringFill,
                  { width: barWidth, backgroundColor: grade.color },
                ]}
              />
            </View>
            <View style={[styles.scoreNumBox, { borderColor: grade.color + "55" }]}>
              <Text style={[styles.scoreNum, { color: grade.color }]}>
                {displayedScore}
              </Text>
            </View>
            <View style={[styles.gradePill, { borderColor: grade.color + "66", backgroundColor: grade.color + "18" }]}>
              <Text style={[styles.gradeLetter, { color: grade.color }]}>
                {grade.letter}
              </Text>
            </View>
          </View>

          {/* Dimension labels */}
          <View style={styles.dimRow}>
            {[
              { label: "Stage",   val: scoreBreakdown.stage_score,     max: 30, color: "#FF0055" },
              { label: "Crowd",   val: scoreBreakdown.crowd_flow,       max: 20, color: "#00FFFF" },
              { label: "Vendor",  val: scoreBreakdown.vendor_coverage,  max: 20, color: "#FF9900" },
              { label: "Utility", val: scoreBreakdown.utility_coverage, max: 15, color: "#00FF66" },
              { label: "Decor",   val: scoreBreakdown.aesthetic,        max: 15, color: "#FFD700" },
            ].map((d) => (
              <View key={d.label} style={styles.dimCell}>
                <View style={styles.dimTrack}>
                  <View
                    style={[
                      styles.dimFill,
                      {
                        width: `${Math.round(Math.min(1, d.val / d.max) * 100)}%` as any,
                        backgroundColor: d.color,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.dimLabel, { color: d.color }]}>{d.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── End flash ── */}
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFillObject, { backgroundColor: "#fff", opacity: flash }]}
        />
      </Animated.View>
    </Modal>
  );
}

const CHANTS = [
  "LIGHTS UP!",
  "FESTIVAL IS LIVE",
  "HEAR THE CROWD",
  "STAGES ROLL",
  "ENCORE INCOMING",
];
function getRandomChant() {
  return CHANTS[Math.floor(Math.random() * CHANTS.length)];
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(5,6,12,0.92)",
    justifyContent: "center",
    alignItems: "center",
  },
  titleWrap: {
    position: "absolute",
    top: "12%",
    alignItems: "center",
  },
  titleSub: {
    color: COLORS.secondary,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 4,
    marginBottom: 4,
  },
  titleMain: {
    color: COLORS.textPrimary,
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: 2,
    textShadowColor: COLORS.primary,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
  },
  footerWrap: {
    position: "absolute",
    bottom: "6%",
    alignSelf: "center",
    alignItems: "center",
    width: "80%",
  },
  footerText: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2,
    marginBottom: 10,
    textAlign: "center",
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    width: "100%",
    marginBottom: 10,
  },
  scoringBar: {
    flex: 1,
    height: 6,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 3,
    overflow: "hidden",
  },
  scoringFill: {
    height: 6,
    borderRadius: 3,
    minWidth: 4,
  },
  scoreNumBox: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderRadius: 6,
    minWidth: 36,
    alignItems: "center",
  },
  scoreNum: {
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  gradePill: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  gradeLetter: {
    fontSize: 12,
    fontWeight: "900",
  },
  dimRow: {
    flexDirection: "row",
    gap: 6,
    width: "100%",
  },
  dimCell: {
    flex: 1,
    gap: 3,
    alignItems: "center",
  },
  dimTrack: {
    width: "100%",
    height: 3,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 2,
    overflow: "hidden",
  },
  dimFill: {
    height: 3,
    borderRadius: 2,
    minWidth: 2,
  },
  dimLabel: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
});
