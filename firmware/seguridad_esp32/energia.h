#pragma once
#include <Arduino.h>

// Hibernación (modo ahorro): con la alarma desarmada el servidor manda {"cmd":"ahorro","activo":true}.
// Baja el procesador a 80 MHz y pone el WiFi en ahorro máximo. El WiFi, el MQTT, el sensor de la puerta
// y la batería siguen funcionando igual (la puerta se ve en vivo y la placa se entera al armar).
// Con el Bluetooth abierto no se aplica: necesita la radio y el procesador en modo normal.
namespace energia {
void pedirAhorro(bool activo);  // lo que pide el servidor
void bluetoothAbierto(bool abierto);
bool enAhorro();                // lo que está aplicado ahora
}  // namespace energia
