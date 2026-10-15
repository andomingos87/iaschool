// Config dedicada do Vitest: não reutiliza o vite.config.ts do app,
// que exige a variável de ambiente PORT (só faz sentido para o dev server).
// A suíte de integração lê o Supabase do .env.local da raiz. Variável já
// exportada no processo ganha; o arquivo não é impresso.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fileEnv = loadEnv("development", repoRoot, "");
for (const [key, value] of Object.entries(fileEnv)) {
  if (process.env[key] === undefined) process.env[key] = value;
}

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
