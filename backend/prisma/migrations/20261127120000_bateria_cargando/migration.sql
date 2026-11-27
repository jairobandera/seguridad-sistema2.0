-- La placa avisa si el cargador de la pila está enchufado
ALTER TABLE "Dispositivo" ADD COLUMN "cargando" BOOLEAN NOT NULL DEFAULT false;
