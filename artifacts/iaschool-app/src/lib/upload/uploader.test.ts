// Testes do orquestrador do upload em massa (spec §7.1): concorrência de 6,
// 3 retentativas com backoff 1s/4s/16s, dedup por hash, limite de 5.000 e
// retomada pela fila persistida. Sem rede, sem worker, sem IndexedDB real.
import { describe, expect, it } from "vitest";
import type { PhotoUploadInput, PhotoUploadResult } from "../data/contract";
import type { BatchJob } from "../data/types";
import { hashFileInline } from "./hash";
import { createMemoryQueueStore } from "./queue-store";
import { createEventUploader, type UploaderDeps } from "./uploader";

const EVENT = "evt-1";
const SCHOOL = "school-1";

function makeFile(name: string, content = name, lastModified = 1_700_000_000_000): File {
  return new File([content], name, { type: "image/jpeg", lastModified });
}

interface FakeRepo extends UploaderDeps["repo"] {
  uploads: PhotoUploadInput[];
  hashesOnServer: Set<string>;
  batches: Array<{ id: string; total: number }>;
  finished: Array<{ id: string; total: number; failed: number; cancelled?: boolean }>;
  /** Falhas a injetar por nome de arquivo: quantas vezes o upload deve estourar. */
  failTimes: Map<string, number>;
  inFlight: number;
  maxInFlight: number;
  /** Segura os uploads até `release()` ser chamado (para medir concorrência). */
  gate?: { promise: Promise<void>; release: () => void };
}

function createFakeRepo(): FakeRepo {
  const repo: FakeRepo = {
    uploads: [],
    hashesOnServer: new Set(),
    batches: [],
    finished: [],
    failTimes: new Map(),
    inFlight: 0,
    maxInFlight: 0,
    async findExistingHashes(_eventId, hashes) {
      return new Set(hashes.filter((h) => repo.hashesOnServer.has(h)));
    },
    async upload(input): Promise<PhotoUploadResult> {
      repo.inFlight++;
      repo.maxInFlight = Math.max(repo.maxInFlight, repo.inFlight);
      try {
        if (repo.gate) await repo.gate.promise;
        const remaining = repo.failTimes.get(input.originalFilename) ?? 0;
        if (remaining > 0) {
          repo.failTimes.set(input.originalFilename, remaining - 1);
          throw new Error("rede caiu");
        }
        if (repo.hashesOnServer.has(input.contentHash)) return { outcome: "duplicate" };
        repo.hashesOnServer.add(input.contentHash);
        repo.uploads.push(input);
        return {
          outcome: "uploaded",
          photo: {
            id: `photo-${repo.uploads.length}`,
            schoolId: input.schoolId,
            eventId: input.eventId,
            storagePath: "x",
            contentHash: input.contentHash,
            originalFilename: input.originalFilename,
            bytes: input.blob.size,
            status: "pending",
            uploadedBy: "u",
            createdAt: new Date().toISOString(),
          },
        };
      } finally {
        repo.inFlight--;
      }
    },
    async startBatch(_eventId, total): Promise<BatchJob> {
      const id = `batch-${repo.batches.length + 1}`;
      repo.batches.push({ id, total });
      return {
        id,
        schoolId: SCHOOL,
        eventId: EVENT,
        kind: "ingest",
        status: "running",
        total,
        processed: 0,
        failed: 0,
        createdBy: "u",
        createdAt: new Date().toISOString(),
      };
    },
    async finishBatch(id, result) {
      repo.finished.push({ id, ...result });
    },
  };
  return repo;
}

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((r) => (release = r));
  return { promise, release };
}

function build(overrides: Partial<UploaderDeps> = {}) {
  const repo = createFakeRepo();
  const store = createMemoryQueueStore();
  const sleeps: number[] = [];
  const uploader = createEventUploader({
    eventId: EVENT,
    schoolId: SCHOOL,
    hash: hashFileInline,
    prepare: async (file) => ({ blob: file, width: 10, height: 10 }),
    repo,
    store,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    ...overrides,
  });
  return { uploader, repo, store, sleeps };
}

/** Espera o uploader ficar ocioso (running=false depois de ter rodado). */
async function settle(uploader: ReturnType<typeof build>["uploader"], timeoutMs = 5_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const s = uploader.getSnapshot();
    const pending = s.counts.queued + s.counts.inProgress;
    if (!s.running && pending === 0) return s;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("uploader não terminou a tempo");
}

