# Seguridad Residencial v2

Sistema de alarma para casas: una placa **ESP32** con sensor magnético en la puerta, un **backend** Node
(API + tiempo real + broker MQTT) y una **app** para celular (Android/iOS) con tres tipos de usuario.

```
 Celular (app)  ──HTTP / WebSocket──►  Backend en tu PC  ──►  MySQL (XAMPP)
                                          ▲
 Placa ESP32  ─────── MQTT (puerto 1884) ─┘
```

| Carpeta | Qué es |
|---|---|
| `backend/` | Node 20 + Express 5 + TypeScript + Prisma (MySQL) + Socket.IO + broker MQTT incluido (aedes) + Expo Push + Twilio |
| `app/` | React Native + Expo SDK 58 (Expo Router, React Native Paper). Se compila en la nube con EAS |
| `firmware/` | ESP32 con Arduino IDE (NimBLE, ArduinoJson, esp-mqtt) |
| `docs/protocolo.md` | Contrato único: Bluetooth, MQTT, Socket.IO y API |

Esta guía explica cómo **levantar todo en tu PC** (red local).

---

## Índice
1. [Qué necesitás](#1-qué-necesitás)
2. [Primera vez: base de datos](#2-primera-vez-base-de-datos)
3. [Primera vez: backend](#3-primera-vez-backend)
4. [Primera vez: firewall de Windows](#4-primera-vez-firewall-de-windows)
5. [Primera vez: app en el celular](#5-primera-vez-app-en-el-celular)
6. [Primera vez: firmware en la placa](#6-primera-vez-firmware-en-la-placa)
7. [Vincular la placa](#7-vincular-la-placa)
8. [Uso diario: qué prender cada vez](#8-uso-diario-qué-prender-cada-vez)
9. [Probar sin placa (simulador)](#9-probar-sin-placa-simulador)
10. [SMS con Twilio (opcional)](#10-sms-con-twilio-opcional)
11. [Tests y chequeos](#11-tests-y-chequeos)
12. [Problemas comunes](#12-problemas-comunes)

---

## 1. Qué necesitás

| Herramienta | Para qué |
|---|---|
| **Node.js 20 o más nuevo** | Backend y app |
| **XAMPP** (solo MySQL) | Base de datos |
| **Arduino IDE 2** + placa **esp32 by Espressif 3.x** | Grabar la placa |
| Librerías **NimBLE-Arduino 2.x** (h2zero) y **ArduinoJson 7.x** (Benoit Blanchon) | Firmware |
| Cuenta gratis en **https://expo.dev** | Compilar la app en la nube |
| Celular **Android** | La app (iPhone necesita cuenta de Apple Developer) |
| Placa **ESP32** (ESP32 Dev Module) + sensor magnético (reed switch) | El hardware |

**No** hace falta Android Studio, Mosquitto ni Docker.

> La PC, el celular y la placa tienen que estar en la **misma red** (mismo router).

**Tu IP local:** casi todo apunta a la IP de tu PC. Para verla, abrí una terminal y ejecutá `ipconfig` → "Dirección IPv4"
(por ejemplo `192.168.1.75`). En esta guía aparece como `IP-DE-TU-PC`.

> Consejo: en el router, reservale siempre la misma IP a tu PC ("reserva DHCP"). Si la IP cambia, hay que tocar
> los `.env` y volver a vincular la placa (ver [Problemas comunes](#12-problemas-comunes)).

---

## 2. Primera vez: base de datos

1. Abrí el **XAMPP Control Panel** → **Start** en **MySQL**.
2. Creá las dos bases (una para usar y otra para los tests):
   ```bash
   C:\xampp\mysql\bin\mysql.exe -u root -e "CREATE DATABASE IF NOT EXISTS seguridad; CREATE DATABASE IF NOT EXISTS seguridad_test;"
   ```
   (También podés crearlas desde phpMyAdmin: `http://localhost/phpmyadmin` → Nueva).

El usuario `root` de XAMPP viene **sin contraseña**. Si le pusiste una, agregala en `DATABASE_URL` del paso siguiente
(`mysql://root:TU_CLAVE@localhost:3306/seguridad`).

---

## 3. Primera vez: backend

Todo esto en una terminal, dentro de la carpeta `backend`.

### 3.1 Instalar dependencias
```bash
npx pnpm@10 install
```

### 3.2 Crear el `.env`
Copiá `backend/.env.example` como `backend/.env` y completá:

| Variable | Qué poner |
|---|---|
| `DATABASE_URL` | `mysql://root:@localhost:3306/seguridad` (así viene) |
| `JWT_SECRET` | Un secreto nuevo (ver abajo) |
| `DEVICE_SECRET_KEY` | Otro secreto nuevo (ver abajo). **No lo cambies después**: si lo cambiás hay que volver a vincular las placas |
| `MQTT_TCP_PORT` | `1884` (así viene) |
| `MQTT_PUBLIC_URL` | `mqtt://IP-DE-TU-PC:1884` |
| `CORS_ORIGINS` | Vacío (o `http://localhost:8081` si usás la app en el navegador) |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | El email y la clave del administrador (mínimo 8 caracteres) |

Para generar los secretos:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```
→ pegalo en `JWT_SECRET`.
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
→ pegalo en `DEVICE_SECRET_KEY`.

> El `.env` **nunca** se sube a GitHub (está en `.gitignore`).

### 3.3 Crear las tablas y los usuarios de prueba
```bash
npx prisma migrate deploy
```
```bash
npx pnpm@10 seed -- --demo
```

El seed crea tu administrador (el del `.env`) y estos usuarios de prueba:

| Rol | Email | Contraseña | Sistema |
|---|---|---|---|
| Cliente (dueña de la casa C-DEMO) | ana@demo.com | Demo12345 | Barrio Demo (con guardia) |
| Cliente (familiar en C-DEMO) | juan@demo.com | Demo12345 | Barrio Demo (con guardia) |
| Guardia | guardia@demo.com | Demo12345 | Cubre Barrio Demo |
| Cliente (dueña de C-SINGUARDIA) | lucia@demo.com | Demo12345 | Barrio Sin Guardia |
| Cliente (dueño de C-INDIVIDUAL) | pedro@demo.com | Demo12345 | Casa individual |

### 3.4 Arrancar
```bash
npx pnpm@10 dev
```
Dejá esa terminal abierta. Se reinicia solo cuando guardás cambios en el código.

Comprobá que anda abriendo **`http://localhost:3000/api/health`** en el navegador. Tiene que decir
`"ok":true,"db":true,"mqtt":true`.

---

## 4. Primera vez: firewall de Windows

Para que el celular y la placa lleguen a tu PC. Abrí PowerShell **como administrador** y ejecutá:
```bash
netsh advfirewall firewall add rule name="Seguridad API 3000" protocol=TCP dir=in localport=3000 action=allow
```
```bash
netsh advfirewall firewall add rule name="Seguridad MQTT 1884" protocol=TCP dir=in localport=1884 action=allow
```

Comprobalo desde el **navegador del celular** (conectado al mismo WiFi): `http://IP-DE-TU-PC:3000/api/health`.

---

## 5. Primera vez: app en el celular

Todo esto dentro de la carpeta `app`.

### 5.1 Instalar y configurar
```bash
npm install
```
Copiá `app/.env.example` como `app/.env` y poné tu IP:
```
EXPO_PUBLIC_API_URL=http://IP-DE-TU-PC:3000
```

### 5.2 Compilar la "app de desarrollo" (una sola vez)
La app usa **Bluetooth**, que **no** funciona en Expo Go. Por eso se compila una app propia en la nube de Expo
(tarda unos 10–15 minutos):
```bash
npx eas-cli@latest login
```
```bash
npx eas-cli@latest build --profile development --platform android
```
- Si pregunta *"Generate a new Android Keystore?"* → **Y**.
- Al final, si pregunta *"Install and run on an emulator?"* → **n** (no hace falta Android Studio).
- Te da un **link/QR**: abrilo en el celular, descargá el APK e instalalo (Android pide permitir "orígenes desconocidos").

Solo hay que volver a compilar si se agregan librerías nativas nuevas a la app.

> Si usás tu propia cuenta de Expo: borrá `extra.eas.projectId` de `app/app.config.ts` y ejecutá
> `npx eas-cli@latest init` antes del build. El `slug` del `app.config.ts` tiene que coincidir con el del proyecto en Expo.

### 5.3 Probar rápido sin compilar (opcional)
Con **Expo Go** (de la Play Store) podés probar el login, el guardia y el admin, pero **sin Bluetooth ni push**:
```bash
npx expo start
```
y escaneá el QR con Expo Go.

---

## 6. Primera vez: firmware en la placa

### 6.1 Conexiones
| Elemento | Pin |
|---|---|
| Sensor magnético (reed switch) | **GPIO14** y **GND** |
| Botón de configuración | botón **BOOT** de la placa (no hay que soldar nada) |
| LED de estado | LED azul de la placa (GPIO2) |

Imán cerca = puerta **cerrada**. Si se corta el cable del sensor, la placa lo toma como **abierta**.

### 6.2 Configurar Arduino IDE
1. Abrí `firmware/seguridad_esp32/seguridad_esp32.ino` (se abren todas las pestañas solas).
2. Librerías (**Programa → Incluir librería → Gestionar librerías**): **NimBLE-Arduino** 2.x y **ArduinoJson** 7.x.
3. **Herramientas**:
   - **Placa → esp32 → ESP32 Dev Module** ⚠️ no "ESP32-C5" ni otra variante.
   - **Partition Scheme → Minimal SPIFFS (1.9MB APP with OTA)** ⚠️ con la de por defecto **no entra**.
   - **Puerto** → el COM de la placa (por ejemplo COM3).
   - El resto, como viene.

> Al cambiar de placa, el IDE vuelve las opciones a su valor por defecto: revisá de nuevo el **Partition Scheme**.

### 6.3 Subir
Tocá **Subir (→)**. La primera vez tarda varios minutos (compila todo desde cero); las siguientes, bastante menos.
Si se queda en `Connecting.....`, mantené apretado **BOOT** hasta que empiece a subir.

Abrí el **Monitor Serie a 115200** para ver qué hace. Recién grabada, la luz azul parpadea rápido: está esperando la app.

### 6.4 Qué significa el LED
| LED | Estado |
|---|---|
| Parpadeo rápido continuo | Bluetooth abierto: esperando la app |
| 2 destellos cada 2 s | Sin WiFi |
| 3 destellos cada 2 s | Hay WiFi pero no llega al servidor |
| 1 destello corto cada 5 s | Todo funcionando |
| Fijo encendido (con BOOT apretado) | Soltá ahora para restablecer de fábrica |

**Botón BOOT:** 5 s → abre el Bluetooth 10 minutos (para cambiar el WiFi). 15 s → restablece de fábrica.

Más detalles del firmware: [`firmware/README.md`](firmware/README.md).

---

## 7. Vincular la placa

Con el backend corriendo y la app abierta:

1. Entrá como **ana@demo.com**.
2. **Placa → Agregar placa** → elegí `HUB-XXXX` → elegí tu red WiFi → escribí la clave → **Conectar**.
3. Tiene que decir *"¡Listo! Tu placa quedó vinculada"* y la luz pasa a 1 destello cada 5 s.

En el Monitor Serie se ve:
```
[wifi] conectada a TU_RED, IP 192.168.1.xx
[setup] vinculando
[setup] vinculada
[mqtt] conectado
```

### Prueba completa
1. **Inicio**: la puerta y la placa aparecen en vivo. Separá el imán → "Puerta abierta".
2. Mantené apretado el botón para **armar**. Separá el imán → pantalla roja con sirena.
3. En otro celular entrá como **guardia@demo.com** → aparece la alerta → Tomar → Cerrar.
4. Desenchufá la placa → al minuto aparece "Sin conexión" (y alerta al guardia si estaba armada).

---

## 8. Uso diario: qué prender cada vez

Una vez hecho todo lo anterior, para seguir probando solo hace falta:

1. **XAMPP** → **Start** en MySQL.
2. Terminal en `backend`:
   ```bash
   npx pnpm@10 dev
   ```
3. Terminal en `app`:
   ```bash
   npx expo start --dev-client
   ```
4. **Enchufá la placa** (cualquier cargador USB; no necesita la PC). Se conecta sola.
5. Abrí **Seguridad Hogar** en el celular. Si no carga sola, escaneá el QR de la terminal.

**No** hace falta volver a compilar la app ni a grabar la placa, salvo que cambie su código.

Para apagar: `Ctrl + C` en cada terminal y **Stop** en XAMPP.

---

## 9. Probar sin placa (simulador)

Desde `backend`, con el backend corriendo. Primero pedí un código en la app (**Placa → Agregar placa**) y después:
```bash
npx tsx scripts/simular-placa.ts --codigo CODIGO
```
Las siguientes veces ya no hace falta el código:
```bash
npx tsx scripts/simular-placa.ts
```
Teclas: `a` abre la puerta, `c` la cierra, `q` sale.

---

## 10. SMS con Twilio (opcional)

Sin esto todo funciona igual, solo que no se mandan SMS.

1. Creá una cuenta en https://www.twilio.com y conseguí un número con capacidad **SMS**.
2. En **Messaging → Settings → Geo permissions** habilitá los países a los que vas a mandar (por ejemplo Uruguay y Argentina).
3. En `backend/.env`:
   ```
   SMS_HABILITADO=true
   TWILIO_ACCOUNT_SID=AC...
   TWILIO_AUTH_TOKEN=...
   TWILIO_FROM_NUMBER=+1...
   ```
4. Reiniciá el backend. Ya no debería decir "SMS deshabilitado".
5. Cargá tu número en la app (**Mi cuenta** o **Contactos de emergencia**) en formato internacional: `+598` + el número sin el 0.

Reciben SMS el **dueño** y sus **contactos de emergencia** cuando se abre la puerta con la alarma armada o la placa se
desconecta estando armada. Como máximo 1 SMS cada 5 minutos por casa (`SMS_MINUTOS_ENTRE_ALERTAS`).

> Cuenta de prueba (*Trial*) de Twilio: solo manda a números **verificados** (Console → Verified Caller IDs) y agrega un
> texto de Twilio al mensaje.

---

## 10.1 Emails con Brevo (opcional): "Olvidé mi contraseña"

En el login, **Olvidé mi contraseña** manda un código de 6 números al email de la cuenta; con ese código se elige
una contraseña nueva sin saber la anterior.

- **En tu PC no hace falta configurar nada:** el código aparece en la consola del backend
  (`Email deshabilitado. Código para restablecer la contraseña: 123456`).
- Para que llegue de verdad por email (gratis, 300 por día):
  1. Creá una cuenta en https://www.brevo.com.
  2. **Senders, Domains & Dedicated IPs → Senders → Add a sender**: tu email (ej. el Gmail del sistema). Confirmalo
     con el email que te llega.
  3. **SMTP & API → API Keys → Generate a new API key**.
  4. En `backend/.env`:
     ```
     BREVO_API_KEY=xkeysib-...
     EMAIL_REMITENTE=tu-email@gmail.com
     ```
  5. Reiniciá el backend. Ya no debería decir "Email deshabilitado".

> Se usa la API de Brevo (HTTPS) y no SMTP porque Render gratis bloquea SMTP. Con un Gmail como remitente, Brevo lo
> manda desde una dirección suya (`...@brevosend.com`) con el nombre **GuardiEl**: llega igual.

---

## 11. Tests y chequeos

Backend (con MySQL prendido; usa la base `seguridad_test`):
```bash
npx pnpm@10 test
```
```bash
npx pnpm@10 typecheck
```
App:
```bash
npx tsc --noEmit
```
```bash
npx eslint src
```
Firmware: compilar en Arduino IDE (✓) o con `arduino-cli compile --fqbn esp32:esp32:esp32:PartitionScheme=min_spiffs firmware/seguridad_esp32`.

---

## 12. Problemas comunes

| Problema | Causa | Solución |
|---|---|---|
| `EADDRINUSE ... :1884` o `:3000` al arrancar el backend | Quedó otro backend prendido | Cerrá todas las terminales y abrí una nueva. Si sigue: `Get-NetTCPConnection -LocalPort 3000,1884 -State Listen` muestra el proceso → `Stop-Process -Id <PID>` |
| El celular no conecta / "Network request failed" | Firewall, IP o red distinta | Revisá el [paso 4](#4-primera-vez-firewall-de-windows), que `app/.env` tenga la IP correcta y que el celular esté en el mismo WiFi. Probá `http://IP-DE-TU-PC:3000/api/health` en el navegador del celular |
| Cambió la IP de la PC | El router le dio otra | Actualizá `MQTT_PUBLIC_URL` en `backend/.env` y `EXPO_PUBLIC_API_URL` en `app/.env`. Reiniciá backend y app. La placa guarda la IP vieja: **Placa → Restablecer y desvincular** (o BOOT 15 s) y volvé a vincularla |
| "La placa se conectó al WiFi pero no llega al servidor" | La placa no llega a tu PC | Mirá el Monitor Serie: la IP de la placa tiene que estar en la misma red que la PC (por ejemplo `192.168.1.x`). Las redes de invitados y algunos repetidores aíslan los equipos |
| "La contraseña del WiFi es incorrecta" | Clave mal escrita | Volvé a intentar. La placa solo usa WiFi de **2.4 GHz** |
| `This chip is ESP32, not ESP32-C5` al subir | Placa equivocada en el IDE | **Herramientas → Placa → ESP32 Dev Module** y revisá el Partition Scheme |
| `Sketch too big` al compilar | Partición por defecto | **Partition Scheme → Minimal SPIFFS** |
| `Slug ... does not match` en `eas build` | El slug no coincide con el proyecto de Expo | Igualá `slug` en `app/app.config.ts` con el proyecto (ver `npx eas-cli@latest project:info`) |
| `adb executable doesn't seem to work` al final del build | EAS quiso abrir un emulador | Ignoralo: el build salió bien. Instalá el APK desde el link |
| Monitor Serie: `[mqtt] credenciales rechazadas: placa desvinculada` y la app dice "Sin conexión" | Con el firmware anterior a este arreglo, si la placa se conectaba mientras MySQL estaba apagado, se desvinculaba sola | Subí el firmware actual y volvé a agregarla: **Placa → Agregar placa** (a la misma casa se permite). Prendé siempre XAMPP **antes** que el backend |
| MySQL no arranca en XAMPP | Puerto 3306 ocupado u otro MySQL | Cerrá otros MySQL o revisá el log de XAMPP |

---

## Paquetes
- **Barrio**: varias casas dentro de un barrio. Cada barrio puede tener la **guardia activada o no** (desde Sistemas, en el usuario admin).
  Con guardia: los guardias que cubren ese barrio ven sus casas y reciben las alarmas. Un guardia puede cubrir varios barrios.
- **Individual**: una casa suelta, sin guardia. Tiene todo lo demás: alarma, push con sirena a la familia, SMS, contactos y varios dispositivos.

Sin guardia (casa individual o barrio con la guardia apagada) la alarma avisa al dueño y la familia por push y a los contactos por SMS.

## Cuentas
- Los clientes **se registran solos** desde la app ("¿No tenés cuenta? Creala"):
  - **sin código** → se crea su casa **individual**;
  - con el **código del barrio** (`B-…`, lo genera el admin en Sistemas) → casa nueva en ese barrio, con su guardia;
  - con el **código de familia** (`F-…`, lo genera el dueño en Más → Familia) → se suma como familiar.
- Guardias y admins los crea el admin (con clave temporal).
- **¿Se olvidó la contraseña?** En el login, **Olvidé mi contraseña**: le llega un código al email y elige una nueva
  (ver 10.1).

## Actualizaciones de la app
La app de Android y iPhone se actualiza **por aire** (EAS Update): cuando se publica un cambio, al abrirla aparece
**"Hay una versión nueva → Actualizar"**. Para publicar (desde `app/`, va a Android e iPhone):
```bash
npm run publicar
```
Cambios nativos (librerías con código nativo, permisos, ícono) necesitan compilar de nuevo y subir `version` en `app.config.ts`.

## Funciones
- **Cliente (dueño/familiar)**: armar y desarmar manteniendo apretado, estado de la puerta y la placa en vivo,
  historial, configurar la placa por Bluetooth eligiendo la red WiFi de una lista, cambiar WiFi y restablecer,
  contactos de emergencia (SMS) y familiares.
- **Guardia**: alertas en vivo con sirena; tomar / resolver / falsa alarma, sincronizado entre guardias; casas con
  filtros; llamar al dueño o a los contactos.
- **Admin**: **Sistemas** (todos los barrios con su interruptor de guardia y las casas individuales), casas con paquete,
  barrio, dueño, familiares y retardo de entrada, usuarios con clave temporal (a los guardias se les eligen sus barrios),
  dispositivos y estado del sistema.
- **Varios dispositivos por casa** (puerta principal, trasera, ventanas...): cada uno con su nombre, que el dueño elige al agregarlo.

## Seguridad
- Sesiones de 15 min con renovación rotativa. Se revocan al cerrar sesión, al cambiar la clave o al desactivar al usuario.
- Permisos por rol y por casa en cada endpoint (cubiertos por tests).
- Cada placa tiene usuario y clave MQTT propios y solo puede usar sus topics.
- La vinculación usa un código de un solo uso.
- Cambiar el WiFi de una placa vinculada requiere un token firmado por el servidor.
- Bluetooth apagado salvo en modo configuración. Nunca se guarda ni se imprime la clave WiFi en el servidor.
