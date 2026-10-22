# Protocolo v2 — contrato entre placa, backend y app

Este documento es la **única fuente de verdad** para firmware (`firmware/`), backend (`backend/`) y app (`app/`).
Si cambiás algo acá, cambialo en los tres lados.

- `deviceId`: MAC WiFi de la placa en 12 caracteres hexadecimales en mayúscula, sin separadores (ej. `A1B2C3D4E5F6`).
- Fechas: en MQTT/BLE, segundos Unix (`ts`). En la API REST, ISO 8601.
- Todo JSON va en UTF-8.

---

## 1. Bluetooth (BLE) — configuración de la placa

La placa **solo anuncia BLE en modo configuración**:
- placa sin WiFi configurado (primer uso o luego de un reset),
- botón BOOT apretado 5 s (abre la ventana 10 min),
- comando MQTT `open_ble` (lo manda el backend cuando el dueño toca "Cambiar WiFi"),
- WiFi caído más de 5 min seguidos (cambio de router).

Nombre anunciado: `HUB-XXXX` (últimos 4 caracteres del `deviceId`).

| Característica | UUID | Propiedades |
|---|---|---|
| Servicio | `6E400001-B5A3-F393-E0A9-E50E24DCCA9E` | — |
| RX (app → placa) | `6E400002-B5A3-F393-E0A9-E50E24DCCA9E` | WRITE, WRITE_NR |
| TX (placa → app) | `6E400003-B5A3-F393-E0A9-E50E24DCCA9E` | NOTIFY |
| INFO | `6E400004-B5A3-F393-E0A9-E50E24DCCA9E` | READ → `{"id":"…","fw":"2.0.0","vinculada":true}` |

**Trama**: cada mensaje es un JSON terminado en `\n`, en ambos sentidos. Se puede partir en varios
fragmentos; el receptor acumula hasta el `\n`. La app pide MTU 185 (Android); la placa fragmenta las
notificaciones según el MTU negociado.

### Comandos app → placa
| Comando | Respuesta |
|---|---|
| `{"cmd":"info"}` | `{"r":"info","id":"…","fw":"2.0.0","vinculada":bool,"wifi":{"ok":bool,"ssid":"…","rssi":-60}}` |
| `{"cmd":"scan"}` | `{"r":"redes","lista":[{"ssid":"Casa","rssi":-52,"seguro":true}]}` (solo 2.4 GHz, sin duplicados, ordenadas por señal) |
| `{"cmd":"setup","ssid":"…","pass":"…","codigo":"…"}` | Placa **sin vincular**: conecta WiFi y se vincula con el código. |
| `{"cmd":"setup","ssid":"…","pass":"…","token":"…"}` | Placa **vinculada**: solo cambia el WiFi. Requiere `token` de configuración. |
| `{"cmd":"factory_reset","token":"…"}` | `{"r":"ok"}` y reinicia sin datos. Requiere `token` si está vinculada. |

`setup` acepta además `"api":"https://…"` opcional para cambiar la URL del backend (solo desarrollo).

### Progreso placa → app (durante `setup`)
```
{"r":"progreso","fase":"wifi_conectando"}
{"r":"progreso","fase":"wifi_ok"}
{"r":"progreso","fase":"vinculando"}        (solo si se mandó codigo)
{"r":"progreso","fase":"vinculada"}
{"r":"progreso","fase":"mqtt_ok"}
{"r":"progreso","fase":"listo"}             (fin exitoso)
```
Error (fin con falla):
```
{"r":"error","fase":"wifi","motivo":"clave_incorrecta"|"red_no_encontrada"|"timeout"}
{"r":"error","fase":"vinculacion","motivo":"codigo_invalido"|"ya_vinculada"|"sin_internet"|"servidor"}
{"r":"error","fase":"mqtt","motivo":"timeout"}
{"r":"error","fase":"comando","motivo":"token_invalido"|"json_invalido"|"ocupado"|"desconocido"}
```
Si el WiFi nuevo falla y la placa tenía uno anterior, vuelve al anterior.

### Token de configuración (placa ya vinculada)
Lo genera el backend (`POST /api/dispositivos/:id/token-config`) solo para el DUEÑO o un ADMIN:
```
token = "<exp>.<firma>"
exp   = segundos Unix de vencimiento (ahora + 600)
firma = hex( HMAC-SHA256( clave = secret (32 bytes), mensaje = "<deviceId>|<exp>" ) )
```
`secret` son 32 bytes aleatorios que la placa genera la primera vez y comparte con el backend al
vincularse. La placa verifica la firma sin internet. Si tiene hora NTP, rechaza tokens vencidos; si no
tiene hora, acepta el token solo dentro de los 10 min de la ventana BLE.

---

