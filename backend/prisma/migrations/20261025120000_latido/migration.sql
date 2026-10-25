-- Latido: una fila que /api/salud actualiza en cada llamada (actividad real para que la base no se apague)
CREATE TABLE `Latido` (
    `id` INTEGER NOT NULL,
    `ultimo` DATETIME(3) NOT NULL,
    `llamadas` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
