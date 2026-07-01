import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { COLORS } from "../theme";

type SpecOption = {
  id: string;
  emoji: string;
  name: string;
  color: string;
  trade: string;
  sig: string;
  exclusive: string;
};

const SPEC_OPTIONS: SpecOption[] = [
  {
    id: "producer",
    emoji: "🎛",
    name: "PRODUCER",
    color: "#FF0055",
    trade: "Stage scores ×1.25 — vendor coverage slightly reduced",
    sig: "+10 bonus when you have 2+ stages on the grid",
    exclusive: "Backstage Hub (stage tier 3)",
  },
  {
    id: "promoter",
    emoji: "📣",
    name: "PROMOTER",
    color: "#FF9900",
    trade: "Vendor coverage ×1.25 — crowd flow +10 every run",
    sig: "+10 bonus when you have 3+ vendors on the grid",
    exclusive: "Promo Truck (vendor tier 2)",
  },
  {
    id: "operator",
    emoji: "⚙️",
    name: "OPERATOR",
    color: "#00FFFF",
    trade: "Utility coverage ×2.0 — construction penalties halved",
    sig: "+10 bonus when you have 2+ utilities on the grid",
    exclusive: "Solar Grid (utility tier 3)",
  },
  {
    id: "curator",
    emoji: "🎨",
    name: "CURATOR",
    color: "#FFD700",
    trade: "Aesthetic score ×2.0 — art pieces hit harder",
    sig: "+10 bonus when you have 3+ decor items on the grid",
    exclusive: "Sculpture Garden (decor tier 4)",
  },
];

type Props = {
  onPickSpec: (path: string) => void;
  onClose: () => void;
};

export default function SpecPickerModal({ onPickSpec, onClose }: Props) {
  const [selected, setSelected] = useState<string | null>(null);

  const confirm = () => {
    if (selected) onPickSpec(selected);
  };

  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card} testID="spec-picker-modal">
          <Text style={styles.eyebrow}>ONE-TIME CHOICE</Text>
          <Text style={styles.title}>Choose Your Path</Text>
          <Text style={styles.subtitle}>
            This permanently shapes how your festival scores. Pick wisely — you
            can't change it later.
          </Text>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.options}
            showsVerticalScrollIndicator={false}
          >
            {SPEC_OPTIONS.map((opt) => {
              const active = selected === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  onPress={() => setSelected(opt.id)}
                  style={[
                    styles.optionCard,
                    { borderColor: active ? opt.color : "rgba(255,255,255,0.1)" },
                    active && { backgroundColor: opt.color + "18" },
                  ]}
                  testID={`spec-option-${opt.id}`}
                >
                  <View style={styles.optionHeader}>
                    <Text style={styles.optionEmoji}>{opt.emoji}</Text>
                    <Text style={[styles.optionName, { color: opt.color }]}>
                      {opt.name}
                    </Text>
                    {active && (
                      <View style={[styles.checkDot, { backgroundColor: opt.color }]} />
                    )}
                  </View>
                  <Text style={styles.optionTrade}>{opt.trade}</Text>
                  <Text style={[styles.optionSig, { color: opt.color + "CC" }]}>
                    ⚡ {opt.sig}
                  </Text>
                  <View style={styles.exclusiveRow}>
                    <Text style={styles.exclusiveLabel}>PATH EXCLUSIVE  </Text>
                    <Text style={[styles.exclusiveValue, { color: opt.color }]}>
                      {opt.exclusive}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity
              onPress={onClose}
              style={styles.skipBtn}
              testID="spec-picker-skip"
            >
              <Text style={styles.skipText}>Later</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={confirm}
              disabled={!selected}
              style={[styles.confirmBtn, !selected && { opacity: 0.4 }]}
              testID="spec-picker-confirm"
            >
              <Text style={styles.confirmText}>CONFIRM PATH</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  card: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    maxHeight: "90%",
  },
  eyebrow: {
    color: COLORS.textSecondary,
    fontWeight: "800",
    fontSize: 10,
    letterSpacing: 3,
    textAlign: "center",
    marginBottom: 6,
  },
  title: {
    color: COLORS.textPrimary,
    fontWeight: "900",
    fontSize: 22,
    textAlign: "center",
    marginBottom: 6,
  },
  subtitle: {
    color: COLORS.textSecondary,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 17,
    marginBottom: 14,
  },
  scroll: { maxHeight: 360 },
  options: { gap: 10, paddingBottom: 4 },
  optionCard: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 14,
    gap: 5,
  },
  optionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  optionEmoji: { fontSize: 20 },
  optionName: { fontWeight: "900", fontSize: 14, letterSpacing: 1, flex: 1 },
  checkDot: { width: 10, height: 10, borderRadius: 5 },
  optionTrade: { color: COLORS.textPrimary, fontSize: 12, lineHeight: 17 },
  optionSig: { fontSize: 11, lineHeight: 16 },
  exclusiveRow: { flexDirection: "row", alignItems: "center", marginTop: 2 },
  exclusiveLabel: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  exclusiveValue: { fontSize: 11, fontWeight: "700" },
  actions: { flexDirection: "row", gap: 10, marginTop: 16 },
  skipBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  skipText: { color: COLORS.textSecondary, fontWeight: "800", fontSize: 12, letterSpacing: 1 },
  confirmBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
  },
  confirmText: { color: "#fff", fontWeight: "900", fontSize: 13, letterSpacing: 2 },
});
