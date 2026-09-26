import { describe, expect, it } from "vitest";
import { runPurgeSweep, type PurgeApi, type PurgeItem } from "./purge";

function item(id: number, bucket: string, path: string): PurgeItem {
  return { id, bucket, path, reason: "test", attempts: 1 };
}

function fakeApi(
  items: PurgeItem[],
  opts: { failBucket?: string } = {},
): PurgeApi & {
  removed: Array<{ bucket: string; paths: string[] }>;
  completed: Array<{ ids: number[]; ok: boolean; error?: string }>;
} {
  const removed: Array<{ bucket: string; paths: string[] }> = [];
  const completed: Array<{ ids: number[]; ok: boolean; error?: string }> = [];
  return {
    removed,
    completed,
    async claim() {
      return items;
    },
    async remove(bucket, paths) {
      if (bucket === opts.failBucket) throw new Error("bucket fora do ar");
      removed.push({ bucket, paths });
    },
    async complete(ids, ok, error) {
      completed.push({ ids, ok, ...(error !== undefined ? { error } : {}) });
    },
  };
}

describe("runPurgeSweep", () => {
  it("não chama o Storage quando a fila está vazia", async () => {
    const api = fakeApi([]);
    const result = await runPurgeSweep(api, 100, 60);
    expect(result).toEqual({ claimed: 0, deleted: 0, failed: 0 });
    expect(api.removed).toHaveLength(0);
    expect(api.completed).toHaveLength(0);
  });

  it("agrupa por bucket: uma chamada de remove por bucket, não por arquivo", async () => {
    const api = fakeApi([
      item(1, "event-photos", "a/b/1.jpg"),
      item(2, "event-thumbs", "a/b/1.webp"),
      item(3, "event-photos", "a/b/2.jpg"),
    ]);
    const result = await runPurgeSweep(api, 100, 60);
    expect(result).toEqual({ claimed: 3, deleted: 3, failed: 0 });
    expect(api.removed).toEqual([
      { bucket: "event-photos", paths: ["a/b/1.jpg", "a/b/2.jpg"] },
      { bucket: "event-thumbs", paths: ["a/b/1.webp"] },
    ]);
    expect(api.completed.every((c) => c.ok)).toBe(true);
  });

  it("bucket que falha volta para a fila e não derruba os outros", async () => {
    const api = fakeApi(
      [item(1, "face-crops", "a/b/1.jpg"), item(2, "event-photos", "a/b/2.jpg")],
      { failBucket: "face-crops" },
    );
    const result = await runPurgeSweep(api, 100, 60);
    expect(result).toEqual({ claimed: 2, deleted: 1, failed: 1 });
    expect(api.removed).toEqual([{ bucket: "event-photos", paths: ["a/b/2.jpg"] }]);
    const failure = api.completed.find((c) => !c.ok);
    expect(failure?.ids).toEqual([1]);
    expect(failure?.error).toContain("bucket fora do ar");
  });

  it("o log não carrega caminho de arquivo (§11: nem id de aluno, nem de foto)", async () => {
    const api = fakeApi([item(1, "student-refs", "escola/aluno/ref.jpg")]);
    const logged: Array<Record<string, unknown>> = [];
    await runPurgeSweep(api, 100, 60, (fields) => logged.push(fields));
    expect(logged).toHaveLength(1);
    expect(JSON.stringify(logged[0])).not.toContain("aluno");
    expect(logged[0]).toMatchObject({ bucket: "student-refs", count: 1, result: "deleted" });
  });
});
