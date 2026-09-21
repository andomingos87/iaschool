// Store da fila em IndexedDB, contra a implementação em memória do
// fake-indexeddb (mesma API do navegador).
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { createIndexedDbQueueStore, fileKeyOf, type QueueEntry } from "./queue-store";

function entry(eventId: string, name: string, status: QueueEntry["status"] = "detached"): QueueEntry {
  const fileKey = fileKeyOf({ name, size: 10, lastModified: 1 });
  return {
    id: `${eventId}|${fileKey}`,
    eventId,
    fileKey,
    name,
    size: 10,
    lastModified: 1,
    type: "image/jpeg",
    status,
    attempts: 0,
    updatedAt: Date.now(),
  };
}

describe("createIndexedDbQueueStore", () => {
  it("devolve null sem IndexedDB", () => {
    expect(createIndexedDbQueueStore(null)).toBeNull();
  });

  it("grava, lê por evento e sobrescreve pela chave", async () => {
    const store = createIndexedDbQueueStore(new IDBFactory())!;
    await store.put([entry("e1", "a.jpg"), entry("e1", "b.jpg"), entry("e2", "c.jpg")]);
    await store.put([entry("e1", "a.jpg", "done")]);
    const e1 = await store.load("e1");
    expect(e1.map((e) => [e.name, e.status]).sort()).toEqual([
      ["a.jpg", "done"],
      ["b.jpg", "detached"],
    ]);
    expect(await store.load("e2")).toHaveLength(1);
  });

  it("clear apaga só o evento pedido", async () => {
    const store = createIndexedDbQueueStore(new IDBFactory())!;
    await store.put([entry("e1", "a.jpg"), entry("e2", "c.jpg")]);
    await store.clear("e1");
    expect(await store.load("e1")).toHaveLength(0);
    expect(await store.load("e2")).toHaveLength(1);
  });
});
