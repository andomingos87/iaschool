// Testes de integração do recebimento multipart da rota de geração.
// Sobe o app real (com multer) e verifica, com uma sessão válida de escola
// aprovada, que a validação por arquivo funciona e responde em português —
// tudo antes de qualquer chamada à OpenAI (nenhum custo).
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../src/app";
import {
  adminUpdateProfile,
  createTestUser,
  deleteTestUser,
  envReady,
  type TestUser,
} from "./supabase-test-utils";

if (!envReady()) {
  throw new Error(
    "Testes exigem SUPABASE_URL/VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY.",
  );
}

let server: Server;
let baseUrl: string;
let schoolUser: TestUser;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("porta inválida");
  baseUrl = `http://127.0.0.1:${address.port}`;

  schoolUser = await createTestUser({
    label: "gen-multipart",
    signupRole: "school_user",
    schoolName: "Escola Multipart",
  });
  await adminUpdateProfile(schoolUser.id, { approval_status: "approved" });
}, 120_000);

afterAll(async () => {
  if (schoolUser) await deleteTestUser(schoolUser.id);
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
}, 120_000);

async function post(form: FormData): Promise<{ status: number; error?: string }> {
  const resp = await fetch(`${baseUrl}/api/generation/post-image`, {
    method: "POST",
    headers: { Authorization: `Bearer ${schoolUser.token}` },
    body: form,
  });
  const body = (await resp.json().catch(() => null)) as { error?: string } | null;
  return { status: resp.status, error: body?.error };
}

function pngFile(name = "img.png"): File {
  // PNG mínimo: só a assinatura basta para o teste (o multer valida mimetype).
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return new File([bytes], name, { type: "image/png" });
}

describe("rota de geração — multipart/form-data", () => {
  it("rejeita arquivo de tipo não suportado com mensagem em português", async () => {
    const form = new FormData();
    form.append("prompt", "teste");
    form.append("images", new File(["ola"], "nota.txt", { type: "text/plain" }));
    const res = await post(form);
    expect(res.status).toBe(400);
    expect(res.error).toContain("Tipo de imagem não suportado");
  });

  it("rejeita multipart sem imagens", async () => {
    const form = new FormData();
    form.append("prompt", "teste");
    const res = await post(form);
    expect(res.status).toBe(400);
    expect(res.error).toContain("ao menos uma imagem");
  });

  it("rejeita multipart sem prompt", async () => {
    const form = new FormData();
    form.append("images", pngFile());
    const res = await post(form);
    expect(res.status).toBe(400);
    expect(res.error).toContain("prompt");
  });

  it("rejeita mais de 6 imagens", async () => {
    const form = new FormData();
    form.append("prompt", "teste");
    for (let i = 0; i < 7; i++) form.append("images", pngFile(`img-${i}.png`));
    const res = await post(form);
    expect(res.status).toBe(400);
    expect(res.error).toContain("No máximo 6 imagens");
  });
});
