// Testes de unidade do circuito de proteção da cota diária persistida.
// Mocka o fetch global para simular banco fora do ar e verifica que:
//   - falhas isoladas → "unavailable" (fallback em memória)
//   - falhas repetidas (>= limiar) → "outage" (fail-closed)
//   - sucesso zera o circuito
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  consumeDailyQuota,
  QUOTA_OUTAGE_THRESHOLD,
  resetQuotaCircuit,
} from "../src/lib/generation-quota";

const realFetch = globalThis.fetch;

beforeEach(() => {
  resetQuotaCircuit();
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  globalThis.fetch = realFetch;
});

function mockFetchFailure() {
  globalThis.fetch = vi.fn(async () => {
    throw new Error("ECONNREFUSED");
  }) as unknown as typeof fetch;
}

function mockFetchOk(count: number) {
  globalThis.fetch = vi.fn(
    async () => new Response(JSON.stringify(count), { status: 200 }),
  ) as unknown as typeof fetch;
}

describe("circuito da cota persistida", () => {
  it("falha isolada retorna unavailable (fallback em memória)", async () => {
    mockFetchFailure();
    const result = await consumeDailyQuota("user-1", 50);
    expect(result.kind).toBe("unavailable");
  });

  it("falhas repetidas atingem o limiar e retornam outage (fail-closed)", async () => {
    mockFetchFailure();
    let last = await consumeDailyQuota("user-1", 50);
    for (let i = 1; i < QUOTA_OUTAGE_THRESHOLD; i++) {
      last = await consumeDailyQuota("user-1", 50);
    }
    expect(last.kind).toBe("outage");
    if (last.kind === "outage") {
      expect(last.failures).toBeGreaterThanOrEqual(QUOTA_OUTAGE_THRESHOLD);
    }
    // Continua em outage enquanto o banco não voltar.
    const next = await consumeDailyQuota("user-1", 50);
    expect(next.kind).toBe("outage");
  });

  it("sucesso zera o circuito", async () => {
    mockFetchFailure();
    for (let i = 0; i < QUOTA_OUTAGE_THRESHOLD - 1; i++) {
      await consumeDailyQuota("user-1", 50);
    }
    mockFetchOk(1);
    const ok = await consumeDailyQuota("user-1", 50);
    expect(ok).toEqual({ kind: "ok", count: 1 });
    // Uma nova falha isolada volta a ser unavailable, não outage.
    mockFetchFailure();
    const result = await consumeDailyQuota("user-1", 50);
    expect(result.kind).toBe("unavailable");
  });

  it("config ausente é unavailable e não conta para o circuito", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    for (let i = 0; i < QUOTA_OUTAGE_THRESHOLD + 2; i++) {
      const result = await consumeDailyQuota("user-1", 50);
      expect(result.kind).toBe("unavailable");
    }
  });
});
