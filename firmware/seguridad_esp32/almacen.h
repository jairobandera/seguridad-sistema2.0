#pragma once
#include <Arduino.h>

// Datos persistentes en flash (NVS). Nunca se imprimen claves por Serial.

struct EventoPuerta {
  uint32_t seq;
  uint32_t ts;      // segundos Unix, 0 = sin hora
  uint8_t abierta;  // 1 abierta, 0 cerrada
};

namespace almacen {
void iniciar();

String ssid();
String pass();
void guardarWifi(const String& ssid, const String& pass);

String apiUrl();
void guardarApiUrl(const String& url);

bool vinculada();
String mqttUrl();
String mqttUser();
String mqttPass();
void guardarMqtt(const String& url, const String& user, const String& pass);
void borrarVinculacion();

// Secreto de 32 bytes compartido con el backend (se genera una sola vez)
const uint8_t* secreto();
String secretoHex();

uint32_t siguienteSeq();
void reiniciarSeq();

// Cola de eventos pendientes de enviar (sobrevive reinicios)
bool colaVacia();
size_t colaTamano();
EventoPuerta colaPrimero();
void colaAgregar(const EventoPuerta& e);
void colaQuitarPrimero();
void colaVaciar();

void borrarTodo();
}  // namespace almacen
