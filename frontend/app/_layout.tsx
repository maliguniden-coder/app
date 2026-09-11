import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { LogBox, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { queryClient } from "@/src/query-client";
import { hydrateColorScheme, useTheme } from "@/src/theme";

LogBox.ignoreAllLogs(true);

function ThemedStack() {
  const { scheme, colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.surface },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="languages" options={{ presentation: "modal" }} />
        <Stack.Screen name="history" options={{ presentation: "modal" }} />
      </Stack>
    </View>
  );
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    hydrateColorScheme().finally(() => setReady(true));
  }, []);

  if (!ready) return null;

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <ThemedStack />
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
