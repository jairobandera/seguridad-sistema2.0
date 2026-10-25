#pragma once
#include <Arduino.h>

// Batería 18650 medida con un divisor de tensión (100k/100k) en BATERIA_PIN.
// Si no hay batería conectada (pin al aire o en 0 V) se informa como "sin batería".
namespace bateria {

struct Lectura {
  int mv = 0;    // tensión de la batería en milivoltios
  int pct = -1;  // 0-100, o -1 si no hay batería
};

void iniciar();
// En cada loop: toma una muestra cada 250 ms (no bloquea)
void actualizar();
// Tensión estable de la ventana de 10 s (sin las caídas del WiFi), suavizada y con histéresis
Lectura medir();

}  // namespace bateria
