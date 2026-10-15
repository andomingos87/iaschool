import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { createGuardianAlbumHandler } from "../src/routes/guardian-album";
function request(body: unknown, extra: Record<string, string> = {}) {
  const headers: Record<string, string> = { origin: "https://school.test", host: "api.test", "sec-fetch-site": "same-origin", ...extra };
  return { body, get: (name: string) => headers[name.toLowerCase()] } as unknown as Request;
}
function response() {
  const result = { code: 200, body: null as unknown, headers: new Map<string, string>(),
    setHeader: vi.fn((name: string, value: string) => { result.headers.set(name, value); }), removeHeader: vi.fn(),
    status(code: number) { result.code = code; return result; }, json(body: unknown) { result.body = body; return result; } };
  return result;
}
const token = "a".repeat(43);
const setup = (transport: typeof fetch) => createGuardianAlbumHandler({ url: () => "https://supabase.test", anonKey: () => "public-test",
  appUrl: () => "https://school.test", transport });
describe("proxy mesmo domínio do álbum", () => {
  it("recusa origem cruzada antes de chamar qualquer serviço", async () => {
    const transport = vi.fn(); const res = response();
    await setup(transport)(request({ action: "list" }, { origin: "https://other.test", "sec-fetch-site": "cross-site" }), res as unknown as Response);
    expect(res.code).toBe(403); expect(transport).not.toHaveBeenCalled();
  });
  it("envia apenas o cookie do álbum e não credenciais da escola", async () => {
    const transport = vi.fn().mockResolvedValue(new Response('{"items":[]}'));
    const res = response();
    await setup(transport)(request({ action: "list", recipientId: "other-family" }, { cookie: `school_session=secret; __Host-iaschool-album=${token}`, authorization: "Bearer school-secret" }), res as unknown as Response);
    const options = transport.mock.calls[0]![1];
    expect(options.headers.Cookie).toBe(`__Host-iaschool-album=${token}`);
    expect(options.headers.Authorization).toBe("Bearer public-test");
    expect(JSON.parse(options.body)).toEqual({ action: "list" });
    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });
  it("preserva o cookie HttpOnly Secure sem expô-lo no corpo", async () => {
    const cookie = `__Host-iaschool-album=${token}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=86400`;
    const transport = vi.fn().mockResolvedValue(new Response('{"items":[]}', { headers: { "set-cookie": cookie } }));
    const res = response();
    await setup(transport)(request({ action: "consume", token }), res as unknown as Response);
    expect(res.headers.get("Set-Cookie")).toBe(cookie);
    expect(JSON.stringify(res.body)).not.toContain(token);
  });
  it("não repassa cookie com Domain nem detalhes do erro do serviço", async () => {
    const transport = vi.fn().mockResolvedValue(new Response('{"token":"private","path":"internal"}', { status: 410,
      headers: { "set-cookie": `__Host-iaschool-album=${token}; Secure; HttpOnly; Domain=other.test` } }));
    const res = response(); await setup(transport)(request({ action: "list" }), res as unknown as Response);
    expect(res.code).toBe(410); expect(res.headers.has("Set-Cookie")).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain("private");
  });
  it("preserva somente a sessão quando o gateway também emite cookies próprios", async () => {
    const cookie = `__Host-iaschool-album=${token}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=86399`;
    const headers = new Headers();
    headers.append("set-cookie", "gateway_session=infra; Domain=supabase.test; Path=/; Expires=Mon, 12 Oct 2026 17:00:00 GMT; Secure; HttpOnly");
    headers.append("set-cookie", cookie);
    const transport = vi.fn().mockResolvedValue(new Response('{"items":[]}', { headers }));
    const res = response();
    await setup(transport)(request({ action: "consume", token }), res as unknown as Response);
    expect(res.headers.get("Set-Cookie")).toBe(cookie);
    expect(JSON.stringify(res.body)).not.toContain(token);
  });
  it("valida ação/token/seleção e não repete consume após timeout", async () => {
    const transport = vi.fn().mockRejectedValue(new Error("timeout")); const res = response();
    await setup(transport)(request({ action: "consume", token }), res as unknown as Response);
    expect(res.code).toBe(503); expect(transport).toHaveBeenCalledTimes(1);
    const invalid = response(); await setup(transport)(request({ action: "consume", token: "bad" }), invalid as unknown as Response);
    expect(invalid.code).toBe(400); expect(transport).toHaveBeenCalledTimes(1);
  });
});

it("recusa mudança de esquema mesmo quando host coincide", async () => {
  const transport=vi.fn(),res=response();
  await setup(transport)(request({action:"list"},{origin:"http://school.test"}),res as unknown as Response);
  expect(res.code).toBe(403);expect(transport).not.toHaveBeenCalled();
});
it("não repassa cookie sem Path/SameSite ou com validade acima de24h", async () => {
  for (const suffix of ["Secure; HttpOnly; Max-Age=86400", "Path=/; Secure; HttpOnly; SameSite=None; Max-Age=86400", "Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=999999"]) {
    const transport=vi.fn().mockResolvedValue(new Response('{"items":[]}',{headers:{"set-cookie":`__Host-iaschool-album=${token}; ${suffix}`}})),res=response();
    await setup(transport)(request({action:"consume",token}),res as unknown as Response);
    expect(res.headers.has("Set-Cookie")).toBe(false);
  }
});
