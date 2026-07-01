import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useEffect } from "react";
import { initRemoteConfig } from "../src/remoteConfig";
import { Analytics } from "../src/analytics";

export default function RootLayout() {
  useEffect(() => {
    initRemoteConfig().catch(() => {});
    Analytics.sessionStart();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#090A0F" } }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="planning" options={{ presentation: "modal" }} />
          <Stack.Screen name="menu" options={{ presentation: "modal" }} />
          <Stack.Screen name="leaderboard" options={{ presentation: "modal" }} />
          <Stack.Screen name="legacy" options={{ presentation: "modal" }} />
          <Stack.Screen name="result" />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
