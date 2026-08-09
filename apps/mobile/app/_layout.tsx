import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function Layout() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 15_000 } } }));
  return <SafeAreaProvider><QueryClientProvider client={client}><StatusBar style="dark"/><Stack screenOptions={{ headerShown: false, animation: "fade" }}/></QueryClientProvider></SafeAreaProvider>;
}
