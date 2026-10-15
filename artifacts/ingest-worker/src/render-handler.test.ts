import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { assetPathFor, makeRenderHandler, thumbPathFor } from "./render-handler";
import type { RenderCompleteInput, RenderContext, RenderJob, RenderQueueApi } from "./render-queue";

const logs = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock("./logger", () => ({ jobLogger: () => logs }));
beforeEach(() => vi.clearAllMocks());

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
  lease_version: 1,
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
  draftVersion: 1,
  review: { regionsVersion: 1, reviewedVersion: 1, allPeopleReviewed: true, width: 200, height: 150, detectedFaceIds: [], authorizedStudentIds: [], regions: [{kind: "protected_unknown", studentId: null,faceId:null,shape:"rect",points:[10,10,50,50],reviewedBy:"u1",reviewedAt:"2026-10-12T00:00:00Z"}] },
};

function deps(overrides?: { downloadFails?: boolean; uploadFailsAt?: number; image?: Buffer; afterDownload?: () => void; afterUpload?: () => void }) {
  const completed: RenderCompleteInput[] = [];
  const uploads: Array<{ bucket: string; path: string; contentType: string }> = [];
  let downloads = 0;
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
      downloads++;
      if (overrides?.downloadFails) throw new Error("private/photo.jpg?token=sensitive aluno privado");
      overrides?.afterDownload?.();
      return overrides?.image ?? scene();
    },
    async upload(bucket: string, path: string, _body: Buffer, contentType: string) {
      uploads.push({ bucket, path, contentType });
      if (uploads.length === overrides?.uploadFailsAt) throw new Error("private storage sensitive token");
      overrides?.afterUpload?.();
    },
  };
  return { queue, storage, completed, uploads, get downloads() { return downloads; } };
}

const CFG = { blurSigma: 20, deliveryThumbSize: 120, deliveryJpegQuality: 80, thumbQuality: 80 };

