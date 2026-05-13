import React, { useEffect, useMemo, useRef } from "react";
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

type Props = {
  visible: boolean;
  gridSize: number;
  buildings: Building[];
  catalog: CatalogItem[];
  onComplete: () => void;
  duration?: number;
};

const AGENT_COUNT = 48;
const AGENT_COLORS = ["#FF0055", "#00FFFF", "#FFD700", "#00FF66", "#FF9900", "#FF66CC"];

type Waypoint = { x: number; y: number };
type Agent = {
  id: number;
  color: string;
  path: Waypoint[];
  startDelay: number;
  duration: number;
};

export default function SimulationOverlay({
  visible,
  gridSize,
  buildings,
  catalog,
  onComplete,
  duration = 5500,
}: Props) {
  const fade = useRef(new Animated.Value(0)).current;
  const titleFade = useRef(new Animated.Value(0)).current;
  const flash = useRef(new Animated.Value(0)).current;
  const completed = useRef(false);

  // Pre-compute agent paths and stage positions when visible flips on.
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

    // Spawn around grid edges (random)
    const spawnPoint = () => {
      const edge = Math.floor(Math.random() * 4);
      const t = Math.random() * gridSize;
      if (edge === 0) return tileCenter(t, -0.5);
      if (edge === 1) return tileCenter(gridSize + 0.5, t);
      if (edge === 2) return tileCenter(t, gridSize + 0.5);
      return tileCenter(-0.5, t);
    };

    const list: Agent[] = [];
    for (let i = 0; i < AGENT_COUNT; i++) {
      const start = spawnPoint();
      // Pick a target: 70% stage if any, else any ready building, else center
      let target: Waypoint;
      let target2: Waypoint | null = null;
      const r = Math.random();
      if (stageBuildings.length > 0 && r < 0.7) {
        const b = stageBuildings[Math.floor(Math.random() * stageBuildings.length)];
        target = tileCenter(b.x, b.y);
        // second hop to a nearby vendor/utility for queue feeling
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
      // jitter target slightly so crowds spread around the building base
      const jitter = (n: number) => n + (Math.random() - 0.5) * (TILE_W * 0.7);
      target = { x: jitter(target.x), y: jitter(target.y) };
      if (target2) target2 = { x: jitter(target2.x), y: jitter(target2.y) };

      list.push({
        id: i,
        color: AGENT_COLORS[i % AGENT_COLORS.length],
        path: target2 ? [start, target, target2] : [start, target],
        startDelay: (i / AGENT_COUNT) * (duration * 0.45),
        duration: duration * 0.65,
      });
    }

    const stagePulse = stageBuildings.map(() => new Animated.Value(0));
    return { agents: list, stagePulseAnims: stagePulse, worldWidth: w, worldHeight: h };
  }, [visible, gridSize, buildings, catalog, duration]);

  const animValues = useRef<Animated.Value[]>([]).current;

  useEffect(() => {
    if (!visible) {
      completed.current = false;
      return;
    }
    fade.setValue(0);
    titleFade.setValue(0);
    flash.setValue(0);

    // Initialize per-agent progress values
    animValues.length = 0;
    agents.forEach(() => animValues.push(new Animated.Value(0)));

    // Sequence: fade overlay in, fade title in, animate agents, flash, complete.
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 320, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(120),
        Animated.timing(titleFade, { toValue: 1, duration: 380, useNativeDriver: true }),
        Animated.delay(900),
        Animated.timing(titleFade, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]),
    ]).start();

    // Crowd movement
    agents.forEach((a, i) => {
      const v = animValues[i];
      Animated.sequence([
        Animated.delay(a.startDelay),
        Animated.timing(v, {
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

    // End-of-sim flash + complete
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

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;

  // Stage spotlights: render a thin vertical beam above each ready stage.
  const stageBeams = buildings
    .map((b) => {
      const item = catalog.find((c) => c.id === b.catalog_id);
      if (!item || item.category !== "stage" || b.status !== "ready") return null;
      const { sx, sy } = gridToScreen(b.x, b.y, gridSize);
      const cx = sx + TILE_W / 2;
      const cy = sy + TILE_H / 2;
      return { id: b.id, cx, cy, color: CATEGORY_COLORS.stage.highlight };
    })
    .filter(Boolean) as { id: string; cx: number; cy: number; color: string }[];

  const screen = Dimensions.get("window");
  const worldOriginX = (screen.width - worldWidth) / 2;
  const worldOriginY = (screen.height - worldHeight) / 2;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <Animated.View
        style={[styles.overlay, { opacity: fade }]}
        testID="simulation-overlay"
      >
        <View
          style={{
            position: "absolute",
            left: worldOriginX,
            top: worldOriginY,
            width: worldWidth,
            height: worldHeight,
          }}
        >
          {/* Background: faint grid + buildings sketch via SVG */}
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
                    cx={cx}
                    cy={cy}
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
                  left: s.cx - 12,
                  top: s.cy - 200,
                  width: 24,
                  height: 200,
                  opacity: pulse,
                  backgroundColor: "transparent",
                }}
              >
                <View
                  style={{
                    flex: 1,
                    borderRadius: 12,
                    backgroundColor: s.color + "44",
                    borderLeftWidth: 1,
                    borderRightWidth: 1,
                    borderColor: s.color + "AA",
                  }}
                />
              </Animated.View>
            );
          })}

          {/* Crowd agents */}
          {agents.map((a, i) => {
            const v = animValues[i] || new Animated.Value(0);
            // Multi-segment interpolation: split [0..1] across path segments.
            const ranges = a.path.map((_, idx) => idx / (a.path.length - 1));
            const tx = v.interpolate({
              inputRange: ranges,
              outputRange: a.path.map((p) => p.x),
            });
            const ty = v.interpolate({
              inputRange: ranges,
              outputRange: a.path.map((p) => p.y),
            });
            const scale = v.interpolate({
              inputRange: [0, 0.1, 1],
              outputRange: [0, 1, 1],
            });
            return (
              <Animated.View
                key={`agent-${a.id}`}
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: -4,
                  top: -4,
                  transform: [{ translateX: tx }, { translateY: ty }, { scale }],
                }}
              >
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: a.color,
                    shadowColor: a.color,
                    shadowOpacity: 0.9,
                    shadowRadius: 4,
                  }}
                />
              </Animated.View>
            );
          })}
        </View>

        {/* Title */}
        <Animated.View style={[styles.titleWrap, { opacity: titleFade }]} pointerEvents="none">
          <Text style={styles.titleSub}>THE GATES OPEN</Text>
          <Text style={styles.titleMain}>{getRandomChant()}</Text>
        </Animated.View>

        {/* Bottom status */}
        <View style={styles.footerWrap} pointerEvents="none">
          <Text style={styles.footerText}>SIMULATING CROWD FLOW · STAGE RESPONSE · VENDOR FLOW</Text>
          <View style={styles.scoringBar}>
            <View style={styles.scoringFill} />
          </View>
        </View>

        {/* End flash */}
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: "#fff", opacity: flash },
          ]}
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
    bottom: "10%",
    alignSelf: "center",
    alignItems: "center",
  },
  footerText: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2,
    marginBottom: 8,
  },
  scoringBar: {
    width: 220,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 2,
    overflow: "hidden",
  },
  scoringFill: {
    width: "100%",
    height: 4,
    backgroundColor: COLORS.primary,
  },
});
