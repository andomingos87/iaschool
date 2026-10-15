import { describe, expect, it, vi } from "vitest";
import { buildGuardianAlbumZip, getAlbumPhotoBytes } from "./album-download";
import { DeliveryServiceError } from "./delivery-service";
const bytes = new Uint8Array([255,216,255,224,0,0,0,0,0,0,0,0,255,217]);
const sign = async (id: string) => ({ url: `https://files.test/${id}`, filename: `${id}.jpg`, expiresAt: "2026-10-13T00:00:00Z" });
const items = ["a", "b", "a"].map((id, index) => ({ id: `${id}-${index}`, photoId: id, width: 1, height: 1, thumbUrl: `https://files.test/${id}` }));
describe("download protegido sob demanda", () => {
  it("reassina a foto a cada chamada, sem transmitir cookie ou referer ao storage", async () => {
    const signer = vi.fn(sign);
    const transport = vi.fn().mockImplementation(async () => new Response(bytes));
    await getAlbumPhotoBytes("a", signer, transport); await getAlbumPhotoBytes("a", signer, transport);
    expect(signer).toHaveBeenCalledTimes(2);
    expect(transport.mock.calls[0]![1]).toMatchObject({ credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store" });
  });
  it("recusa erro de arquivo e resposta HTML", async () => {
    await expect(getAlbumPhotoBytes("a", sign, async () => new Response("html", { status: 403 }))).rejects.toThrow("venceu");
    await expect(getAlbumPhotoBytes("a", sign, async () => new Response("<html>indisponível</html>"))).rejects.toThrow("não é uma foto");
  });
  it("deduplica irmãos, preserva ordem e audita somente o conjunto incluído", async () => {
    const audit = vi.fn().mockResolvedValue({ok:true});
    const signing = vi.fn(sign);
    const result = await buildGuardianAlbumZip({ items, sign: signing, transport: async () => new Response(bytes), audit });
    expect(result.included).toBe(2); expect(result.missing).toBe(0);
    expect(signing.mock.calls.map(call => call[0])).toEqual(["a-0", "b-1"]);
    expect(audit).toHaveBeenCalledWith(["a-0", "b-1"]);
    expect(new DataView(await result.blob.arrayBuffer()).getUint32(0, true)).toBe(0x04034b50);
  });
  it("informa falha parcial e não cria pacote quando não há foto válida", async () => {
    const partial = await buildGuardianAlbumZip({ items, sign, transport: async url => new Response(bytes, { status: String(url).endsWith("b-1") ? 503 : 200 }), audit: async () => ({ok:true}) });
    expect(partial).toMatchObject({ included: 1, missing: 1 });
    await expect(buildGuardianAlbumZip({ items: [], sign, audit: async () => ({ok:true}) })).rejects.toThrow("Nenhuma foto");
    await expect(buildGuardianAlbumZip({ items, sign, transport: async () => new Response("html"), audit: async () => ({ok:true}) })).rejects.toThrow("Nenhuma foto pôde");
  });
  it("revogação/expiração de sessão no meio do ZIP interrompe o pacote", async () => {
    const audit = vi.fn().mockResolvedValue({ok:true});
    await expect(buildGuardianAlbumZip({ items, sign: async id => {
      if (id === "b-1") throw new DeliveryServiceError(410, "Sessão expirada"); return sign(id);
    }, transport: async () => new Response(bytes), audit })).rejects.toThrow("Sessão expirada");
    expect(audit).not.toHaveBeenCalled();
  });
});

it("não libera ZIP se a auditoria retorna falso ou resposta incompleta", async () => {
  for (const result of [{ok:false}, undefined]) {
    await expect(buildGuardianAlbumZip({items,sign,transport:async()=>new Response(bytes),audit:async()=>result as {ok:boolean}})).rejects.toThrow("revalidar");
  }
});
