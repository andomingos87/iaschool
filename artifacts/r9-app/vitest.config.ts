// Config dedicada do Vitest: não reutiliza o vite.config.ts do app,
// que exige a variável de ambiente PORT (só faz sentido para o dev server).
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
