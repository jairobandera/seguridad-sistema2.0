#pragma once
#include <Arduino.h>
#include "almacen.h"
#include "bateria.h"

// Cliente MQTT (esp-mqtt del ESP-IDF): corre en su propia tarea, reconecta solo,
// soporta mqtt://, mqtts://, ws:// y wss://, QoS 1 y mensaje de "última voluntad".
namespace mqttmgr {

struct Comando {
  char id[48];
  char cmd[24];
};

void configurar(const String& url, const String& user, const String& pass, const String& deviceId);
void detener();
bool conectado();
// true una sola vez después de cada conexión (para publicar el estado)
bool recienConectado();
// Rechazos seguidos por usuario/clave inválidos (placa desvinculada en el servidor)
int rechazos();

int publicarEstado(bool puertaAbierta, const String& ssid, int rssi, const String& ip, const bateria::Lectura& bat);
int publicarEvento(const EventoPuerta& e);
int publicarTelemetria(int rssi, const bateria::Lectura& bat);
int publicarAck(const char* id, bool ok, const char* error);

bool tomarComando(Comando& c);
bool tomarPublicado(int& msgId);

}  // namespace mqttmgr
