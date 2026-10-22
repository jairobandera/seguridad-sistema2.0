#pragma once
// =====================================================================
// Configuración del firmware — Seguridad Residencial v2
// Protocolo: docs/protocolo.md
// =====================================================================

#define FW_VERSION "2.0.0"

// ---------------------------------------------------------------------
// Pines (los mismos del firmware anterior)
// ---------------------------------------------------------------------
#define SENSOR_PIN 14        // Reed switch a GND, con INPUT_PULLUP: imán cerca = LOW = puerta cerrada
#define BOTON_PIN 0          // Botón BOOT de la placa (LOW = apretado)
#define LED_PIN 2            // LED azul de la placa
#define LED_ENCENDIDO HIGH   // Si tu placa enciende el LED con LOW, cambiá esto

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
#define WIFI_TIMEOUT_SETUP_MS 20000UL
#define MQTT_TIMEOUT_SETUP_MS 15000UL
#define MODO_CONFIG_MS (10UL * 60UL * 1000UL)      // ventana BLE al apretar BOOT o por comando
#define WIFI_CAIDO_ABRE_BLE_MS (5UL * 60UL * 1000UL) // WiFi caído este tiempo -> abre BLE (cambio de router)
#define BOTON_CONFIG_MS 5000UL
#define BOTON_RESET_MS 15000UL
#define WATCHDOG_MS 30000UL
#define MQTT_KEEPALIVE_SEG 30
#define MQTT_RECHAZOS_DESVINCULAR 3                 // CONNACK "no autorizado" seguidos -> se considera desvinculada

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
