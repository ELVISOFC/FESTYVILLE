import React from "react";
import Svg, { Polygon, Rect, G } from "react-native-svg";
import { View } from "react-native";
import { CATEGORY_COLORS } from "../theme";
import { TILE_W, TILE_H } from "./IsometricGrid";

type Props = {
  category: "stage" | "vendor" | "utility" | "decor";
  tier: number;
  ready: boolean;
};

// Pseudo-3D 8-bit prism: top diamond + left + right faces, height scales with tier.
export default function BuildingSprite({ category, tier, ready }: Props) {
  const cat = CATEGORY_COLORS[category];
  const baseHeight = 16 + tier * 8; // bigger for higher tier
  const w = TILE_W;
  const h = TILE_H;
  const topPts = `${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}`;
  const leftPts = `0,${h / 2} ${w / 2},${h} ${w / 2},${h + baseHeight} 0,${h / 2 + baseHeight}`;
  const rightPts = `${w / 2},${h} ${w},${h / 2} ${w},${h / 2 + baseHeight} ${w / 2},${h + baseHeight}`;

  const topFill = ready ? cat.highlight : "#3a3a48";
  const leftFill = ready ? cat.base : "#2a2a36";
  const rightFill = ready ? darken(cat.base) : "#1f1f2a";

  // Tier accents: pixel windows
  const windows: React.ReactNode[] = [];
  if (ready) {
    const rows = Math.min(3, tier);
    for (let r = 0; r < rows; r++) {
      const yOff = h + 6 + r * 7;
      if (yOff > h + baseHeight - 4) break;
      windows.push(
        <Rect key={`wl-${r}`} x={6} y={yOff} width={4} height={4} fill="#FFF7C2" opacity={0.85} />
      );
      windows.push(
        <Rect key={`wr-${r}`} x={w - 10} y={yOff} width={4} height={4} fill="#FFF7C2" opacity={0.85} />
      );
    }
  }

  return (
    <View style={{ width: w, height: h + baseHeight, position: "absolute" }} pointerEvents="none">
      <Svg width={w} height={h + baseHeight}>
        <G>
          <Polygon points={leftPts} fill={leftFill} stroke="#000" strokeWidth={1} />
          <Polygon points={rightPts} fill={rightFill} stroke="#000" strokeWidth={1} />
          <Polygon points={topPts} fill={topFill} stroke="#000" strokeWidth={1} />
          {windows}
        </G>
      </Svg>
    </View>
  );
}

function darken(hex: string) {
  // simple darken by 25%
  const h = hex.replace("#", "");
  const r = Math.max(0, parseInt(h.slice(0, 2), 16) - 50);
  const g = Math.max(0, parseInt(h.slice(2, 4), 16) - 50);
  const b = Math.max(0, parseInt(h.slice(4, 6), 16) - 50);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}
