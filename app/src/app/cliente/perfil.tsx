import { Appbar } from "react-native-paper";
import { router } from "expo-router";
import { Perfil } from "@/components/Perfil";

export default function PerfilCliente() {
  return (
    <>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Mi cuenta" />
      </Appbar.Header>
      <Perfil />
    </>
  );
}
