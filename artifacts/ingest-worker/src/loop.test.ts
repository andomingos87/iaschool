import { describe, expect, it } from "vitest";
import { startLoop } from "./loop";
import type { QueueApi } from "./queue";
import type { PhotoJob, PhotoRow } from "./types";

function job(id: number): PhotoJob {
  return {
    id,
    batch_id: "b1",
    photo_id: `p${id}`,
    kind: "ingest",
    status: "leased",
    attempts: 1,
    leased_until: null,
    last_error: null,
    created_at: new Date().toISOString(),
  };
}

function photo(id: string): PhotoRow {
  return { id, school_id: "s", event_id: "e", storage_path: `s/e/${id}.jpg`, taken_at: null, deleted_at: null };
}

/** Fila fake: devolve os jobs em fatias de `claimBatch`, depois vazio. */
function fakeQueue(total: number, onClaim?: () => void): QueueApi & { claims: number[] } {
  let next = 1;
  const api = {
    claims: [] as number[],
    async claim(_kind: string, limit: number) {
      onClaim?.();
      const out: PhotoJob[] = [];
      while (out.length < limit && next <= total) out.push(job(next++));
      api.claims.push(out.length);
      return out;
    },
    async fetchPhotos(ids: string[]) {
      return new Map(ids.map((id) => [id, photo(id)]));
    },
    async complete() {
      return "done" as const;
    },
    async stalledCount() {
      return 0;
    },
  };
  return api as QueueApi & { claims: number[] };
}

const cfg = {
  concurrency: 8,
  claimBatch: 16,
  leaseSeconds: 120,
  idleBackoffMinMs: 1_000,
  idleBackoffMaxMs: 5_000,
  jobTimeoutMs: 60_000,
};

const tick = (ms = 0) => new Promise<void>((r) => setTimeout(r, ms));

describe("laço da fila", () => {
  it("processa 40 jobs em claims de 16/16/8 sem passar de 8 em voo", async () => {
    const queue = fakeQueue(40);
    const handled: number[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const sleeps: number[] = [];
    const loop = startLoop({
      queue,
      cfg,
      sleep: async (ms) => {
        sleeps.push(ms);
        await tick(1);
      },
      handle: async (j, p) => {
        expect(p?.id).toBe(j.photo_id);
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await tick(5);
        inFlight--;
        handled.push(j.id);
      },
    });
    // Espera a fila esvaziar e o laço entrar em backoff algumas vezes.
    for (let i = 0; i < 200 && sleeps.length < 3; i++) await tick(5);
    await loop.stop();

    expect(handled).toHaveLength(40);
    expect(new Set(handled).size).toBe(40);
    expect(maxInFlight).toBeLessThanOrEqual(8);
    expect(maxInFlight).toBe(8);
    expect(queue.claims.slice(0, 3)).toEqual([16, 16, 8]);
    expect(loop.lastClaimAt).not.toBeNull();
  });

  it("fila vazia: backoff dobra de 1 s até 5 s e volta a 1 s quando há trabalho", async () => {
    let served = false;
    const sleeps: number[] = [];
    const queue: QueueApi = {
      async claim(_k, limit) {
        if (sleeps.length >= 5 && !served) {
          served = true;
          return [job(1)].slice(0, limit);
        }
        return [];
      },
      async fetchPhotos(ids) {
        return new Map(ids.map((id) => [id, photo(id)]));
      },
      async complete() {
        return "done";
      },
      async stalledCount() {
        return 0;
      },
    };
    const loop = startLoop({
      queue,
      cfg,
      sleep: async (ms) => {
        sleeps.push(ms);
        await tick(1);
      },
      handle: async () => {},
    });
    for (let i = 0; i < 200 && sleeps.length < 7; i++) await tick(2);
    await loop.stop();
    expect(sleeps.slice(0, 5)).toEqual([1000, 2000, 4000, 5000, 5000]);
    // Depois de servir um job, a espera recomeça do mínimo.
    expect(sleeps[5]).toBe(1000);
  });

  it("stop() não reivindica mais e só resolve depois do último job em voo", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let claims = 0;
    const queue = fakeQueue(4, () => claims++);
    let finishedHandles = 0;
    const loop = startLoop({
      queue,
      cfg: { ...cfg, concurrency: 2, claimBatch: 4 },
      sleep: async () => tick(1),
      handle: async () => {
        await gate;
        finishedHandles++;
      },
    });
    for (let i = 0; i < 50 && loop.inFlight < 2; i++) await tick(2);
    expect(loop.inFlight).toBe(2);
    const claimsBeforeStop = claims;

    let stopped = false;
    const stopping = loop.stop().then(() => (stopped = true));
    await tick(10);
    expect(stopped).toBe(false);
    expect(loop.stopping).toBe(true);

    release();
    await stopping;
    expect(stopped).toBe(true);
    expect(finishedHandles).toBe(4);
    expect(claims).toBe(claimsBeforeStop);
    expect(loop.inFlight).toBe(0);
  });

  it("erro no claim não derruba o laço: espera e tenta de novo", async () => {
    let calls = 0;
    const errors: unknown[] = [];
    const queue: QueueApi = {
      async claim() {
        calls++;
        if (calls === 1) throw new Error("PostgREST fora");
        return [];
      },
      async fetchPhotos() {
        return new Map();
      },
      async complete() {
        return "done";
      },
      async stalledCount() {
        return 0;
      },
    };
    const loop = startLoop({
      queue,
      cfg,
      sleep: async () => tick(1),
      onError: (e) => errors.push(e),
      handle: async () => {},
    });
    for (let i = 0; i < 100 && calls < 3; i++) await tick(2);
    await loop.stop();
    expect(calls).toBeGreaterThanOrEqual(3);
    expect(errors).toHaveLength(1);
  });
});
