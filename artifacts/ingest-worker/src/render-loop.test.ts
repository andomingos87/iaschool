import { describe, expect, it } from "vitest";
import { startRenderLoop } from "./render-loop";
import type { RenderContext, RenderJob, RenderQueueApi } from "./render-queue";

const JOB: RenderJob = {
  id: 1,
  item_id: "it1",
  batch_id: "bt1",
  status: "queued",
  attempts: 0,
  leased_until: null,
  last_error: null,
  created_at: new Date().toISOString(),
};

const CONTEXT: RenderContext = {
  itemId: "it1",
  batchId: "bt1",
  schoolId: "sc1",
  eventId: "ev1",
  recipientId: "rc1",
  photoPath: "p.jpg",
  sharpBoxes: [],
};

const CFG = {
  concurrency: 1,
  claimBatch: 4,
  leaseSeconds: 60,
  idleBackoffMinMs: 1,
  idleBackoffMaxMs: 2,
  jobTimeoutMs: 5_000,
};

describe("startRenderLoop", () => {
  it("processa cada job reivindicado com o contexto e encerra no stop", async () => {
    let claims = 0;
    const handled: number[] = [];
    const queue: RenderQueueApi = {
      async claim() {
        claims++;
        return claims === 1 ? [JOB] : [];
      },
      async fetchContext() {
        return new Map([[JOB.id, CONTEXT]]);
      },
      async complete() {
        return "done";
      },
    };

    const loop = startRenderLoop({
      queue,
      cfg: CFG,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      handle: async (job, context) => {
        expect(context).toEqual(CONTEXT);
        handled.push(job.id);
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    await loop.stop();
    expect(handled).toEqual([JOB.id]);
    expect(loop.stopping).toBe(true);
    expect(loop.inFlight).toBe(0);
  });
});
