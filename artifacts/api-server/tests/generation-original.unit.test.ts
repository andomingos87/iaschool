import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import sharp from "sharp";

const mocks = vi.hoisted(() => ({ edit: vi.fn(), quota: vi.fn(), log: vi.fn(), constructorOptions: vi.fn(), fileOptions: vi.fn() }));
vi.mock("../src/middlewares/supabase-auth", () => ({ requireSupabaseUser: (req: express.Request, _res: express.Response, next: express.NextFunction) => { req.supabaseUserId = "test-original"; req.log = { error: vi.fn(), warn: vi.fn() } as unknown as typeof req.log; next(); } }));
vi.mock("../src/lib/generation-quota", () => ({ consumeDailyQuota: mocks.quota, getDailyQuotaUsage: vi.fn() }));
vi.mock("../src/lib/generation-log", () => ({ newLogId: () => "local-test", writeGenerationLog: mocks.log }));
vi.mock("openai", () => { class OpenAI { constructor(options: unknown) { mocks.constructorOptions(options); } static APIError = class extends Error {}; images = { edit: mocks.edit }; }; return { OpenAI, toFile: async (buffer: Buffer, name: string, options: unknown) => { mocks.fileOptions(name, options); return buffer; } }; });
import router from "../src/routes/generation";

const c = {version:"original-pixels-v1",photoId:"synthetic",reviewed:true,points:[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}],protectedHead:{x:0.2,y:0.1,width:0.6,height:0.4}};
let original: Buffer, model: Buffer;
beforeEach(async () => {
  vi.stubEnv("OPENAI_API_KEY", "local-test-placeholder");
  mocks.quota.mockReset().mockResolvedValue({kind:"ok"}); mocks.constructorOptions.mockReset(); mocks.fileOptions.mockReset(); mocks.edit.mockReset(); mocks.log.mockReset().mockResolvedValue(undefined);
  original = await sharp({create:{width:30,height:40,channels:4,background:"red"}}).png().toBuffer();
  model = await sharp({create:{width:1024,height:1024,channels:4,background:"blue"}}).png().toBuffer();
  mocks.edit.mockResolvedValue({data:[{b64_json:model.toString("base64")}]});
 });
afterEach(() => { vi.unstubAllEnvs(); });
async function post(composition: unknown, prompt = "Arte escolar", simple = false, invalid = false) {
  const entry = router.stack.find((layer: {route?: {path: string}}) => layer.route?.path === "/generation/post-image");
  const handler = entry.route.stack.at(-1).handle;
  let status = 200; let body: unknown;
  const req = { body: {prompt,mode: simple ? "photo_prompt" : undefined,composition: JSON.stringify(composition)}, supabaseUserId: simple ? "test-simple" : "test-original", files: simple ? [{buffer:invalid ? Buffer.from("invalid") : original,size:original.length,mimetype:"image/png",originalname:"original.png"}] : [
    {buffer:model,size:model.length,mimetype:"image/png",originalname:"modelo.png"},
    {buffer:original,size:original.length,mimetype:"image/png",originalname:"original.png"},
  ], log: {error:vi.fn(),warn:vi.fn()} };
  const res = {status: (code: number) => {status=code; return res;}, json: (value: unknown) => {body=value; return res;} };
  await handler(req,res);
  return {status,json: async () => body};
}

describe("endpoint composição original (mocks, sem serviços externos)", () => {
  it("nega chamada fora da tela sem revisão e não consome cota", async () => {
    expect((await post(null)).status).toBe(400); expect(mocks.quota).not.toHaveBeenCalled(); expect(mocks.edit).not.toHaveBeenCalled();
  });
  it("nega pedido de trocar roupa antes de cota", async () => {
    expect((await post(c,"Troque a roupa do aluno")).status).toBe(400); expect(mocks.quota).not.toHaveBeenCalled();
  });
  it("envia só o modelo para IA e compõe pixels originais com auditoria sanitizada", async () => {
    const response = await post(c); expect(response.status).toBe(200);
    expect(mocks.constructorOptions).toHaveBeenCalledWith(expect.objectContaining({maxRetries:0,timeout:150_000}));
    expect(mocks.edit).toHaveBeenCalledTimes(1);
    const call = mocks.edit.mock.calls[0]![0]; expect(call.image).toHaveLength(1); expect(call.image[0].equals(model)).toBe(true);
    const body = await response.json() as {imageUrl:string};
    const output = Buffer.from(body.imageUrl.split(",")[1]!,"base64");
    const pixels = await sharp(output).extract({left:497,top:492,width:30,height:40}).raw().toBuffer();
    expect(pixels.equals(await sharp(original).raw().toBuffer())).toBe(true);
    expect(mocks.log.mock.calls.at(-1)![0]).toMatchObject({prompt:null,resultB64:null,studentName:null});
    expect(mocks.log.mock.calls.at(-1)![0].attachments.every((a: {buffer?:unknown}) => !a.buffer)).toBe(true);
  });
});


describe("foto de referência e prompt", () => {
  it("envia uma foto e instruções sem exigir recorte ou modelo de estilo", async () => {
    const response = await post(null, "Crie um cartaz de boas-vindas", true);
    expect(response.status).toBe(200);
    const call = mocks.edit.mock.calls[0]![0];
    expect(call.image).toHaveLength(1);
    expect(call.image[0].equals(original)).toBe(true);
    expect(call.prompt).toContain("Crie um cartaz de boas-vindas");
    expect(call.prompt).toContain("Preserve a identidade");
    expect(call.prompt).not.toContain("nos pixels");
    expect(mocks.quota).toHaveBeenCalledTimes(1);
    const body = await response.json() as {imageUrl:string};
    expect((await sharp(Buffer.from(body.imageUrl.split(",")[1]!, "base64")).metadata()).format).toBe("png");
    expect(mocks.log.mock.calls.at(-1)![0].payload).toMatchObject({imageCount:1,compositionVersion:null,protectionVersion:"photo-prompt-identity-v1"});
  });
  it("nega prompt vazio e foto inválida antes de consumir cota", async () => {
    expect((await post(null, "   ", true)).status).toBe(400);
    expect((await post(null, "Arte escolar", true, true)).status).toBe(400);
    expect(mocks.quota).not.toHaveBeenCalled();
    expect(mocks.edit).not.toHaveBeenCalled();
  });
});

  it("nega imagem com cabeçalho válido e pixels truncados antes da cota", async () => {
    original = original.subarray(0, original.length - 20);
    expect((await sharp(original).metadata()).width).toBe(30);
    const response = await post(null, "Arte escolar", true);
    expect(response.status).toBe(400);
    expect(mocks.quota).not.toHaveBeenCalled();
    expect(mocks.edit).not.toHaveBeenCalled();
  });
  it("normaliza a mesma foto sem exportar EXIF ao provedor", async () => {
    original = await sharp(original).jpeg().withExif({ IFD0: { Artist: "Pessoa teste", ImageDescription: "Informação privada sintética" } }).toBuffer();
    expect((await sharp(original).metadata()).exif).toBeDefined();
    const response = await post(null, "Arte escolar", true);
    expect(response.status).toBe(200);
    const uploaded = mocks.edit.mock.calls[0]![0].image[0];
    const meta = await sharp(uploaded).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(30);expect(meta.height).toBe(40);
    expect(mocks.fileOptions).toHaveBeenCalledWith("foto-referencia.png", {type:"image/png"});
    expect(mocks.edit).toHaveBeenCalledTimes(1);
  });
