import { Tabs } from "expo-router";
import { useTheme } from "react-native-paper";
import { useQuery } from "@tanstack/react-query";
import { guardia } from "@/api/endpoints";
import { iconoTab } from "@/components/iconoTab";

export default function TabsGuardia() {
  const tema = useTheme();
  const resumen = useQuery({ queryKey: ["guardia", "resumen"], queryFn: guardia.resumen, refetchInterval: 60_000 });
  const pendientes = resumen.data?.pendientes ?? 0;
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: tema.colors.primary,
        tabBarInactiveTintColor: tema.colors.onSurfaceVariant, tabBarStyle: { backgroundColor: tema.colors.surface } }}>
      <Tabs.Screen
        name="alertas"
        options={{ title: "Alertas", tabBarIcon: iconoTab("alarm-light"), tabBarBadge: pendientes > 0 ? pendientes : undefined }}
      />
      <Tabs.Screen name="casas" options={{ title: "Casas", tabBarIcon: iconoTab("home-group") }} />
      <Tabs.Screen name="perfil" options={{ title: "Cuenta", tabBarIcon: iconoTab("account-circle") }} />
    </Tabs>
  );
}
