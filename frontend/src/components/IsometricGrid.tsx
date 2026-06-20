import React from "react";
import Svg, { Polygon, G } from "react-native-svg";
import { View, StyleSheet, Pressable } from "react-native";
import { COLORS } from "../theme";
import type { Building, CatalogItem } from "../api";
import BuildingSprite from "./BuildingSprite";
import ConstructionTimer from "./ConstructionTimer";

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
  buildings: Building[];
  catalog: CatalogItem[];
  serverNow?: number;
};

export default function IsometricGrid({ gridSize, selected, onTilePress, buildings, catalog, serverNow }: Props) {
  const width = gridSize * TILE_W;
  const height = (gridSize + 1) * TILE_H;

  const catalogById = new Map(catalog.map((c) => [c.id, c]));
  const buildingByTile = new Map(buildings.map((b) => [`${b.x},${b.y}`, b]));

  const tiles: React.ReactNode[] = [];
  const overlays: React.ReactNode[] = [];

  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const { sx, sy } = gridToScreen(x, y, gridSize);
      const cx = sx + TILE_W / 2;
      const cy = sy + TILE_H / 2;
      const pts = `${cx},${sy} ${sx + TILE_W},${cy} ${cx},${sy + TILE_H} ${sx},${cy}`;
      const isSel = selected && selected.x === x && selected.y === y;
      const isOcc = buildingByTile.has(`${x},${y}`);
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

  const buildingSprites: React.ReactNode[] = buildings
    .slice()
    .sort((a, b) => (a.x + a.y) - (b.x + b.y))
    .map((b) => {
      const item = catalogById.get(b.catalog_id);
      if (!item) return null;
      const { sx, sy } = gridToScreen(b.x, b.y, gridSize);
      const baseHeight = 16 + item.tier * 8;
      const spriteTop = sy - baseHeight;

      return (
        <View
          key={`sprite-${b.id}`}
          style={{
            position: "absolute",
            left: sx,
            top: spriteTop,
            width: TILE_W,
            height: TILE_H + baseHeight,
          }}
          pointerEvents="none"
        >
          <BuildingSprite
            category={item.category}
            tier={item.tier}
            ready={b.status === "ready"}
          />
          {b.status === "building" && (
            <View
              style={{
                position: "absolute",
                top: -24,
                left: TILE_W / 2 - 34,
              }}
            >
              <ConstructionTimer
                readyAt={b.ready_at}
                placedAt={b.placed_at}
                serverNow={serverNow ?? Date.now() / 1000}
                onSpeedup={() => {}}
                width={68}
              />
            </View>
          )}
        </View>
      );
    })
    .filter(Boolean);

  return (
    <View style={{ width, height: height + 80 }}>
      <Svg width={width} height={height + 80}>
        <G>{tiles}</G>
        <G>{overlays}</G>
      </Svg>
      <View style={[StyleSheet.absoluteFill, { width, height: height + 80 }]}>
        {buildingSprites}
        {touchTargets}
      </View>
    </View>
  );
}
