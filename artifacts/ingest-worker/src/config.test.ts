import { describe, expect, it } from "vitest";
import { loadConfig } from "./config";

const BASE = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "srk" };

describe("loadConfig", () => {
  it("lista as variáveis obrigatórias ausentes", () => {
    expect(() => loadConfig({})).toThrow(/SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY/);
    expect(() => loadConfig({ SUPABASE_URL: "u" })).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("aplica os padrões da spec (concorrência 8, miniatura 320, porta 8080)", () => {
    const cfg = loadConfig(BASE);
    expect(cfg.concurrency).toBe(8);
    expect(cfg.claimBatch).toBe(16);
    expect(cfg.leaseSeconds).toBe(120);
    expect(cfg.port).toBe(8080);
    expect(cfg.thumbSize).toBe(320);
    expect(cfg.thumbQuality).toBe(80);
    expect(cfg.idleBackoffMinMs).toBe(1_000);
    expect(cfg.idleBackoffMaxMs).toBe(5_000);
  });

  it("lê inteiros do ambiente e recusa lixo", () => {
    expect(loadConfig({ ...BASE, WORKER_CONCURRENCY: "4", PORT: "9090" })).toMatchObject({ concurrency: 4, port: 9090 });
    expect(() => loadConfig({ ...BASE, WORKER_CONCURRENCY: "muitos" })).toThrow(/WORKER_CONCURRENCY/);
    expect(() => loadConfig({ ...BASE, CLAIM_BATCH: "0" })).toThrow(/CLAIM_BATCH/);
  });
});
