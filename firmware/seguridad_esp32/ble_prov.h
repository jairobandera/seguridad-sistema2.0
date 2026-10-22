#pragma once
#include <Arduino.h>

// Bluetooth de configuración (Nordic UART). Solo está encendido en modo configuración.
// Trama: JSON terminado en '\n' en ambos sentidos.
namespace ble {
void abrir(const String& deviceId, bool vinculada);
void cerrar();
bool abierto();
bool clienteConectado();
// Siguiente línea recibida de la app (sin el '\n')
bool tomarLinea(String& linea);
void enviar(const String& json);
void actualizarInfo(bool vinculada);
}  // namespace ble
