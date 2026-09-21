import { describe, expect, it } from "vitest";
import { createSignedUrlCache, type SignablePhoto } from "./signed-url-cache";

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

function photos(n: number, withThumb = true): SignablePhoto[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    thumbPath: withThumb ? `s/e/p${i}.webp` : undefined,
  }));
}

describe("cache de URLs assinadas", () => {
  it("agrupa em lotes de 100 e notifica quem assina", async () => {
    const calls: number[] = [];
    let notified = 0;
    const cache = createSignedUrlCache({
      sign: async (list) => {
        calls.push(list.length);
        return new Map(list.map((p) => [p.id, `url:${p.id}`]));
      },
    });
    cache.subscribe(() => notified++);
    cache.ensure(photos(250));
    await tick();
    await tick();
    expect(calls).toEqual([100, 100, 50]);
    expect(cache.get("p0")).toBe("url:p0");
    expect(cache.get("p249")).toBe("url:p249");
    expect(notified).toBe(3);
  });

  it("não reassina o que está em voo nem o que já tem URL", async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const cache = createSignedUrlCache({
      sign: async (list) => {
        calls++;
        await gate;
        return new Map(list.map((p) => [p.id, `url:${p.id}`]));
      },
    });
    cache.ensure(photos(10));
    await tick();
    cache.ensure(photos(10)); // em voo: ignorado
    await tick();
    release();
    await tick();
    await tick();
    cache.ensure(photos(10)); // já assinado: ignorado
    await tick();
    expect(calls).toBe(1);
  });

  it("sem thumbPath nunca vai ao signer", async () => {
    let calls = 0;
    const cache = createSignedUrlCache({
      sign: async () => {
        calls++;
        return new Map();
      },
    });
    cache.ensure(photos(20, false));
    await tick();
    expect(calls).toBe(0);
    expect(cache.get("p0")).toBeUndefined();
  });

  it("URL vencida é reassinada", async () => {
    let now = 1_000;
    let calls = 0;
    const cache = createSignedUrlCache({
      ttlMs: 500,
      now: () => now,
      sign: async (list) => {
        calls++;
        return new Map(list.map((p) => [p.id, `url${calls}:${p.id}`]));
      },
    });
    cache.ensure(photos(1));
    await tick();
    expect(cache.get("p0")).toBe("url1:p0");
    now += 600;
    expect(cache.get("p0")).toBeUndefined();
    cache.ensure(photos(1));
    await tick();
    expect(cache.get("p0")).toBe("url2:p0");
    expect(calls).toBe(2);
  });

  it("falha do signer deixa a célula sem URL e não derruba o resto", async () => {
    let n = 0;
    const cache = createSignedUrlCache({
      batchSize: 2,
      sign: async (list) => {
        n++;
        if (n === 1) throw new Error("storage fora");
        return new Map(list.map((p) => [p.id, `url:${p.id}`]));
      },
    });
    cache.ensure(photos(4));
    await tick();
    await tick();
    expect(cache.get("p0")).toBeUndefined();
    expect(cache.get("p2")).toBe("url:p2");
    // Depois da falha, o que ficou sem URL pode ser pedido de novo.
    cache.ensure(photos(2));
    await tick();
    expect(cache.get("p0")).toBe("url:p0");
  });

  it("invalidate esquece a URL e notifica", async () => {
    let notified = 0;
    const cache = createSignedUrlCache({
      sign: async (list) => new Map(list.map((p) => [p.id, `url:${p.id}`])),
    });
    cache.ensure(photos(3));
    await tick();
    cache.subscribe(() => notified++);
    cache.invalidate(["p1"]);
    expect(cache.get("p1")).toBeUndefined();
    expect(cache.get("p2")).toBe("url:p2");
    expect(notified).toBe(1);
    cache.invalidate(["nao-existe"]);
    expect(notified).toBe(1);
  });
});
