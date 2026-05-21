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
import type { CatalogItem } from "../api";

type Props = {
  visible: boolean;
  onClose: () => void;
  catalog: CatalogItem[];
  phase: number;
  coins: number;
  onPick: (item: CatalogItem) => void;
};

const CATEGORIES: { id: CatalogItem["category"]; label: string; icon: any }[] = [
  { id: "stage",   label: "Stages",  icon: "musical-notes" },
  { id: "vendor",  label: "Vendors", icon: "fast-food" },
  { id: "utility", label: "Utility", icon: "construct" },
  { id: "decor",   label: "Decor",   icon: "sparkles" },
];

export default function BuildDrawer({ visible, onClose, catalog, phase, coins, onPick }: Props) {
  const [tab, setTab] = useState<CatalogItem["category"]>("stage");
  const items = useMemo(() => catalog.filter((c) => c.category === tab), [catalog, tab]);

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
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
              const locked = item.phase > phase;
              const tooPoor = coins < item.cost;
              const disabled = locked || tooPoor;
              return (
                <TouchableOpacity
                  key={item.id}
                  disabled={disabled}
                  onPress={() => onPick(item)}
                  style={[
                    styles.card,
                    { borderColor: CATEGORY_COLORS[item.category].highlight + "55" },
                    disabled && { opacity: 0.45 },
                  ]}
                  testID={`build-drawer-card-${item.id}`}
                >
                  <View style={[styles.iconBox, { backgroundColor: CATEGORY_COLORS[item.category].base }]}>
                    <Ionicons
                      name={iconFor(item.category)}
                      size={20}
                      color={CATEGORY_COLORS[item.category].highlight}
                    />
                  </View>
                  <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
                  <View style={styles.cardStatsRow}>
                    <View style={styles.stat}>
                      <Ionicons name="cash" size={11} color={COLORS.accent} />
                      <Text style={styles.statText}>{item.cost}</Text>
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
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

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
    maxHeight: "55%",
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
    minHeight: 130,
  },
  iconBox: { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  cardName: { color: COLORS.textPrimary, fontSize: 12, fontWeight: "700", marginBottom: 6 },
  cardStatsRow: { gap: 4 },
  stat: { flexDirection: "row", alignItems: "center", gap: 4 },
  statText: { color: COLORS.textSecondary, fontWeight: "700", fontSize: 11 },
  lockBadge: {
    position: "absolute", top: 8, right: 8,
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2,
  },
  lockTxt: { color: COLORS.warning, fontSize: 9, fontWeight: "800" },
});
