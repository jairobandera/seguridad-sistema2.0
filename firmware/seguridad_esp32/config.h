#pragma once
// =====================================================================
// Configuración del firmware — Seguridad Residencial v2
// Protocolo: docs/protocolo.md
// =====================================================================

#define FW_VERSION "2.1.0"

// ---------------------------------------------------------------------
// Pines y ajustes de cada placa. Un solo firmware para las dos: se elige solo según la placa
// seleccionada en Arduino IDE (Herramientas > Placa). Ver firmware/README.md.
// ---------------------------------------------------------------------
#if CONFIG_IDF_TARGET_ESP32C3
// ESP32-C3 SuperMini ("ESP32C3 Dev Module", con "USB CDC On Boot: Enabled")
#define PLACA_NOMBRE "ESP32-C3 SuperMini"
#define SENSOR_PIN 10        // Reed switch a GND, con INPUT_PULLUP: imán cerca = LOW = puerta cerrada
#define BOTON_PIN 9          // Botón BOOT de la placa (LOW = apretado)
#define LED_PIN 8            // LED azul de la placa
#define LED_ENCENDIDO LOW    // en la SuperMini el LED se prende con LOW
// Batería: B+ -> 100k -> GPIO3 -> 100k -> GND. GPIO3 es ADC1 (funciona con el WiFi prendido)
#define BATERIA_PIN 3
#define CPU_MHZ_NORMAL 160   // el máximo del C3
// Muchas SuperMini tienen la antena mal diseñada y no conectan al WiFi a potencia máxima
#define WIFI_POTENCIA WIFI_POWER_8_5dBm
// Pila directo al pin 5V: su regulador necesita poco margen (A CONFIRMAR con el monitor: si se apaga con
// más de ~10 %, subilo)
#define BATERIA_MV_VACIA 3500
#else
// ESP32 clásico (DevKit de 30/38 pines, "ESP32 Dev Module")
#define PLACA_NOMBRE "ESP32"
#define SENSOR_PIN 14        // Reed switch a GND, con INPUT_PULLUP: imán cerca = LOW = puerta cerrada
#define BOTON_PIN 0          // Botón BOOT de la placa (LOW = apretado)
#define LED_PIN 2            // LED azul de la placa
#define LED_ENCENDIDO HIGH   // Si tu placa enciende el LED con LOW, cambiá esto
// Batería: B+ -> 100k -> GPIO34 -> 100k -> GND. GPIO34 es ADC1 (funciona con el WiFi prendido) y solo entrada
#define BATERIA_PIN 34
#define CPU_MHZ_NORMAL 240
// Tensión a la que la placa se apaga = 0 %. Depende de cómo llega la pila a la placa:
//   3800: pila soldada directo al pin V5 (el regulador AMS1117 necesita ~1 V de más: se apaga con media pila)
//   3300: pila -> TP4056 -> elevador MT3608 a 5 V -> pin V5 (aprovecha toda la pila)
#define BATERIA_MV_VACIA 3800
#endif

// ---------------------------------------------------------------------
// Batería 18650 (ver firmware/README.md)
// ---------------------------------------------------------------------
#define BATERIA_DIVISOR 2.0f       // (R1 + R2) / R2: con dos resistencias iguales es 2.0
// Ajuste fino con el multímetro: (lo que mide el multímetro) / (lo que dice "[bateria] ... mV"), ej. 1.03f
#define BATERIA_CALIBRACION 1.0f
#define BATERIA_LECTURAS 8         // lecturas por muestra
#define BATERIA_INTERVALO_MS 250UL // una muestra cada 250 ms...
#define BATERIA_VENTANA 40         // ...en una ventana de 10 s (descarta las caídas cuando transmite el WiFi)
#define BATERIA_HISTERESIS_PCT 3   // el % informado cambia recién con 3 puntos de diferencia
#define BATERIA_MIN_MV 3000        // por debajo: no hay batería (o está agotada y la placa ya se apaga)
#define BATERIA_MAX_MV 4400        // por encima: no es una 18650 (pin al aire o mal conectado)
#define BATERIA_RUIDO_MAX_MV 300   // dispersión máxima de las muestras para considerarla una batería real

// ---------------------------------------------------------------------
// Backend por defecto. Normalmente la app manda su URL al configurar la placa,
// así que esto solo se usa si la app no la envía.
// ---------------------------------------------------------------------
#define API_URL_DEFECTO "http://192.168.1.75:3000"

// ---------------------------------------------------------------------
// Tiempos (ms)
// ---------------------------------------------------------------------
#define ANTIRREBOTE_MS 50UL
#define TELEMETRIA_MS 60000UL

// Monitor serial por internet (panel del admin): ver consola.h
#define MONITOR_BUFFER 3072           // bytes de lo último impreso que se guardan
#define MONITOR_TROZO 900             // bytes por mensaje MQTT
#define MONITOR_ENVIO_MS 500UL        // cada cuánto se manda lo acumulado
#define MONITOR_DURACION_MS 180000UL  // se apaga solo si el servidor no lo renueva
#define MONITOR_BATERIA_MS 10000UL    // con el monitor abierto, la línea de batería sale cada 10 s
#define WIFI_TIMEOUT_SETUP_MS 20000UL
#define MQTT_TIMEOUT_SETUP_MS 15000UL
#define PROVISION_INTENTOS 3          // si no llega la respuesta del servidor, se repite el canje
#define PROVISION_ESPERA_MS 2000UL
#define MODO_CONFIG_MS (10UL * 60UL * 1000UL)      // ventana BLE al apretar BOOT o por comando
#define WIFI_CAIDO_ABRE_BLE_MS (5UL * 60UL * 1000UL) // WiFi caído este tiempo -> abre BLE (cambio de router)
#define BOTON_CONFIG_MS 5000UL
#define BOTON_RESET_MS 15000UL
#define WATCHDOG_MS 30000UL
#define MQTT_KEEPALIVE_SEG 30
#define MQTT_RECHAZOS_DESVINCULAR 20                // CONNACK "no autorizado" seguidos (~2 min) -> se considera desvinculada

// Hibernación con la alarma desarmada (ver energia.h)
// (CPU_MHZ_NORMAL depende de la placa: arriba)
#define CPU_MHZ_AHORRO 80

#define COLA_MAX_EVENTOS 32
#define ZONA_HORARIA "<-03>3"                       // Argentina / Uruguay (UTC-3)

// ---------------------------------------------------------------------
// BLE (Nordic UART Service)
// ---------------------------------------------------------------------
#define BLE_SERVICIO_UUID "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define BLE_RX_UUID "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"
#define BLE_TX_UUID "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"
#define BLE_INFO_UUID "6E400004-B5A3-F393-E0A9-E50E24DCCA9E"
#define BLE_MTU 185
#define BLE_MAX_LINEA 1024
