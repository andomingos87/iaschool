import { describe, expect, it } from "vitest";
import { healthReport, startHealthServer, type HealthState } from "./health";

function state(over: Partial<Record<keyof HealthState, unknown>> = {}): HealthState {
  const now = Date.now();
  return {
    inFlight: () => 0,
    lastClaimAt: () => now,
    lastTickAt: () => now,
    stalledCount: () => 0,
    stopping: () => false,
    ...(over as Partial<HealthState>),
  };
}

describe("healthReport", () => {
  it("200 quando o laço está vivo e nada está parado", () => {
    const r = healthReport(state(), { loopStaleMs: 60_000 });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, inFlight: 0, stalled: 0 });
  });

  it("503 stalled_batches quando a view aponta lote parado com job pendente", () => {
    const r = healthReport(state({ stalledCount: () => 2 }), { loopStaleMs: 60_000 });
    expect(r.status).toBe(503);
    expect(r.body).toMatchObject({ ok: false, reason: "stalled_batches", stalled: 2 });
  });

  it("503 loop_stale quando o laço não deu tick há mais que o limite", () => {
    const r = healthReport(state({ lastTickAt: () => Date.now() - 120_000 }), { loopStaleMs: 60_000 });
    expect(r.status).toBe(503);
    expect(r.body).toMatchObject({ reason: "loop_stale" });
  });

  it("503 stopping durante o encerramento", () => {
    const r = healthReport(state({ stopping: () => true }), { loopStaleMs: 60_000 });
    expect(r.body).toMatchObject({ reason: "stopping" });
  });

  it("ainda sem consulta à view (null) conta como 0", () => {
    const r = healthReport(state({ stalledCount: () => null }), { loopStaleMs: 60_000 });
    expect(r.status).toBe(200);
  });
});

describe("servidor HTTP", () => {
  it("responde /health e 404 no resto", async () => {
    const h = startHealthServer(0, state(), { loopStaleMs: 60_000, host: "127.0.0.1" });
    await new Promise<void>((r) => h.server.once("listening", () => r()));
    try {
      const ok = await fetch(`http://127.0.0.1:${h.port()}/health`);
      expect(ok.status).toBe(200);
      expect(await ok.json()).toMatchObject({ ok: true });
      const nf = await fetch(`http://127.0.0.1:${h.port()}/outra`);
      expect(nf.status).toBe(404);
    } finally {
      await h.close();
    }
  });
});
