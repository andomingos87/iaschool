import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { assetPathFor, makeRenderHandler, thumbPathFor } from "./render-handler";
import type { RenderCompleteInput, RenderContext, RenderJob, RenderQueueApi } from "./render-queue";

const SCENE = { W: 200, H: 150 };

async function scene(): Promise<Buffer> {
  const raw = Buffer.alloc(SCENE.W * SCENE.H * 3, 128);
  return sharp(raw, { raw: { width: SCENE.W, height: SCENE.H, channels: 3 } })
    .jpeg({ quality: 90 })
    .toBuffer();
}

const JOB: RenderJob = {
  id: 7,
  item_id: "it1",
  batch_id: "bt1",
  status: "leased",
  attempts: 1,
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
  photoPath: "sc1/ev1/photo.jpg",
  sharpBoxes: [{ x: 10, y: 10, w: 50, h: 50 }],
};

function deps(overrides?: { downloadFails?: boolean }) {
  const completed: RenderCompleteInput[] = [];
  const uploads: Array<{ bucket: string; path: string; contentType: string }> = [];
  const queue: RenderQueueApi = {
    async claim() {
      return [];
    },
    async fetchContext() {
      return new Map();
    },
    async complete(input) {
      completed.push(input);
      return "done";
    },
  };
  const storage = {
    async download() {
      if (overrides?.downloadFails) throw new Error("download falhou");
      return scene();
    },
    async upload(bucket: string, path: string, _body: Buffer, contentType: string) {
      uploads.push({ bucket, path, contentType });
    },
  };
  return { queue, storage, completed, uploads };
}

const CFG = { blurSigma: 20, deliveryThumbSize: 120, deliveryJpegQuality: 80, thumbQuality: 80 };

describe("makeRenderHandler", () => {
  it("renderiza, sobe o derivado e a miniatura e conclui com hash e dimensões", async () => {
    const d = deps();
    const handle = makeRenderHandler({ queue: d.queue, storage: d.storage, cfg: CFG });
    await handle(JOB, CONTEXT, AbortSignal.timeout(5_000));

    expect(d.uploads).toEqual([
      { bucket: "delivery-assets", path: "sc1/bt1/rc1/it1.jpg", contentType: "image/jpeg" },
      { bucket: "delivery-assets", path: "sc1/bt1/rc1/it1.webp", contentType: "image/webp" },
    ]);
    expect(d.completed).toHaveLength(1);
    expect(d.completed[0]).toMatchObject({
      jobId: 7,
      ok: true,
      assetPath: "sc1/bt1/rc1/it1.jpg",
      thumbPath: "sc1/bt1/rc1/it1.webp",
      width: SCENE.W,
      height: SCENE.H,
    });
    expect(d.completed[0]?.assetHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("falha do Storage devolve o job à fila com erro sanitizado", async () => {
    const d = deps({ downloadFails: true });
    const handle = makeRenderHandler({ queue: d.queue, storage: d.storage, cfg: CFG });
    await handle(JOB, CONTEXT, AbortSignal.timeout(5_000));
    expect(d.completed[0]).toMatchObject({ jobId: 7, ok: false, error: "download falhou" });
  });

  it("sem contexto conclui como falha transitória, sem tocar no Storage", async () => {
    const d = deps();
    const handle = makeRenderHandler({ queue: d.queue, storage: d.storage, cfg: CFG });
    await handle(JOB, undefined, AbortSignal.timeout(5_000));
    expect(d.uploads).toHaveLength(0);
    expect(d.completed[0]).toMatchObject({ jobId: 7, ok: false, error: "contexto não encontrado" });
  });

  it("caminhos são determinísticos por destinatário e item", () => {
    expect(assetPathFor(CONTEXT)).toBe("sc1/bt1/rc1/it1.jpg");
    expect(thumbPathFor(CONTEXT)).toBe("sc1/bt1/rc1/it1.webp");
  });
});