## 2. Vinculación por HTTPS (placa → backend, una sola vez)

`POST {api}/api/dispositivos/provision` (sin JWT, con límite de intentos)
```json
{ "deviceId": "A1B2C3D4E5F6", "codigo": "<código de vinculación>", "secret": "<64 hex>", "fw": "2.0.0" }
```
Respuestas:
| HTTP | Cuerpo | Motivo BLE |
|---|---|---|
| 200 | `{"mqtt":{"url":"wss://api…/mqtt","user":"A1B2C3D4E5F6","pass":"…"},"casaId":1}` | — |
| 400 | `{"error":"codigo_invalido"}` (no existe, vencido o usado) | `codigo_invalido` |
| 409 | `{"error":"ya_vinculada"}` (vinculada a **otra** casa) | `ya_vinculada` |

Si la placa ya estaba vinculada a la **misma** casa, se re-vincula: se rotan secreto y credenciales MQTT.
Al vincular, el backend reinicia `ultimoSeq` a 0.

---

## 3. MQTT

El broker MQTT está **incluido en el backend** (aedes): en producción las placas se conectan por
`wss://<api>/mqtt` (TLS de Render); en la red local también por TCP (`mqtt://<ip-pc>:1884`).
Sin acceso anónimo: usuario = `deviceId` = clientId, clave entregada al vincularse (el backend guarda
solo su hash). ACL: la placa publica solo en `dev/{deviceId}/state|event|telemetry|ack` y se suscribe
solo a `dev/{deviceId}/cmd`.

| Topic | Sentido | QoS | Retain | Payload |
|---|---|---|---|---|
| `dev/{id}/state` | placa → | 1 | sí | `{"online":true,"puerta":"abierta"\|"cerrada","fw":"2.0.0","ssid":"…","rssi":-60,"ip":"…"}` |
| `dev/{id}/state` (LWT) | broker → | 1 | sí | `{"online":false}` |
| `dev/{id}/event` | placa → | 1 | no | `{"seq":12,"tipo":"PUERTA_ABIERTA"\|"PUERTA_CERRADA","ts":1730000000}` |
| `dev/{id}/telemetry` | placa → | 0 | no | `{"rssi":-61,"uptime":3600,"heap":120000}` cada 60 s |
| `dev/{id}/cmd` | backend → | 1 | no | `{"id":"<uuid>","cmd":"factory_reset"\|"open_ble"\|"reboot"\|"ping"}` |
| `dev/{id}/ack` | placa → | 1 | no | `{"id":"<uuid>","ok":true,"error":null}` |

- `seq` empieza en 1 luego de cada vinculación y sube de a 1. La placa lo guarda en flash y guarda en
  cola (hasta 32) los eventos que no pudo enviar. El backend descarta `seq <= ultimoSeq` (duplicados).
- `ts = 0` significa "la placa todavía no tiene hora": el backend usa la hora de recepción.
- `state` se publica al conectar, cuando cambia la puerta y cuando cambia el WiFi.
- El backend toma el `deviceId` **solo del topic**, nunca del payload.
- Offline: por LWT o desconexión, con 30 s de gracia (evita falsas alarmas por cortes breves);
  respaldo: 150 s sin `state` ni `telemetry`.
- Si el broker rechaza las credenciales 3 veces seguidas, la placa se considera desvinculada:
  borra sus credenciales MQTT y abre el Bluetooth.
- `factory_reset`: la placa manda el `ack`, borra todo y reinicia en modo configuración.

---

## 4. Socket.IO (backend → app)

Conexión: `io(API_URL, { auth: { token: <accessToken> }, transports: ['websocket'] })`.
El servidor une al socket a sus rooms según el usuario (`user:{id}`, `casa:{id}` por cada casa,
`guardias`, `admins`). La app no necesita emitir nada.

| Evento | Payload | Quién lo recibe |
|---|---|---|
| `casa:estado` | `{casaId, alarmaArmada, puertaAbierta, online, rssi, ssid}` | miembros de la casa, guardias, admins |
| `evento:nuevo` | `EventoDTO` (ver abajo) | miembros de la casa, guardias, admins |
| `evento:estado` | `{eventoId, casaId, estado, guardia:{id,nombre}\|null, nota}` | guardias, admins, miembros |
| `dispositivo:config` | `{deviceId, casaId, fase:"vinculada"\|"desvinculada"\|"reset"}` | miembros de la casa, admins |

