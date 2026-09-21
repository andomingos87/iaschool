// Orquestrador do upload em massa de um evento (spec §7.1).
//
// Pipeline por arquivo: hash (SHA-256 do original, em worker) → conferência
// de duplicidade em lote → redimensionamento (2560px, JPEG q85) → upload +
// insert em `photos`, com 6 uploads simultâneos e 3 retentativas (1s/4s/16s).
// O estado vai para a tela por `subscribe()` e para o IndexedDB por
// `UploadQueueStore`, o que permite retomar depois de fechar a aba.
//
// Este módulo não conhece React nem Supabase: recebe tudo por `deps`, e é
// assim que os testes exercitam concorrência, retentativa e retomada.

import type { PhotoRepository } from "../data/contract";
import type { Photo } from "../data/types";
import {
  MAX_FILES_PER_BATCH,
  UPLOAD_BACKOFF_MS,
  UPLOAD_CONCURRENCY,
  UPLOAD_MAX_RETRIES,
  HASH_WORKERS,
  isAcceptedImage,
} from "./constants";
import type { ReadTakenAt } from "./exif";
import type { HashFile } from "./hash";
import type { PreparePhoto } from "./image";
import { fileKeyOf, type QueueEntry, type UploadQueueStore } from "./queue-store";
import type {
  AddFilesResult,
  UploadCounts,
  UploadItem,
  UploadItemStatus,
  UploadSnapshot,
} from "./types";

export interface UploaderDeps {
  eventId: string;
  schoolId: string;
  hash: HashFile;
  prepare: PreparePhoto;
  repo: Pick<PhotoRepository, "findExistingHashes" | "upload" | "startBatch" | "finishBatch">;
  store: UploadQueueStore;
  /** Lê `DateTimeOriginal` do arquivo original; ausente = `taken_at` nulo. */
  readTakenAt?: ReadTakenAt;
  /**
   * Getter (não booleano) porque o evento pode ser editado com a tela aberta
   * e este uploader vive enquanto ela estiver montada. `true` sobe o arquivo
   * original para `event-originals` junto com o JPEG.
   */
  keepOriginals?: () => boolean;
  /** Uma foto acabou de ser gravada no servidor (não dispara para duplicata). */
  onUploaded?: (photo: Photo) => void;
  /** Injetável para os testes controlarem o backoff. */
  sleep?: (ms: number) => Promise<void>;
  concurrency?: number;
  hashConcurrency?: number;
  maxRetries?: number;
  backoffMs?: readonly number[];
  maxFiles?: number;
}

export interface EventUploader {
  /** Resolve quando a fila persistida foi carregada. */
  readonly ready: Promise<void>;
  getSnapshot(): UploadSnapshot;
  subscribe(listener: () => void): () => void;
  /** Filtra, aplica o limite do lote e põe os arquivos na fila (e começa). */
  addFiles(files: File[]): Promise<AddFilesResult>;
  /** Volta para a fila o que falhou (só o que ainda tem o File nesta sessão). */
  retryFailed(): void;
  /** Para de iniciar itens novos; os em andamento terminam. */
  cancel(): void;
  /** Esquece o histórico local do evento (não apaga nada no servidor). */
  clearHistory(): Promise<void>;
  dispose(): void;
}

interface InternalItem extends UploadItem {
  file?: File;
  /** Hash já conferido contra o servidor nesta sessão. */
  checked: boolean;
}

