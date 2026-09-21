// Fila do upload persistida em IndexedDB, por evento (spec §7.1, "retomada").
//
// O navegador não deixa guardar o File em si de forma confiável entre sessões
// (e 5.000 originais estourariam qualquer cota), então o que persiste é a
// identidade do arquivo — nome, tamanho, data de modificação — e o estado.
// Ao reabrir a tela, o que ficou pendente é oferecido de volta: basta
// arrastar a mesma pasta e só o que falta segue em frente.

import type { UploadItemStatus } from "./types";

export interface QueueEntry {
  /** `${eventId}|${fileKey}` — chave primária do store. */
  id: string;
  eventId: string;
  /** `${name}|${size}|${lastModified}`: identidade local do arquivo. */
  fileKey: string;
  name: string;
  size: number;
  lastModified: number;
  type: string;
  status: UploadItemStatus;
  hash?: string;
  attempts: number;
  error?: string;
  updatedAt: number;
}

export interface UploadQueueStore {
  load(eventId: string): Promise<QueueEntry[]>;
  put(entries: QueueEntry[]): Promise<void>;
  clear(eventId: string): Promise<void>;
}

export function fileKeyOf(file: { name: string; size: number; lastModified: number }): string {
  return `${file.name}|${file.size}|${file.lastModified}`;
}

/** Store em memória: testes e navegadores sem IndexedDB. */
export function createMemoryQueueStore(): UploadQueueStore {
  const rows = new Map<string, QueueEntry>();
  return {
    async load(eventId) {
      return [...rows.values()].filter((e) => e.eventId === eventId);
    },
    async put(entries) {
      for (const e of entries) rows.set(e.id, { ...e });
    },
    async clear(eventId) {
      for (const [id, e] of rows) if (e.eventId === eventId) rows.delete(id);
    },
  };
}

const DB_NAME = "iaschool-upload-queue";
const DB_VERSION = 1;
const STORE = "entries";

function openDb(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("eventId", "eventId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB indisponível"));
  });
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("falha no IndexedDB"));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("falha no IndexedDB"));
    tx.onabort = () => reject(tx.error ?? new Error("transação abortada"));
  });
}

/**
 * Store real em IndexedDB. Abre o banco na primeira operação; se o
 * IndexedDB não existir ou falhar (modo privado em alguns navegadores), o
 * chamador deve cair no store em memória.
 */
export function createIndexedDbQueueStore(
  factory: IDBFactory | null = typeof indexedDB === "undefined" ? null : indexedDB,
): UploadQueueStore | null {
  if (!factory) return null;
  let dbPromise: Promise<IDBDatabase> | null = null;
  const db = () => (dbPromise ??= openDb(factory));

  return {
    async load(eventId) {
      const tx = (await db()).transaction(STORE, "readonly");
      const index = tx.objectStore(STORE).index("eventId");
      const rows = await requestToPromise(index.getAll(eventId));
      return rows as QueueEntry[];
    },
    async put(entries) {
      if (entries.length === 0) return;
      const tx = (await db()).transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      for (const e of entries) store.put(e);
      await txDone(tx);
    },
    async clear(eventId) {
      const tx = (await db()).transaction(STORE, "readwrite");
      const index = tx.objectStore(STORE).index("eventId");
      const keys = await requestToPromise(index.getAllKeys(eventId));
      const store = tx.objectStore(STORE);
      for (const k of keys) store.delete(k);
      await txDone(tx);
    },
  };
}