```ts
type EventoDTO = {
  id: number;
  tipo: 'PUERTA_ABIERTA' | 'PUERTA_CERRADA' | 'ALARMA_ARMADA' | 'ALARMA_DESARMADA'
      | 'DISPOSITIVO_OFFLINE' | 'DISPOSITIVO_ONLINE' | 'DISPOSITIVO_VINCULADO' | 'PRUEBA';
  severidad: 'INFO' | 'ALERTA' | 'CRITICA';
  fechaHora: string;            // ISO
  alarmaArmada: boolean;        // estado de la alarma en ese momento
  casa: { id: number; nombre: string | null; calle: string | null; numero: string | null;
          manzana: string | null; barrio: string | null } | null;
  dispositivo: { deviceId: string; nombre: string | null } | null;
  usuario: { id: number; nombre: string } | null;     // quién armó/desarmó
  estado: { estado: 'PENDIENTE' | 'EN_CURSO' | 'RESUELTO' | 'FALSA_ALARMA';
            guardia: { id: number; nombre: string } | null; nota: string | null } | null;
};
```

---

## 5. API REST (resumen)

Base: `API_URL`. Autenticación: `Authorization: Bearer <accessToken>` (15 min). Errores:
`{"error":"<codigo>","mensaje":"<texto para mostrar>"}`.

### Auth
| Método | Ruta | Cuerpo / Respuesta |
|---|---|---|
| POST | `/auth/login` | `{email,password}` → `{accessToken,refreshToken,usuario}` |
| POST | `/auth/refresh` | `{refreshToken}` → `{accessToken,refreshToken,usuario}` (rota) |
| POST | `/auth/logout` | `{refreshToken, pushToken?}` → 204 |
| POST | `/auth/cambiar-password` | `{actual,nueva}` (JWT) → 204 |

### Usuario actual
| GET | `/api/me` | `{id,nombre,apellido,email,telefono,rol,debeCambiarPassword,casas:[{id,nombre,rolCasa}]}` |
|---|---|---|
| POST | `/api/push-tokens` | `{token,plataforma}` |
| DELETE | `/api/push-tokens` | `{token}` |
| POST | `/api/me/notificacion-prueba` | push de prueba al usuario |

### Cliente (miembro de la casa)
| Método | Ruta | Notas |
|---|---|---|
| GET | `/api/casas/mias` | `[CasaEstado]` con `rolCasa`, dispositivo y estado |
| PUT | `/api/casas/:id/alarma` | `{armada}` → `{casa, advertencia?: "puerta_abierta"}` |
| GET | `/api/casas/:id/eventos?cursor=&limit=` | `{items:EventoDTO[], siguiente:number\|null}` |
| GET | `/api/casas/:id/miembros` | `[{usuarioId,nombre,apellido,email,telefono,rol}]` |
| POST | `/api/casas/:id/miembros` | `{email}` (DUEÑO) agrega un FAMILIAR existente |
| DELETE | `/api/casas/:id/miembros/:usuarioId` | DUEÑO |
| POST | `/api/casas/:id/codigo-vinculacion` | DUEÑO → `{codigo, expiraEn}` |
| GET/POST | `/api/contactos` | propios, máx. 2, `{nombre,telefono(E.164),relacion?}` |
| PUT/DELETE | `/api/contactos/:id` | propios |

### Placas
| Método | Ruta | Notas |
|---|---|---|
| POST | `/api/dispositivos/provision` | lo llama la placa (sección 2) |
| GET | `/api/dispositivos/:id` | miembro, guardia o admin |
| POST | `/api/dispositivos/:id/token-config` | DUEÑO/ADMIN → `{token, expiraEn}` |
| POST | `/api/dispositivos/:id/modo-config` | DUEÑO/ADMIN → manda `open_ble`; `{ok:true}` o 202 si no respondió |
| POST | `/api/dispositivos/:id/reset` | DUEÑO/ADMIN → `factory_reset` + desvincula |
| DELETE | `/api/dispositivos/:id/vinculo` | DUEÑO/ADMIN → desvincula sin tocar la placa |

### Guardia
`GET /api/guardia/resumen`, `GET /api/guardia/casas`, `GET /api/guardia/casas/:id`,
`GET /api/guardia/eventos?estado=&casaId=&cursor=`, `POST /api/guardia/eventos/:id/tomar`,
`POST /api/guardia/eventos/:id/resolver {resultado:'RESUELTO'|'FALSA_ALARMA', nota?}`,
`POST /api/guardia/casas/:id/resolver-todo`.

### Admin
`GET|POST /api/admin/usuarios`, `PUT /api/admin/usuarios/:id`,
`POST /api/admin/usuarios/:id/reset-password` → `{passwordTemporal}`,
`GET|POST /api/admin/casas`, `GET|PUT /api/admin/casas/:id`,
`PUT /api/admin/casas/:id/miembros` `{miembros:[{usuarioId,rol}]}`,
`GET /api/admin/dispositivos?estado=`, `GET /api/admin/sistema`.

`GET /health` y `GET /api/health` (públicos, para cron-job) → `{ok, db, mqtt, hora}`.
