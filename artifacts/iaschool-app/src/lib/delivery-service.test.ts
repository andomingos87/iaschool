import { describe, expect, it, vi } from "vitest";
import { createAlbumService, createDeliveryService } from "./delivery-service";
describe("fronteira de entrega e álbum", () => {
  it("envia versão explícita e seleção ao servidor autenticado", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{"version":2}'));
    const service = createDeliveryService({ url: "https://local.test", anonKey: "public-test", token: async () => "jwt-test", fetcher });
    await service.save("lote", 1, { eventName: "Festa", callToAction: "", signature: "Escola" }, [{ recipientId: "fam", photoIds: ["p"] }]);
    const [url, options] = fetcher.mock.calls[0]!;
    expect(url).toContain("save_delivery_draft");
    expect(JSON.parse(options.body).p_expected_version).toBe(1);
    expect(options.headers.Authorization).toBe("Bearer jwt-test");
  });
  it("não chama a rede sem sessão da escola", async () => {
    const fetcher = vi.fn();
    const service = createDeliveryService({ url: "https://local.test", anonKey: "test", token: async () => null, fetcher });
    await expect(service.draft("lote")).rejects.toThrow("Entre novamente");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("álbum usa somente cookie mesmo domínio, sem IDs de família ou acesso a tabelas", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{"items":[]}'));
    await createAlbumService(fetcher).list();
    expect(fetcher.mock.calls[0]![0]).toBe("/api/guardian-album");
    expect(fetcher.mock.calls[0]![1].credentials).toBe("same-origin");
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toEqual({ action: "list" });
  });
  it("erro de revogação/expiração não expõe resposta privada do backend", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{"path":"private-path","token":"secret"}', { status: 410 }));
    await expect(createAlbumService(fetcher).list()).rejects.toThrow("venceram");
  });
  it("consulta a capacidade sem destinatário e traduz o motivo sem repetir segredo", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, sending: "blocked", reason: "paused" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "ZAPI_TOKEN=secret", code: "sending_disabled", reason: "album_not_ready" }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "APP_PUBLIC_URL=https://secret.example", code: "sending_disabled", reason: "nao_conhecido" }), { status: 503 }));
    const service = createDeliveryService({ url: "https://local.test", anonKey: "public-test", token: async () => "jwt-test", fetcher });
    await expect(service.capability()).resolves.toMatchObject({ sending: "blocked", reason: "paused" });
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toEqual({ action: "capability" });
    await expect(service.act("dispatch", "familia")).rejects.toThrow("álbum ainda não está liberado");
    const unknown = await service.act("dispatch", "familia").catch((error: Error) => error);
    expect(unknown).toBeInstanceOf(Error);
    expect((unknown as Error).message).toContain("envio está desligado");
    expect((unknown as Error).message).not.toMatch(/secret|APP_PUBLIC_URL|ZAPI/);
  });
  it("distingue link usado, revogado e envio desligado sem mostrar erro bruto", async () => {
    for (const [code, expected] of [["used", "já foi usado"], ["revoked", "revogado"], ["sending_disabled", "envio está desligado"], ["unknown", "Não repita"]]) {
      const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: code, path: "private" }), { status: 410 }));
      await expect(createAlbumService(fetcher).list()).rejects.toThrow(expected);
    }
  });
});

it("recusa erro declarado mesmo com HTTP200 e JSON inválido", async () => {
  for (const body of ['{"error":"revoked","path":"private"}','null','not-json','{"ok":false,"status":"accepted"}']) {
    const fetcher=vi.fn().mockResolvedValue(new Response(body));
    await expect(createAlbumService(fetcher).list()).rejects.toThrow();
  }
});