describe("addFiles: filtro, limite e contagens", () => {
  it("aceita JPEG/PNG/HEIC e recusa o resto", async () => {
    const { uploader } = build();
    const result = await uploader.addFiles([
      makeFile("a.jpg"),
      new File(["x"], "b.png", { type: "image/png" }),
      new File(["x"], "c.heic", { type: "" }),
      new File(["x"], "d.gif", { type: "image/gif" }),
      new File(["x"], "e.txt", { type: "text/plain" }),
    ]);
    expect(result.accepted).toBe(3);
    expect(result.rejected).toBe(2);
    await settle(uploader);
  });

  it("recusa o lote inteiro acima do limite e diz quantos passaram", async () => {
    const { uploader, repo } = build({ maxFiles: 3 });
    const result = await uploader.addFiles([1, 2, 3, 4, 5].map((i) => makeFile(`${i}.jpg`)));
    expect(result.accepted).toBe(0);
    expect(result.overLimit).toBe(2);
    expect(repo.batches).toHaveLength(0);
    expect(uploader.getSnapshot().counts.total).toBe(0);
  });

  it("envia tudo, abre e fecha o lote com o total enviado", async () => {
    const { uploader, repo } = build();
    await uploader.addFiles([makeFile("a.jpg"), makeFile("b.jpg"), makeFile("c.jpg")]);
    const s = await settle(uploader);
    expect(s.counts.done).toBe(3);
    expect(repo.uploads.map((u) => u.originalFilename).sort()).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
    expect(repo.batches).toEqual([{ id: "batch-1", total: 3 }]);
    expect(repo.finished).toEqual([{ id: "batch-1", total: 3, failed: 0, cancelled: false }]);
  });
});

describe("dedup por hash (R2)", () => {
  it("conteúdo igual com nome diferente conta como 'já enviada' sem subir de novo", async () => {
    const { uploader, repo } = build();
    await uploader.addFiles([makeFile("a.jpg", "mesmo"), makeFile("b.jpg", "mesmo")]);
    const s = await settle(uploader);
    expect(s.counts.done + s.counts.duplicate).toBe(2);
    expect(s.counts.duplicate).toBe(1);
    expect(repo.uploads).toHaveLength(1);
  });

  it("o que já existe no servidor é marcado duplicado na conferência, sem upload", async () => {
    const { uploader, repo } = build();
    repo.hashesOnServer.add(await hashFileInline(makeFile("a.jpg")));
    await uploader.addFiles([makeFile("a.jpg"), makeFile("b.jpg")]);
    const s = await settle(uploader);
    expect(s.counts.duplicate).toBe(1);
    expect(s.counts.done).toBe(1);
    expect(repo.uploads.map((u) => u.originalFilename)).toEqual(["b.jpg"]);
  });

  it("a mesma pasta arrastada duas vezes na mesma sessão não repete nada", async () => {
    const { uploader, repo } = build();
    const files = [makeFile("a.jpg"), makeFile("b.jpg")];
    await uploader.addFiles(files);
    await settle(uploader);
    const again = await uploader.addFiles(files);
    expect(again.accepted).toBe(0);
    expect(again.alreadySent).toBe(2);
    expect(repo.uploads).toHaveLength(2);
    expect(repo.batches).toHaveLength(1);
  });
});

