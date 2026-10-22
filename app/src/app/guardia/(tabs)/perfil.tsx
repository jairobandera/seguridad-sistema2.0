import { Appbar } from "react-native-paper";
import { Perfil } from "@/components/Perfil";

export default function PerfilGuardia() {
  return (
    <>
      <Appbar.Header>
        <Appbar.Content title="Mi cuenta" />
      </Appbar.Header>
      <Perfil />
    </>
  );
}
