import { Tabs } from "expo-router";
import { useTheme } from "react-native-paper";
import { iconoTab } from "@/components/iconoTab";

export default function TabsAdmin() {
  const tema = useTheme();
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: tema.colors.primary,
        tabBarInactiveTintColor: tema.colors.onSurfaceVariant, tabBarStyle: { backgroundColor: tema.colors.surface } }}>
      <Tabs.Screen name="usuarios" options={{ title: "Usuarios", tabBarIcon: iconoTab("account-multiple") }} />
      <Tabs.Screen name="casas" options={{ title: "Casas", tabBarIcon: iconoTab("home-city") }} />
      <Tabs.Screen name="placas" options={{ title: "Placas", tabBarIcon: iconoTab("chip") }} />
      <Tabs.Screen name="sistema" options={{ title: "Sistema", tabBarIcon: iconoTab("cog") }} />
    </Tabs>
  );
}