const IN_PROGRESS: ReadonlySet<UploadItemStatus> = new Set([
  "hashing",
  "hashed",
  "preparing",
  "uploading",
]);
/** Estados que, vindos de outra sessão, precisam do File de novo. */
const RESUMABLE: ReadonlySet<UploadItemStatus> = new Set([
  "queued",
  "hashing",
  "hashed",
  "preparing",
  "uploading",
  "failed",
  "detached",
]);

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createEventUploader(deps: UploaderDeps): EventUploader {
  const concurrency = deps.concurrency ?? UPLOAD_CONCURRENCY;
  const hashConcurrency = deps.hashConcurrency ?? HASH_WORKERS;
  const maxRetries = deps.maxRetries ?? UPLOAD_MAX_RETRIES;
  const backoff = deps.backoffMs ?? UPLOAD_BACKOFF_MS;
  const maxFiles = deps.maxFiles ?? MAX_FILES_PER_BATCH;
  const sleep = deps.sleep ?? defaultSleep;

  const items = new Map<string, InternalItem>();
  const listeners = new Set<() => void>();
  let snapshot: UploadSnapshot | null = null;
  let lastAdd: AddFilesResult | undefined;

  let hashActive = 0;
  let uploadActive = 0;
  let running = false;
  let cancelled = false;
  let disposed = false;
  let batchId: string | null = null;
  let uploadedInRun = 0;
  let failedInRun = 0;

  // ---------- notificação e persistência (coalescidas por microtask) ----------

  let notifyScheduled = false;
  function notify(): void {
    snapshot = null;
    if (notifyScheduled) return;
    notifyScheduled = true;
    queueMicrotask(() => {
      notifyScheduled = false;
      for (const l of listeners) l();
    });
  }

  const dirty = new Set<string>();
  let flushScheduled = false;
  let flushChain: Promise<void> = Promise.resolve();
  function persist(item: InternalItem): void {
    dirty.add(item.key);
    if (flushScheduled) return;
    flushScheduled = true;
    queueMicrotask(() => {
      flushScheduled = false;
      const entries: QueueEntry[] = [];
      for (const key of dirty) {
        const it = items.get(key);
        if (it) entries.push(toEntry(it));
      }
      dirty.clear();
      flushChain = flushChain
        .then(() => deps.store.put(entries))
        .catch(() => {
          // Persistência é best-effort: sem ela só se perde a retomada.
        });
    });
  }

  function toEntry(it: InternalItem): QueueEntry {
    return {
      id: `${deps.eventId}|${it.key}`,
      eventId: deps.eventId,
      fileKey: it.key,
      name: it.name,
      size: it.size,
      lastModified: it.lastModified,
      type: it.type,
      // O que ficar em andamento ao fechar a aba volta como "detached".
      status: IN_PROGRESS.has(it.status) || it.status === "queued" ? "detached" : it.status,
      hash: it.hash,
      attempts: it.attempts,
      error: it.error,
      updatedAt: Date.now(),
    };
  }

  function set(it: InternalItem, patch: Partial<InternalItem>): void {
    Object.assign(it, patch);
    persist(it);
    notify();
  }

  // ---------- carga inicial ----------

  const ready = deps.store
    .load(deps.eventId)
    .then((entries) => {
      for (const e of entries) {
        if (items.has(e.fileKey)) continue;
        items.set(e.fileKey, {
          key: e.fileKey,
          name: e.name,
          size: e.size,
          lastModified: e.lastModified,
          type: e.type,
          status: RESUMABLE.has(e.status) ? "detached" : e.status,
          hash: e.hash,
          attempts: e.attempts,
          error: e.error,
          checked: false,
        });
      }
      notify();
    })
    .catch(() => {
      // Sem histórico local: começa do zero.
    });

  // ---------- pipeline ----------

  function pump(): void {
    if (disposed) return;
    if (!cancelled) {
      while (hashActive < hashConcurrency) {
        const next = [...items.values()].find((i) => i.status === "queued" && i.file);
        if (!next) break;
        hashActive++;
        set(next, { status: "hashing" });
        void hashOne(next).finally(() => {
          hashActive--;
          pump();
        });
      }
      while (uploadActive < concurrency) {
        const next = [...items.values()].find((i) => i.status === "hashed" && i.file);
        if (!next) break;
        uploadActive++;
        set(next, { status: "preparing" });
        void uploadOne(next).finally(() => {
          uploadActive--;
          pump();
        });
      }
    }
    if (running && hashActive === 0 && uploadActive === 0) {
      const hasWork = !cancelled && [...items.values()].some(
        (i) => i.file && (i.status === "queued" || i.status === "hashed"),
      );
      if (!hasWork) void finishRun();
    }
  }

  async function hashOne(it: InternalItem): Promise<void> {
    try {
      const hash = await deps.hash(it.file!);
      set(it, { status: "hashed", hash });
    } catch (err) {
      set(it, {
        status: "failed",
        error: err instanceof Error ? err.message : "Não foi possível ler o arquivo.",
      });
      failedInRun++;
    }
  }

  /**
   * Confere de uma vez todos os hashes ainda não conferidos (até 200): quem
   * já existe no evento vira "duplicate" sem subir um byte.
   */
  async function checkDuplicates(current: InternalItem): Promise<void> {
    const batch = [current, ...[...items.values()].filter(
      (i) => i !== current && i.status === "hashed" && !i.checked && i.hash,
    )].slice(0, 200);
    let found: Set<string>;
    try {
      found = await deps.repo.findExistingHashes(
        deps.eventId,
        batch.map((i) => i.hash!),
      );
    } catch {
      // Se a conferência falhar, o insert ainda barra a duplicata (23505).
      return;
    }
    for (const i of batch) {
      i.checked = true;
      if (found.has(i.hash!)) set(i, { status: "duplicate" });
    }
  }

  async function uploadOne(it: InternalItem): Promise<void> {
    if (!it.checked) await checkDuplicates(it);
    if (it.status !== "preparing") return; // virou duplicate na conferência

    let prepared;
    let takenAt: string | undefined;
    try {
      // EXIF é lido do arquivo ORIGINAL, em paralelo com o redimensionamento
      // (que descarta o EXIF). Falha na leitura da data nunca derruba o item.
      [prepared, takenAt] = await Promise.all([
        deps.prepare(it.file!),
        deps.readTakenAt ? deps.readTakenAt(it.file!).catch(() => undefined) : Promise.resolve(undefined),
      ]);
    } catch (err) {
      set(it, {
        status: "failed",
        error: err instanceof Error ? err.message : "Não foi possível ler a imagem.",
      });
      failedInRun++;
      return;
    }

    set(it, { status: "uploading", attempts: 0 });
    for (let attempt = 0; ; attempt++) {
      try {
        set(it, { attempts: attempt + 1 });
        if (!batchId) throw new Error("Lote de envio não está aberto.");
        const result = await deps.repo.upload({
          eventId: deps.eventId,
          schoolId: deps.schoolId,
          batchId,
          contentHash: it.hash!,
          originalFilename: it.name,
          blob: prepared.blob,
          width: prepared.width,
          height: prepared.height,
          takenAt,
          // Com keep_originals, o original é o arquivo como veio (HEIC
          // inclusive), não o JPEG convertido.
          original: deps.keepOriginals?.() ? it.file : undefined,
        });
        if (result.outcome === "uploaded") {
          uploadedInRun++;
          set(it, { status: "done", error: undefined });
          deps.onUploaded?.(result.photo);
        } else {
          set(it, { status: "duplicate", error: undefined });
        }
        return;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Falha no envio.";
        if (attempt >= maxRetries || cancelled || disposed) {
          failedInRun++;
          set(it, { status: "failed", error: message });
          return;
        }
        set(it, { error: message });
        await sleep(backoff[Math.min(attempt, backoff.length - 1)] ?? 0);
      }
    }
  }

  async function beginRun(expected: number): Promise<void> {
    running = true;
    uploadedInRun = 0;
    failedInRun = 0;
    notify();
    const batch = await deps.repo.startBatch(deps.eventId, expected);
    batchId = batch.id;
  }

  async function finishRun(): Promise<void> {
    running = false;
    const id = batchId;
    batchId = null;
    notify();
    if (id) {
      try {
        // O servidor conta o total real; `uploadedInRun` só serve de conferência.
        await deps.repo.finishBatch(id, { total: uploadedInRun, cancelled });
      } catch {
        // O lote fica "running" no servidor sem `upload_finished_at`; a view
        // `stalled_batch_jobs` e o /health do worker apontam lote parado.
      }
    }
  }

  // ---------- API ----------

  function computeSnapshot(): UploadSnapshot {
    const list = [...items.values()];
    const counts: UploadCounts = {
      total: list.length,
      done: 0,
      duplicate: 0,
      failed: 0,
      inProgress: 0,
      queued: 0,
      detached: 0,
    };
    for (const i of list) {
      if (i.status === "done") counts.done++;
      else if (i.status === "duplicate") counts.duplicate++;
      else if (i.status === "failed") counts.failed++;
      else if (i.status === "queued") counts.queued++;
      else if (i.status === "detached") counts.detached++;
      else if (IN_PROGRESS.has(i.status)) counts.inProgress++;
    }
    return {
      eventId: deps.eventId,
      items: list.map(({ file: _file, checked: _checked, ...rest }) => ({ ...rest })),
      counts,
      running,
      lastAdd,
    };
  }

  return {
    ready,
    getSnapshot() {
      return (snapshot ??= computeSnapshot());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async addFiles(files) {
      await ready;
      const result: AddFilesResult = { accepted: 0, rejected: 0, alreadySent: 0, overLimit: 0 };
      const toQueue: Array<{ file: File; existing?: InternalItem }> = [];

      for (const file of files) {
        if (!isAcceptedImage(file)) {
          result.rejected++;
          continue;
        }
        const existing = items.get(fileKeyOf(file));
        if (existing) {
          if (existing.status === "done" || existing.status === "duplicate") {
            result.alreadySent++;
            continue;
          }
          if (existing.file && existing.status !== "failed" && existing.status !== "detached") {
            continue; // já está na fila desta sessão
          }
        }
        toQueue.push({ file, existing });
      }

      const pendingNow = [...items.values()].filter(
        (i) => i.status !== "done" && i.status !== "duplicate" && i.status !== "detached",
      ).length;
      if (pendingNow + toQueue.length > maxFiles) {
        result.overLimit = pendingNow + toQueue.length - maxFiles;
        lastAdd = result;
        notify();
        return result;
      }

      for (const { file, existing } of toQueue) {
        const key = fileKeyOf(file);
        if (existing) {
          // Hash de sessão anterior vale: pula direto para a conferência.
          set(existing, {
            file,
            status: existing.hash ? "hashed" : "queued",
            attempts: 0,
            error: undefined,
            checked: false,
          });
        } else {
          const item: InternalItem = {
            key,
            name: file.name,
            size: file.size,
            lastModified: file.lastModified,
            type: file.type,
            status: "queued",
            attempts: 0,
            checked: false,
            file,
          };
          items.set(key, item);
          persist(item);
        }
        result.accepted++;
      }
      lastAdd = result;
      cancelled = false;
      notify();

      if (result.accepted > 0) {
        if (!running) await beginRun(result.accepted);
        pump();
      }
      return result;
    },
    retryFailed() {
      let count = 0;
      for (const it of items.values()) {
        if (it.status === "failed" && it.file) {
          set(it, { status: it.hash ? "hashed" : "queued", attempts: 0, error: undefined });
          count++;
        }
      }
      if (count === 0) return;
      cancelled = false;
      if (!running) {
        void beginRun(count).then(pump);
      } else {
        pump();
      }
    },
    cancel() {
      cancelled = true;
      notify();
      pump();
    },
    async clearHistory() {
      await ready;
      for (const [key, it] of items) {
        if (!it.file || it.status === "done" || it.status === "duplicate") items.delete(key);
      }
      await deps.store.clear(deps.eventId);
      notify();
    },
    dispose() {
      disposed = true;
      cancelled = true;
      listeners.clear();
    },
  };
}