describe("concorrência e retentativas", () => {
  it("nunca passa de 6 uploads simultâneos", async () => {
    const { uploader, repo } = build();
    repo.gate = gate();
    await uploader.addFiles(Array.from({ length: 20 }, (_, i) => makeFile(`${i}.jpg`)));
    // Deixa o pipeline encher as vagas antes de liberar.
    for (let i = 0; i < 50 && repo.inFlight < 6; i++) await new Promise((r) => setTimeout(r, 2));
    expect(repo.inFlight).toBe(6);
    repo.gate.release();
    const s = await settle(uploader);
    expect(repo.maxInFlight).toBe(6);
    expect(s.counts.done).toBe(20);
  });

  it("tenta de novo com 1s, 4s e 16s e desiste na quarta falha", async () => {
    const { uploader, repo, sleeps } = build();
    repo.failTimes.set("teimoso.jpg", 99);
    repo.failTimes.set("volta.jpg", 2);
    await uploader.addFiles([makeFile("teimoso.jpg"), makeFile("volta.jpg")]);
    const s = await settle(uploader);
    expect(s.counts.done).toBe(1);
    expect(s.counts.failed).toBe(1);
    const teimoso = s.items.find((i) => i.name === "teimoso.jpg")!;
    expect(teimoso.attempts).toBe(4);
    expect(teimoso.error).toBe("rede caiu");
    // 3 esperas do teimoso + 2 do que voltou.
    expect([...sleeps].sort((a, b) => a - b)).toEqual([1000, 1000, 4000, 4000, 16000]);
    expect(repo.finished[0]).toMatchObject({ total: 1, failed: 1 });
  });

  it("retryFailed devolve o que falhou para a fila e abre um lote novo", async () => {
    const { uploader, repo } = build();
    repo.failTimes.set("a.jpg", 99);
    await uploader.addFiles([makeFile("a.jpg")]);
    await settle(uploader);
    expect(uploader.getSnapshot().counts.failed).toBe(1);
    repo.failTimes.set("a.jpg", 0);
    uploader.retryFailed();
    const s = await settle(uploader);
    expect(s.counts.done).toBe(1);
    expect(s.counts.failed).toBe(0);
    expect(repo.batches).toHaveLength(2);
  });

  it("cancel para de iniciar itens, mantém os pendentes e fecha o lote como cancelado", async () => {
    const { uploader, repo } = build({ concurrency: 1, hashConcurrency: 1 });
    repo.gate = gate();
    await uploader.addFiles([makeFile("a.jpg"), makeFile("b.jpg"), makeFile("c.jpg")]);
    for (let i = 0; i < 50 && repo.inFlight < 1; i++) await new Promise((r) => setTimeout(r, 2));
    uploader.cancel();
    repo.gate.release();
    for (let i = 0; i < 100 && uploader.getSnapshot().running; i++) {
      await new Promise((r) => setTimeout(r, 5));
    }
    const s = uploader.getSnapshot();
    expect(s.running).toBe(false);
    expect(s.counts.done).toBe(1);
    expect(s.counts.queued + s.counts.inProgress).toBe(2);
    expect(repo.finished[0]).toMatchObject({ total: 1, cancelled: true });
  });
});

describe("retomada pela fila persistida", () => {
  it("o que ficou pendente volta como 'detached' e só ele é reenviado ao arrastar a pasta", async () => {
    const store = createMemoryQueueStore();
    const first = build({ store, concurrency: 1, hashConcurrency: 1 });
    first.repo.gate = gate();
    const files = [makeFile("a.jpg"), makeFile("b.jpg"), makeFile("c.jpg")];
    await first.uploader.addFiles(files);
    for (let i = 0; i < 50 && first.repo.inFlight < 1; i++) await new Promise((r) => setTimeout(r, 2));
    // Simula fechar a aba com um upload no meio: nada mais anda.
    first.uploader.dispose();
    first.repo.gate.release();
    await new Promise((r) => setTimeout(r, 20));

    const second = build({ store });
    // Mesmo servidor: a foto que subiu na primeira sessão está lá.
    second.repo.hashesOnServer = first.repo.hashesOnServer;
    await second.uploader.ready;
    const before = second.uploader.getSnapshot();
    expect(before.counts.done).toBe(1);
    expect(before.counts.detached).toBe(2);

    const result = await second.uploader.addFiles(files);
    expect(result.alreadySent).toBe(1);
    expect(result.accepted).toBe(2);
    const s = await settle(second.uploader);
    expect(s.counts.done).toBe(3);
    expect(s.counts.detached).toBe(0);
    expect(second.repo.uploads.map((u) => u.originalFilename).sort()).toEqual(["b.jpg", "c.jpg"]);
  });

  it("clearHistory esquece o que foi enviado e a pasta volta a ser oferecida inteira", async () => {
    const store = createMemoryQueueStore();
    const { uploader, repo } = build({ store });
    await uploader.addFiles([makeFile("a.jpg")]);
    await settle(uploader);
    await uploader.clearHistory();
    expect(uploader.getSnapshot().counts.total).toBe(0);
    expect(await store.load(EVENT)).toHaveLength(0);
    const again = await uploader.addFiles([makeFile("a.jpg")]);
    expect(again.accepted).toBe(1);
    const s = await settle(uploader);
    // O servidor ainda tem o hash: vira "já enviada", não upload novo.
    expect(s.counts.duplicate).toBe(1);
    expect(repo.uploads).toHaveLength(1);
  });
});
