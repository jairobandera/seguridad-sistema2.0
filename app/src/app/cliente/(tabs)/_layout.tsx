import { Tabs } from "expo-router";
import { useTheme } from "react-native-paper";
import { iconoTab } from "@/components/iconoTab";

export default function TabsCliente() {
  const tema = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: tema.colors.primary,
        tabBarInactiveTintColor: tema.colors.onSurfaceVariant,
        tabBarStyle: { backgroundColor: tema.colors.surface },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Inicio", tabBarIcon: iconoTab("home") }} />
      <Tabs.Screen name="actividad" options={{ title: "Actividad", tabBarIcon: iconoTab("history") }} />
      <Tabs.Screen name="dispositivos" options={{ title: "Dispositivos", tabBarIcon: iconoTab("chip") }} />
      <Tabs.Screen name="mas" options={{ title: "Más", tabBarIcon: iconoTab("menu") }} />
    </Tabs>
  );
}
