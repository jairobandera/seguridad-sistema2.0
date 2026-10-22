import { defineConfig } from "vitest/config";

// Los tests usan una base MySQL aparte (por defecto la de XAMPP: seguridad_test).
const TEST_DB = process.env.TEST_DATABASE_URL ?? "mysql://root:@localhost:3306/seguridad_test";

export default defineConfig({
  test: {
    environment: "node",
    globalSetup: ["./test/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: TEST_DB,
      JWT_SECRET: "secreto-de-test-con-mas-de-32-caracteres-ok",
      DEVICE_SECRET_KEY: "11".repeat(32),
      MQTT_PUBLIC_URL: "mqtt://localhost:1885",
      DEVICE_OFFLINE_GRACIA_SEG: "0",
      SMS_MINUTOS_ENTRE_ALERTAS: "5",
    },
  },
});
