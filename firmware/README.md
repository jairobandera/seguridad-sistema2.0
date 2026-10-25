# Firmware ESP32 — Seguridad Residencial v2

## Conexiones (las mismas de siempre)
| Elemento | Pin |
|---|---|
| Sensor magnético (reed switch) | **GPIO14** y **GND** (usa la resistencia interna pull-up) |
| Botón de configuración | botón **BOOT** de la placa (GPIO0), no hay que soldar nada |
| LED de estado | LED azul de la placa (GPIO2) |

Imán cerca = puerta **cerrada**. Si se corta el cable del sensor, la placa lo toma como **abierta** (falla segura).

## Batería 18650 (opcional)
El firmware ya mide la batería y la app muestra el **%** apenas está conectada. Sin batería no se muestra nada.

### Qué comprar
| Componente | Para qué |
|---|---|
| Celda **18650** (3.7 V) + portapila | La batería |
| Módulo **TP4056** (el que tiene protección: 6 pines, con chip DW01) | Cargarla por USB y protegerla |
| Elevador **MT3608** (o similar) regulado a **5 V** | La 18650 sola (3.0–4.2 V) **no** alcanza para el pin VIN de la placa |
| 2 resistencias de **100 kΩ** | Divisor para medir la tensión |
| 1 capacitor de **100 nF** (opcional) | Estabiliza la medición |

### Cómo se conecta
```
18650 (+) ──► TP4056 B+          18650 (–) ──► TP4056 B–

TP4056 OUT+ ──► MT3608 IN+ ──(regular a 5,0 V con el tornillito ANTES de conectar)──► MT3608 OUT+ ──► ESP32 VIN
TP4056 OUT– ──► MT3608 IN– ─────────────────────────────────────────────────────► MT3608 OUT– ──► ESP32 GND

Medición (divisor):
TP4056 OUT+ ──[100 kΩ]──┬──► ESP32 GPIO34
                        ├──[100 kΩ]──► GND
                        └──[100 nF]──► GND   (opcional)
```
- El divisor reduce la tensión a la mitad: 4,2 V de la batería llegan como 2,1 V al pin, que es seguro para el ESP32.
- **GPIO34** porque funciona con el WiFi prendido (es del ADC1). No uses pines del ADC2 (GPIO 0, 2, 4, 12–15, 25–27).
- Con el multímetro, ajustá el MT3608 a **5,0 V** antes de conectarlo a la placa.
- La batería se carga enchufando USB al **TP4056** (luz roja = cargando, azul/verde = cargada).

### Cómo comprobarlo
En el Monitor Serie (115200) aparece cada 60 s:
```
[bateria] 3912 mV (72 %)
```
Compará los mV con el multímetro en la batería: tienen que dar parecido (±100 mV).
Si no aparece la línea, la placa no detecta batería: revisá el divisor (con la batería conectada, GPIO34 tiene que medir la mitad de la batería).
Si tu divisor usa otras resistencias, cambiá `BATERIA_DIVISOR` en `config.h` por `(R1 + R2) / R2`.

**Lo que importa es que las dos resistencias sean iguales**, no su valor exacto: con dos de 82 kΩ (o dos de 68 kΩ,
47 kΩ…) el divisor sigue siendo `2.0` y no hay que tocar nada. Si son distintas (ej. arriba 82 kΩ y abajo 85 kΩ):
`(82 + 85) / 85 = 1.96` → poné `#define BATERIA_DIVISOR 1.96f`. Con valores entre 47 kΩ y 220 kΩ el consumo del divisor
es despreciable (unos 25 µA con 82 kΩ).

### Por qué el % puede variar y cómo se calibra
Una 18650 baja de tensión por un instante cada vez que el WiFi transmite, y entre 80 % y 60 % hay apenas 0,15 V:
una caída de 0,1 V se veía como 10–15 % menos. Por eso la placa mide en una **ventana de 10 s** (una muestra cada
250 ms), usa la franja alta de las muestras (sin las caídas del WiFi), suaviza entre reportes y el % cambia recién con
**3 puntos** de diferencia.

Recién sacada del cargador es normal que marque ~90–95 %: la tensión baja enseguida de 4,2 V a ~4,1 V.

**Calibrar con el multímetro** (opcional): con la placa funcionando, medí la batería (B+ y B−) y compará con la línea
`[bateria] XXXX mV` del Monitor Serie. En `config.h`:
```
#define BATERIA_CALIBRACION 1.02f   // = multímetro / lo que dice la placa (ej. 4080 / 4000)
```

## Hibernación (ahorro de energía con la alarma desarmada)
Con la alarma **desarmada**, el servidor le manda a la placa el comando `ahorro` y la placa:
- baja el procesador de 240 MHz a **80 MHz** (el mínimo con el que funciona el WiFi);
- pone el WiFi en **ahorro máximo** (la radio duerme entre las señales del router);
- apaga el destello de "todo OK" del LED.

Sigue igual: el WiFi conectado, el sensor de la puerta (se ve abierta/cerrada en vivo), el MQTT y la batería.
Al **armar**, vuelve a modo normal. Con el Bluetooth abierto (configurar/cambiar WiFi) no hiberna.
En el Monitor Serie se ve `[energia] ahorro activado (CPU 80 MHz)` / `[energia] modo normal (CPU 240 MHz)`.

> Ahorro esperado: entre un 20 y un 35 % menos de consumo con la alarma desarmada (depende del router).
> Medilo con un multímetro en serie con la batería para tener el número real de tu placa.

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
