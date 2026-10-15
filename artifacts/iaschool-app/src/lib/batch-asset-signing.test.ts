import { describe, expect, it, vi } from "vitest";
import { signStoragePaths } from "./batch-asset-signing";
const batch = "school/generation-batches/batch/item/1.png";
describe("assinatura de artes do lote", () => {
  it("renova lote em 300s a cada consulta e preserva cache/TTL legado", async () => {
    const cache = new Map<string,string>();
    let calls = 0;
    const sign = vi.fn(async (paths:string[], _ttl:number) => { calls++; return paths.map(path => ({path,signedUrl:`signed-${calls}-${path}`})); });
    await signStoragePaths("generated", [batch,"school/antiga.png"], cache, 31536000, sign);
    await signStoragePaths("generated", [batch,"school/antiga.png"], cache, 31536000, sign);
    expect(sign.mock.calls).toEqual([[["school/antiga.png"],31536000],[[batch],300],[[batch],300]]);
    expect(cache.has(`generated/${batch}`)).toBe(false);
    expect(cache.has("generated/school/antiga.png")).toBe(true);
  });
  it("não reutiliza assinatura do lote após negar nova leitura", async () => {
    const cache = new Map([[`generated/${batch}`,"old-url"]]);
    const sign = vi.fn().mockRejectedValue(new Error("revoked"));
    expect((await signStoragePaths("generated",[batch],cache,31536000,sign)).has(batch)).toBe(false);
  });
  it("não aplica respostas parciais ou caminhos fora do pedido", async () => {
    const result = await signStoragePaths("generated",[batch],new Map(),31536000,async () => [{path:batch,signedUrl:null},{path:"foreign/file.png",signedUrl:"wrong"}]);
    expect(result.size).toBe(0);
  });
});
