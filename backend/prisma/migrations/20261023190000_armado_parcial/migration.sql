-- Armado parcial: dispositivo que quedó afuera de la alarma en el armado actual
ALTER TABLE `Dispositivo` ADD COLUMN `excluidoAlarma` BOOLEAN NOT NULL DEFAULT false;
