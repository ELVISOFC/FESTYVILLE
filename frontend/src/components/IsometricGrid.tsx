import React from "react";
import Svg, { Polygon, Line, Path, G } from "react-native-svg";
import { View, StyleSheet, Pressable } from "react-native";
import { COLORS } from "../theme";

export const TILE_W = 56;
export const TILE_H = 28;

export function gridToScreen(x: number, y: number, gridSize: number) {
  const originX = (gridSize - 1) * (TILE_W / 2);
  return {
    sx: originX + (x - y) * (TILE_W / 2),
    sy: (x + y) * (TILE_H / 2),
  };
}

type Props = {
  gridSize: number;
  selected?: { x: number; y: number } | null;
  onTilePress: (x: number, y: number) => void;
  occupiedSet: Set<string>;
};

export default function IsometricGrid({ gridSize, selected, onTilePress, occupiedSet }: Props) {
  const width = gridSize * TILE_W;
  const height = (gridSize + 1) * TILE_H;
  const tiles: React.ReactNode[] = [];
  const overlays: React.ReactNode[] = [];

  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const { sx, sy } = gridToScreen(x, y, gridSize);
      const cx = sx + TILE_W / 2;
      const cy = sy + TILE_H / 2;
      const pts = `${cx},${sy} ${sx + TILE_W},${cy} ${cx},${sy + TILE_H} ${sx},${cy}`;
      const isSel = selected && selected.x === x && selected.y === y;
      const isOcc = occupiedSet.has(`${x},${y}`);
      // Alternate base for subtle 8-bit checker
      const baseFill = (x + y) % 2 === 0 ? COLORS.grassBase : "#0E3826";
      const stroke = isSel ? COLORS.accent : COLORS.grassBorder;
      tiles.push(
        <Polygon
          key={`t-${x}-${y}`}
          points={pts}
          fill={baseFill}
          stroke={stroke}
          strokeWidth={isSel ? 2 : 1}
        />
      );
      if (isSel && !isOcc) {
        overlays.push(
          <Polygon key={`sel-${x}-${y}`} points={pts} fill="rgba(255,215,0,0.18)" />
        );
      }
    }
  }

  // Touch layer: render Pressables on top via absolute positioning.
  const touchTargets: React.ReactNode[] = [];
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const { sx, sy } = gridToScreen(x, y, gridSize);
      touchTargets.push(
        <Pressable
          key={`touch-${x}-${y}`}
          testID={`grid-tile-${x}-${y}`}
          onPress={() => onTilePress(x, y)}
          style={{
            position: "absolute",
            left: sx,
            top: sy,
            width: TILE_W,
            height: TILE_H,
          }}
        />
      );
    }
  }

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        <G>{tiles}</G>
        <G>{overlays}</G>
      </Svg>
      <View style={[StyleSheet.absoluteFill, { width, height }]}>{touchTargets}</View>
    </View>
  );
}
