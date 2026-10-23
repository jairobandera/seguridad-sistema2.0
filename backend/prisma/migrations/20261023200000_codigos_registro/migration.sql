-- Códigos para que los usuarios se registren solos: por barrio (vecinos) y por casa (familiares)
ALTER TABLE `Barrio` ADD COLUMN `codigoRegistro` VARCHAR(191) NULL;
ALTER TABLE `Casa` ADD COLUMN `codigoFamilia` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `Barrio_codigoRegistro_key` ON `Barrio`(`codigoRegistro`);
CREATE UNIQUE INDEX `Casa_codigoFamilia_key` ON `Casa`(`codigoFamilia`);
