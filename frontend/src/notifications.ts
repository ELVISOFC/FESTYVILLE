// Cross-platform local notification helper.
// Native: uses expo-notifications. Web: uses browser Notification API + setTimeout.
import { Platform } from "react-native";

let permissionState: "unknown" | "granted" | "denied" = "unknown";
const webScheduled: Record<string, number> = {};

async function ensureNative() {
  // Lazy-load only on native to avoid web bundling pulling extra deps.
  return await import("expo-notifications");
}

export async function ensurePermission(): Promise<boolean> {
  if (permissionState === "granted") return true;
  if (Platform.OS === "web") {
    if (typeof window === "undefined" || !("Notification" in window)) {
      permissionState = "denied";
      return false;
    }
    if (Notification.permission === "granted") {
      permissionState = "granted";
      return true;
    }
    if (Notification.permission === "denied") {
      permissionState = "denied";
      return false;
    }
    const res = await Notification.requestPermission();
    permissionState = res === "granted" ? "granted" : "denied";
    return res === "granted";
  }
  try {
    const Notifications = await ensureNative();
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted) {
      permissionState = "granted";
      return true;
    }
    const req = await Notifications.requestPermissionsAsync();
    permissionState = req.granted ? "granted" : "denied";
    // Set sensible Android channel
    if (Platform.OS === "android" && req.granted) {
      await Notifications.setNotificationChannelAsync("builds", {
        name: "Build Complete",
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: "default",
      });
    }
    return req.granted;
  } catch {
    permissionState = "denied";
    return false;
  }
}

export async function scheduleBuildComplete(
  buildingId: string,
  title: string,
  body: string,
  fireAtEpochSeconds: number
): Promise<void> {
  const delayMs = Math.max(0, fireAtEpochSeconds * 1000 - Date.now());
  if (Platform.OS === "web") {
    if (permissionState !== "granted") return;
    if (webScheduled[buildingId]) {
      clearTimeout(webScheduled[buildingId]);
    }
    webScheduled[buildingId] = setTimeout(() => {
      try {
        new Notification(title, { body });
      } catch {}
      delete webScheduled[buildingId];
    }, delayMs) as unknown as number;
    return;
  }
  try {
    const Notifications = await ensureNative();
    await Notifications.scheduleNotificationAsync({
      identifier: buildingId,
      content: { title, body, sound: "default" },
      trigger: delayMs > 0
        ? { seconds: Math.ceil(delayMs / 1000), channelId: "builds" } as any
        : null,
    });
  } catch {
    // ignore
  }
}

export async function cancelScheduled(buildingId: string) {
  if (Platform.OS === "web") {
    if (webScheduled[buildingId]) {
      clearTimeout(webScheduled[buildingId]);
      delete webScheduled[buildingId];
    }
    return;
  }
  try {
    const Notifications = await ensureNative();
    await Notifications.cancelScheduledNotificationAsync(buildingId);
  } catch {}
}