describe("makeRenderHandler", () => {
  it("renderiza, sobe o derivado e a miniatura e conclui com hash e dimensões", async () => {
    const d = deps();
    const handle = makeRenderHandler({ queue: d.queue, storage: d.storage, cfg: CFG });
    await handle(JOB, CONTEXT, AbortSignal.timeout(5_000));

    expect(d.uploads).toEqual([
      { bucket: "delivery-assets", path: "sc1/bt1/rc1/it1/v1-r1-a1.jpg", contentType: "image/jpeg" },
      { bucket: "delivery-assets", path: "sc1/bt1/rc1/it1/v1-r1-a1.webp", contentType: "image/webp" },
    ]);
    expect(d.completed).toHaveLength(1);
    expect(d.completed[0]).toMatchObject({
      jobId: 7,
      ok: true,
      assetPath: "sc1/bt1/rc1/it1/v1-r1-a1.jpg",
      thumbPath: "sc1/bt1/rc1/it1/v1-r1-a1.webp",
      width: SCENE.W,
      height: SCENE.H,
    });
    expect(d.completed[0]?.assetHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("prepara foto original sem regiões nem revisão e fixa a política na conclusão", async () => {
    const d = deps();
    const { review: _review, ...base } = CONTEXT;
    await makeRenderHandler({ queue: d.queue, storage: d.storage, cfg: CFG })(JOB,
      { ...base, renderPolicy: "original_v1" }, AbortSignal.timeout(5_000));
    expect(d.completed[0]).toMatchObject({ ok: true, renderPolicy: "original_v1", leaseVersion: 1,
      assetPath: "sc1/bt1/rc1/it1/v1-original_v1-a1.jpg", thumbPath: "sc1/bt1/rc1/it1/v1-original_v1-a1.webp" });
    expect(d.completed[0]?.regionsVersion).toBeUndefined();
    expect(d.uploads).toHaveLength(2);
  });

  it("falha do Storage devolve o job à fila com erro sanitizado", async () => {
    const d = deps({ downloadFails: true });
    const handle = makeRenderHandler({ queue: d.queue, storage: d.storage, cfg: CFG });
    await handle(JOB, CONTEXT, AbortSignal.timeout(5_000));
    expect(d.completed[0]).toMatchObject({ jobId: 7, ok: false, error: "render_download_falhou" });
    expect(JSON.stringify(d.completed)).not.toContain("sensitive");
    expect(logs.warn).toHaveBeenCalledWith(expect.objectContaining({ err: "render_download_falhou" }), expect.any(String));
    expect(JSON.stringify(logs.warn.mock.calls)).not.toContain("sensitive");
    expect(JSON.stringify(logs.warn.mock.calls)).not.toContain("private/photo");
  });

  it("falha parcial informa caminhos isolados por lease para expurgo", async () => {
    const d = deps({ uploadFailsAt: 2 });
    await makeRenderHandler({ queue: d.queue, storage: d.storage, cfg: CFG })(JOB, CONTEXT, AbortSignal.timeout(5_000));
    expect(d.completed[0]).toMatchObject({ ok: false, error: "render_upload_falhou", leaseVersion: 1,
      assetPath: "sc1/bt1/rc1/it1/v1-r1-a1.jpg", thumbPath: "sc1/bt1/rc1/it1/v1-r1-a1.webp" });
  });

  it("sem contexto conclui como falha transitória, sem tocar no Storage", async () => {
    const d = deps();
    const handle = makeRenderHandler({ queue: d.queue, storage: d.storage, cfg: CFG });
    await handle(JOB, undefined, AbortSignal.timeout(5_000));
    expect(d.uploads).toHaveLength(0);
    expect(d.completed[0]).toMatchObject({ jobId: 7, ok: false, error: "render_contexto_indisponivel", leaseVersion: 1 });
  });

  it("revisão pendente é distinta de imagem inválida e não sobe arquivos", async () => {
    const d = deps();
    await makeRenderHandler({ queue: d.queue, storage: d.storage, cfg: CFG })(JOB,
      { ...CONTEXT, review: { ...CONTEXT.review, reviewedVersion: 0 } }, AbortSignal.timeout(5_000));
    expect(d.completed[0]).toMatchObject({ ok: false, error: "render_revisao_pendente" });
    expect(d.uploads).toHaveLength(0);
    expect(d.downloads).toBe(0);
  });

  it("foto sem atestação nem regiões falha antes do download mesmo que Storage falharia", async () => {
    const d = deps({ downloadFails: true });
    await makeRenderHandler({ queue: d.queue, storage: d.storage, cfg: CFG })(JOB,
      { ...CONTEXT, review: { ...CONTEXT.review, allPeopleReviewed: false, regions: [] } }, AbortSignal.timeout(5_000));
    expect(d.completed[0]).toMatchObject({ ok: false, error: "render_revisao_pendente" });
    expect(d.downloads).toBe(0);
  });

  it.each([Buffer.from("private image text sensitive"), Buffer.alloc(0)])("imagem ilegível recebe código seguro", async (image) => {
    const d = deps({ image });
    await makeRenderHandler({ queue: d.queue, storage: d.storage, cfg: CFG })(JOB, CONTEXT, AbortSignal.timeout(5_000));
    expect(d.completed[0]).toMatchObject({ ok: false, error: "render_imagem_invalida" });
    expect(JSON.stringify(d.completed)).not.toContain("sensitive");
    expect(d.uploads).toHaveLength(0);
  });

  it("timeout após download impede render e upload", async () => {
    const controller = new AbortController();
    const d = deps({ afterDownload: () => controller.abort() });
    await makeRenderHandler({ queue: d.queue, storage: d.storage, cfg: CFG })(JOB, CONTEXT, controller.signal);
    expect(d.completed[0]).toMatchObject({ ok: false, error: "render_timeout" });
    expect(d.uploads).toHaveLength(0);
  });

  it("timeout após subir derivado impede sucesso e mantém caminhos para expurgo", async () => {
    const controller = new AbortController();
    const d = deps({ afterUpload: () => controller.abort() });
    await makeRenderHandler({ queue: d.queue, storage: d.storage, cfg: CFG })(JOB, CONTEXT, controller.signal);
    expect(d.completed[0]).toMatchObject({ ok: false, error: "render_timeout", leaseVersion: 1,
      assetPath: assetPathFor(CONTEXT), thumbPath: thumbPathFor(CONTEXT) });
    expect(d.uploads).toHaveLength(1);
  });

  it("caminhos são determinísticos por destinatário e item", () => {
    expect(assetPathFor(CONTEXT)).toBe("sc1/bt1/rc1/it1/v1-r1-a1.jpg");
    expect(thumbPathFor(CONTEXT)).toBe("sc1/bt1/rc1/it1/v1-r1-a1.webp");
  });
});
