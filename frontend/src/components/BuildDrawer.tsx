import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, CATEGORY_COLORS } from "../theme";
import type { CatalogItem, PlayerState, Building } from "../api";

type Props = {
  mode: "build" | "view";
  tile: { x: number; y: number } | null;
  state: PlayerState;
  catalog: CatalogItem[];
  onPlace: (catalogId: string) => void;
  onSpeedup: (buildingId: string) => void;
  onDemolish: (buildingId: string) => void;
  onClose: () => void;
};

const CATEGORIES: { id: CatalogItem["category"]; label: string; icon: any }[] = [
  { id: "stage",   label: "Stages",  icon: "musical-notes" },
  { id: "vendor",  label: "Vendors", icon: "fast-food" },
  { id: "utility", label: "Utility", icon: "construct" },
  { id: "decor",   label: "Decor",   icon: "sparkles" },
];

export default function BuildDrawer({ mode, tile, state, catalog, onPlace, onSpeedup, onDemolish, onClose }: Props) {
  const [tab, setTab] = useState<CatalogItem["category"]>("stage");

  const building: Building | undefined = useMemo(() => {
    if (!tile) return undefined;
    return state.buildings.find((b) => b.x === tile.x && b.y === tile.y);
  }, [tile, state.buildings]);

  const catalogById = useMemo(
    () => new Map(catalog.map((c) => [c.id, c])),
    [catalog]
  );

  const items = useMemo(
    () => catalog.filter((c) => c.category === tab),
    [catalog, tab]
  );

  if (mode === "view" && building) {
    const item = catalogById.get(building.catalog_id);
    const cat = item ? CATEGORY_COLORS[item.category] : { highlight: COLORS.accent, base: COLORS.surface };
    const isBuilding = building.status === "building";
    return (
      <Modal animationType="slide" transparent visible onRequestClose={onClose}>
        <View style={styles.backdrop}>
          <TouchableOpacity style={{ flex: 1 }} onPress={onClose} testID="build-drawer-close-area" />
          <View style={styles.sheet} testID="build-drawer">
            <View style={styles.handle} />
            <View style={styles.header}>
              <Text style={styles.title}>BUILDING INFO</Text>
              <TouchableOpacity onPress={onClose} testID="build-drawer-close">
                <Ionicons name="close" size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            {item ? (
              <View style={styles.viewBody}>
                <View style={[styles.viewIconBox, { backgroundColor: cat.base }]}>
                  <Ionicons name={iconFor(item.category)} size={32} color={cat.highlight} />
                </View>
                <Text style={styles.viewName}>{item.name}</Text>
                <View style={[styles.statusPill, { borderColor: isBuilding ? COLORS.warning + "88" : COLORS.success + "88" }]}>
                  <Text style={[styles.statusText, { color: isBuilding ? COLORS.warning : COLORS.success }]}>
                    {isBuilding ? "⚙️ UNDER CONSTRUCTION" : "✓ READY"}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <InfoChip icon="flash" color={COLORS.secondary} label={`Score: ${item.score}`} />
                  <InfoChip icon="layers" color={COLORS.accent} label={`Tier ${item.tier}`} />
                </View>
                <View style={styles.viewActions}>
                  {isBuilding && (
                    <TouchableOpacity
                      style={[styles.actionBtn, { borderColor: COLORS.secondary + "66", backgroundColor: COLORS.secondary + "18" }]}
                      onPress={() => onSpeedup(building.id)}
                      testID="view-speedup-btn"
                    >
                      <Ionicons name="flash" size={16} color={COLORS.secondary} />
                      <Text style={[styles.actionBtnText, { color: COLORS.secondary }]}>SPEED UP</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[styles.actionBtn, { borderColor: COLORS.error + "66", backgroundColor: COLORS.error + "18" }]}
                    onPress={() => onDemolish(building.id)}
                    testID="view-demolish-btn"
                  >
                    <Ionicons name="trash" size={16} color={COLORS.error} />
                    <Text style={[styles.actionBtnText, { color: COLORS.error }]}>DEMOLISH</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <Text style={{ color: COLORS.textSecondary, padding: 20 }}>Unknown building</Text>
            )}
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal animationType="slide" transparent visible onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} testID="build-drawer-close-area" />
        <View style={styles.sheet} testID="build-drawer">
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>BUILD</Text>
            <TouchableOpacity onPress={onClose} testID="build-drawer-close">
              <Ionicons name="close" size={22} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>
          <View style={styles.tabs}>
            {CATEGORIES.map((c) => (
              <TouchableOpacity
                key={c.id}
                onPress={() => setTab(c.id)}
                style={[styles.tab, tab === c.id && { backgroundColor: COLORS.surfaceElev, borderColor: CATEGORY_COLORS[c.id].highlight }]}
                testID={`build-tab-${c.id}`}
              >
                <Ionicons name={c.icon} size={14} color={tab === c.id ? CATEGORY_COLORS[c.id].highlight : COLORS.textSecondary} />
                <Text style={[styles.tabLabel, tab === c.id && { color: COLORS.textPrimary }]}>
                  {c.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <ScrollView contentContainerStyle={styles.cardsWrap} showsVerticalScrollIndicator={false}>
            {items.map((item) => {
              const locked = item.phase > state.phase;
              const tooPoor = state.coins < item.cost;
              const atCap = state.build_slots_used >= state.build_cap;
              const disabled = locked || tooPoor || atCap;
              return (
                <TouchableOpacity
                  key={item.id}
                  disabled={disabled}
                  onPress={() => onPlace(item.id)}
                  style={[
                    styles.card,
                    { borderColor: CATEGORY_COLORS[item.category].highlight + "55" },
                    disabled && { opacity: 0.45 },
                  ]}
                  testID={`build-drawer-card-${item.id}`}
                >
                  <View style={[styles.iconBox, { backgroundColor: CATEGORY_COLORS[item.category].base }]}>
                    <Ionicons name={iconFor(item.category)} size={20} color={CATEGORY_COLORS[item.category].highlight} />
                  </View>
                  <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
                  <View style={styles.cardStatsRow}>
                    <View style={styles.stat}>
                      <Ionicons name="cash" size={11} color={COLORS.accent} />
                      <Text style={[styles.statText, tooPoor && !locked && { color: COLORS.error }]}>{item.cost}</Text>
                    </View>
                    <View style={styles.stat}>
                      <Ionicons name="time" size={11} color={COLORS.secondary} />
                      <Text style={styles.statText}>{formatTime(item.build_time)}</Text>
                    </View>
                  </View>
                  {locked && (
                    <View style={styles.lockBadge}>
                      <Ionicons name="lock-closed" size={10} color={COLORS.warning} />
                      <Text style={styles.lockTxt}>P{item.phase}</Text>
                    </View>
                  )}
                  {atCap && !locked && (
                    <View style={[styles.lockBadge, { backgroundColor: "rgba(255,0,85,0.7)" }]}>
                      <Text style={styles.lockTxt}>FULL</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function InfoChip({ icon, color, label }: { icon: any; color: string; label: string }) {
  return (
    <View style={[infoChipStyle.wrap, { borderColor: color + "44" }]}>
      <Ionicons name={icon} size={13} color={color} />
      <Text style={[infoChipStyle.text, { color }]}>{label}</Text>
    </View>
  );
}

const infoChipStyle = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  text: { fontWeight: "700", fontSize: 12 },
});

function iconFor(cat: CatalogItem["category"]) {
  switch (cat) {
    case "stage":   return "musical-notes" as const;
    case "vendor":  return "fast-food" as const;
    case "utility": return "construct" as const;
    case "decor":   return "sparkles" as const;
  }
}

function formatTime(s: number) {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}m ${r}s` : `${m}m`;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    maxHeight: "65%",
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)", marginBottom: 8 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  title: { color: COLORS.textPrimary, fontSize: 18, fontWeight: "800", letterSpacing: 2 },
  tabs: { flexDirection: "row", gap: 6, marginBottom: 12 },
  tab: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },
  tabLabel: { color: COLORS.textSecondary, fontWeight: "700", fontSize: 12 },
  cardsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingBottom: 24 },
  card: {
    width: "31%",
    backgroundColor: COLORS.surfaceElev,
    borderRadius: 16,
    padding: 10,
    borderWidth: 1,
    minHeight: 120,
  },
  iconBox: { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  cardName: { color: COLORS.textPrimary, fontSize: 12, fontWeight: "700", marginBottom: 6 },
  cardStatsRow: { gap: 4 },
  stat: { flexDirection: "row", alignItems: "center", gap: 4 },
  statText: { color: COLORS.textSecondary, fontWeight: "700", fontSize: 11 },
  lockBadge: {
    position: "absolute", top: 8, right: 8,
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "rgba(0,0,0,0.7)", borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2,
  },
  lockTxt: { color: COLORS.warning, fontSize: 9, fontWeight: "800" },
  viewBody: { alignItems: "center", gap: 12, paddingBottom: 20 },
  viewIconBox: {
    width: 64, height: 64, borderRadius: 16,
    alignItems: "center", justifyContent: "center",
  },
  viewName: { color: COLORS.textPrimary, fontSize: 20, fontWeight: "800" },
  statusPill: {
    borderWidth: 1, borderRadius: 999,
    paddingHorizontal: 14, paddingVertical: 5,
  },
  statusText: { fontWeight: "800", fontSize: 11, letterSpacing: 1 },
  infoRow: { flexDirection: "row", gap: 10 },
  viewActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  actionBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  actionBtnText: { fontWeight: "800", fontSize: 13 },
});
