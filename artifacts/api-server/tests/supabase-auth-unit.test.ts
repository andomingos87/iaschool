// Teste unitário do middleware requireSupabaseUser SEM Supabase real.
// Simula timeout e queda de rede mockando global.fetch e confirma que a
// resposta é 503 com o campo `code` padronizado.
import express from "express";
import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { requireSupabaseUser } from "../src/middlewares/supabase-auth";

let server: Server;
let baseUrl: string;
const realFetch = global.fetch;

beforeAll(async () => {
  // Config falsa: basta existir para o middleware sair do modo demonstração.
  vi.stubEnv("SUPABASE_URL", "https://fake-project.supabase.co");
  vi.stubEnv("SUPABASE_ANON_KEY", "fake-anon-key");

  const app = express();
  app.use((req, _res, next) => {
    (req as unknown as { log: unknown }).log = {
      warn: () => undefined,
      error: () => undefined,
      info: () => undefined,
    };
    next();
  });
  app.post("/api/generation/post-image", requireSupabaseUser, (_req, res) => {
    res.json({ ok: true });
  });
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("porta inválida");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(() => {
  global.fetch = realFetch;
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

async function callGeneration(): Promise<{ status: number; body: { code?: string; error?: string } }> {
  const resp = await realFetch(`${baseUrl}/api/generation/post-image`, {
    method: "POST",
    headers: { Authorization: "Bearer token-falso" },
  });
  return { status: resp.status, body: (await resp.json()) as { code?: string; error?: string } };
}

describe("requireSupabaseUser — Supabase fora do ar (fetch mockado)", () => {
  it("timeout (AbortSignal) → 503 com code=supabase_timeout", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("fake-project.supabase.co")) {
        const err = new Error("The operation was aborted due to timeout");
        err.name = "TimeoutError";
        throw err;
      }
      return realFetch(input, init);
    }) as typeof fetch;

    const { status, body } = await callGeneration();
    expect(status).toBe(503);
    expect(body.code).toBe("supabase_timeout");
    expect(body.error).toBeTruthy();
  });

  it("falha de rede genérica → 503 com code=supabase_unavailable", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("fake-project.supabase.co")) {
        throw new TypeError("fetch failed");
      }
      return realFetch(input, init);
    }) as typeof fetch;

    const { status, body } = await callGeneration();
    expect(status).toBe(503);
    expect(body.code).toBe("supabase_unavailable");
    expect(body.error).toBeTruthy();
  });
});
