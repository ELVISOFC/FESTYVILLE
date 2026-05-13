import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#090A0F" } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="planning" options={{ presentation: "modal" }} />
        <Stack.Screen name="leaderboard" options={{ presentation: "modal" }} />
      </Stack>
    </SafeAreaProvider>
  );
}
