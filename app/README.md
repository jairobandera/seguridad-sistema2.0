# App Seguridad Hogar (React Native + Expo)

Una sola app para los tres tipos de usuario. Al entrar, cada uno ve sus pantallas:

| Rol | Pantallas |
|---|---|
| **Cliente** (dueño o familiar) | Inicio (armar/desarmar, puerta, placa), Actividad, Placa (agregar, cambiar WiFi, restablecer), Contactos de emergencia, Familia, Mi cuenta |
| **Guardia** | Alertas en vivo (tomar, resolver, falsa alarma), Casas con filtros, Detalle con botones para llamar |
| **Admin** | Usuarios (con clave temporal), Casas y sus integrantes, Placas, Estado del sistema |

## Requisitos
- Node.js 20 o más nuevo (ya lo tenés).
- Una cuenta gratis en https://expo.dev (para compilar en la nube y para las notificaciones push).
- **No** hace falta Android Studio ni Mac.

## Configurar la URL del servidor
Archivo `app/.env`:
```
EXPO_PUBLIC_API_URL=http://192.168.1.75:3000
```
Usá la IP de tu PC en la red WiFi (`ipconfig` en Windows). El celular tiene que estar en la misma red.

## Probar rápido con Expo Go (sin Bluetooth ni push)
```bash
npm install
npx expo start
```
Escaneá el QR con la app **Expo Go** (Play Store / App Store). Sirve para probar login, guardia y admin.
El Bluetooth y las notificaciones push **no** funcionan en Expo Go.

## App de prueba completa (con Bluetooth y push) — compilada en la nube
Se hace **una sola vez**, y después se actualiza en vivo como con Expo Go:
```bash
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest build --profile development --platform android
```
Al terminar te da un link/QR para instalar el APK en el celular. Después:
```bash
npx expo start --dev-client
```
y abrís la app instalada: carga el código de tu PC y se actualiza al guardar.

Para iPhone: `--platform ios` (necesita la cuenta de Apple Developer).

## Versiones para usuarios
- **preview**: APK para repartir a clientes y guardias de prueba (`eas build --profile preview --platform android`).
- **production**: para las tiendas (`eas build --profile production`), con `EXPO_PUBLIC_API_URL` de Render en `eas.json`.
- Correcciones sin pasar por las tiendas: `npx eas-cli@latest update`.

Cómo levantar todo en local: `README.md` en la raíz del repo.

## Comandos útiles
```bash
npm run typecheck   # chequeo de tipos
npx eslint src      # linter
npx expo-doctor     # diagnóstico de dependencias
```
