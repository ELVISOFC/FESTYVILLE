import { Platform } from "react-native";

async function runHaptic(fn: () => Promise<void>): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await fn();
  } catch {}
}

export async function hapticLight(): Promise<void> {
  return runHaptic(async () => {
    const Haptics = await import("expo-haptics");
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  });
}

export async function hapticSuccess(): Promise<void> {
  return runHaptic(async () => {
    const Haptics = await import("expo-haptics");
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  });
}

export async function hapticWarning(): Promise<void> {
  return runHaptic(async () => {
    const Haptics = await import("expo-haptics");
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  });
}
