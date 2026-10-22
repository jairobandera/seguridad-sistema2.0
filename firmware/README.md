# Firmware ESP32 — Seguridad Residencial v2

## Conexiones (las mismas de siempre)
| Elemento | Pin |
|---|---|
| Sensor magnético (reed switch) | **GPIO14** y **GND** (usa la resistencia interna pull-up) |
| Botón de configuración | botón **BOOT** de la placa (GPIO0), no hay que soldar nada |
| LED de estado | LED azul de la placa (GPIO2) |

Imán cerca = puerta **cerrada**. Si se corta el cable del sensor, la placa lo toma como **abierta** (falla segura).

## Cómo subirlo con Arduino IDE
1. Abrí `firmware/seguridad_esp32/seguridad_esp32.ino` (se abren todas las pestañas solas).
2. **Herramientas → Placa → esp32 → ESP32 Dev Module** (core "esp32 by Espressif" 3.x).
3. **Herramientas → Partition Scheme → "Minimal SPIFFS (1.9MB APP with OTA)"**.
   ⚠️ Con la partición por defecto **no entra** y la compilación falla por tamaño.
4. Librerías (Programa → Incluir librería → Gestionar librerías):
   - **NimBLE-Arduino** (h2zero) 2.x
   - **ArduinoJson** (Benoit Blanchon) 7.x
5. **Herramientas → Puerto** → el COM de la placa (en tu PC hoy es **COM3**).
6. Subir (→). Abrí el **Monitor Serie a 115200** para ver lo que hace.

Si la subida no arranca, mantené apretado **BOOT** cuando aparece `Connecting....` y soltalo.

## Qué significa el LED
| LED | Estado |
|---|---|
| Parpadeo rápido continuo | Bluetooth abierto: esperando que la app la configure |
| 2 destellos cada 2 s | Sin WiFi |
| 3 destellos cada 2 s | Hay WiFi pero no llega al servidor |
| 1 destello corto cada 5 s | Todo funcionando |
| Fijo encendido (con BOOT apretado) | Soltá ahora para restablecer de fábrica |

## Botón BOOT
- **5 segundos** → abre el Bluetooth 10 minutos (para cambiar el WiFi desde la app).
- **15 segundos** → restablece de fábrica (borra WiFi y vinculación).

## Cómo funciona
1. Recién flasheada (o reseteada) la placa abre el Bluetooth como `HUB-XXXX`.
2. Desde la app (Placa → Agregar), elegís la red WiFi y la clave. La app le pasa un
   **código de un solo uso** y la URL del servidor.
3. La placa se conecta al WiFi, canjea el código en `/api/dispositivos/provision` y recibe
   su usuario y clave MQTT propios. Queda vinculada a tu casa y cierra el Bluetooth.
4. Cada apertura o cierre se guarda en flash con un número de secuencia y se envía por MQTT.
   Si no hay conexión, se guardan (hasta 32) y se mandan apenas vuelve. El servidor descarta duplicados.
5. Si se desenchufa o se corta el WiFi, el servidor se entera solo (MQTT "última voluntad").

Cambios de WiFi en una placa ya vinculada: solo el dueño desde la app (el servidor firma un
token que la placa verifica). Nadie que pase cerca puede cambiarle la red.

## Pruebas manuales recomendadas
- [ ] Abrir y cerrar la puerta 20 veces rápido: los eventos llegan en orden y sin rebotes.
- [ ] Apagar el router, abrir/cerrar la puerta, prenderlo: los eventos llegan con su hora real.
- [ ] Clave WiFi incorrecta en la app: muestra "contraseña incorrecta".
- [ ] Red inexistente: muestra "no encuentra la red".
- [ ] Apagar el backend: la placa sigue leyendo la puerta y reenvía todo cuando vuelve.
- [ ] Desenchufar la placa: la app la muestra "sin conexión" en menos de un minuto.
- [ ] BOOT 5 s → la app puede cambiar el WiFi. BOOT 15 s → queda de fábrica.
- [ ] "Restablecer" desde la app: la placa se reinicia sin datos y queda desvinculada.

## Producción
Para producción no hay que cambiar nada del firmware: la app le manda la URL del servidor
(`https://…onrender.com`) y el servidor le entrega `wss://…onrender.com/mqtt`. Los certificados
HTTPS se validan con el paquete de certificados raíz que trae el ESP32.
