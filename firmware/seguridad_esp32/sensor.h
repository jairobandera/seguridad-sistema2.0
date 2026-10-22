#pragma once
#include <Arduino.h>

namespace sensor {
void iniciar();
// Devuelve true si la puerta cambió de estado (ya filtrado el rebote)
bool actualizar();
bool puertaAbierta();
}  // namespace sensor
