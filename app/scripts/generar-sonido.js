// Genera assets/sounds/alarma.wav: sirena de 3 s (barrido 650↔1300 Hz), WAV PCM 16 bits mono.
// Uso: node scripts/generar-sonido.js
const fs = require("fs");
const path = require("path");

const frecuenciaMuestreo = 22050;
const duracion = 3;
const n = frecuenciaMuestreo * duracion;
const datos = Buffer.alloc(n * 2);
let fase = 0;
for (let i = 0; i < n; i++) {
  const t = i / frecuenciaMuestreo;
  const ciclo = (t % 0.6) / 0.6; // sube y baja cada 0,6 s
  const tri = ciclo < 0.5 ? ciclo * 2 : 2 - ciclo * 2;
  const f = 650 + 650 * tri;
  fase += (2 * Math.PI * f) / frecuenciaMuestreo;
  const envolvente = Math.min(1, t / 0.02, (duracion - t) / 0.05);
  // Onda cuadrada suavizada: más audible que una senoidal
  const muestra = Math.tanh(3 * Math.sin(fase)) * 0.8 * envolvente;
  datos.writeInt16LE(Math.round(muestra * 32767), i * 2);
}

const cabecera = Buffer.alloc(44);
cabecera.write("RIFF", 0);
cabecera.writeUInt32LE(36 + datos.length, 4);
cabecera.write("WAVE", 8);
cabecera.write("fmt ", 12);
cabecera.writeUInt32LE(16, 16);
cabecera.writeUInt16LE(1, 20);
cabecera.writeUInt16LE(1, 22);
cabecera.writeUInt32LE(frecuenciaMuestreo, 24);
cabecera.writeUInt32LE(frecuenciaMuestreo * 2, 28);
cabecera.writeUInt16LE(2, 32);
cabecera.writeUInt16LE(16, 34);
cabecera.write("data", 36);
cabecera.writeUInt32LE(datos.length, 40);

const destino = path.join(__dirname, "..", "assets", "sounds", "alarma.wav");
fs.writeFileSync(destino, Buffer.concat([cabecera, datos]));
console.log("Generado", destino);
