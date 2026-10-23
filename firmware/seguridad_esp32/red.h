#pragma once
#include <Arduino.h>

namespace red {

enum class ResultadoWifi { EN_CURSO, OK, CLAVE_INCORRECTA, RED_NO_ENCONTRADA, TIMEOUT };

void iniciar();
// Conexión normal con reconexión automática
void conectar(const String& ssid, const String& pass);
void actualizar();
bool conectado();
// ms que lleva caído el WiFi (0 si está conectado o no hay red configurada)
unsigned long caidoHace();

// Prueba una red nueva (para el asistente de la app) sin bloquear
void probar(const String& ssid, const String& pass);
ResultadoWifi resultadoPrueba();
const char* motivo(ResultadoWifi r);

// Escaneo asíncrono: -1 en curso, -2 sin escaneo/falló, >=0 cantidad de redes
void iniciarEscaneo();
int escaneoListo();
String redesJson(int cantidad);  // {"r":"redes","lista":[...]} y libera el escaneo

String ssidActual();
int rssi();
String ip();
bool horaValida();

struct RespuestaProvision {
  int http = 0;  // 0 = no se pudo conectar; -1 = no llegó la respuesta
  String error;
  String mqttUrl, mqttUser, mqttPass;
};
RespuestaProvision provisionar(const String& api, const String& deviceId, const String& codigo, const String& secretHex);

}  // namespace red
