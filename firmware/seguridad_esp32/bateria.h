#pragma once
#include <Arduino.h>

// Batería 18650 medida con un divisor de tensión (100k/100k) en BATERIA_PIN.
// Si no hay batería conectada (pin al aire o en 0 V) se informa como "sin batería".
namespace bateria {

struct Lectura {
  int mv = 0;             // tensión de la batería en milivoltios
  int pct = -1;           // 0-100, o -1 si no hay batería
  bool cargando = false;  // el cargador (TP4056) está enchufado
};

void iniciar();
// En cada loop: toma una muestra cada 250 ms (no bloquea)
void actualizar();
// Tensión estable de la ventana de 10 s (sin las caídas del WiFi) y el % como en un celular:
// cargando sube de a poco, sin cargador solo baja
Lectura medir();

}  // namespace bateria
