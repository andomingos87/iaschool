// Testes de integração do middleware de autorização da rota de geração.
// Sobe um app Express mínimo com requireSupabaseUser na frente de um handler
// stub e verifica, com sessões reais do Supabase, que:
//   - sem token       → 401
//   - conta pendente  → 403
//   - escola aprovada → passa (200 do stub)
// O caso "conta de aluno → 403" saiu no M1: o papel `student` não existe mais
// (a constraint de `profiles.role` só aceita dev, super_admin e user).
import express from "express";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { requireSupabaseUser } from "../src/middlewares/supabase-auth";
import {
  adminUpdateProfile,
  cleanupTestData,
  createTestUser,
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
let pendingUser: TestUser;
const createdUsers: string[] = [];

beforeAll(async () => {
  const app = express();
  // O middleware usa req.log (pino-http); stub suficiente para os testes.
  app.use((req, _res, next) => {
    (req as unknown as { log: unknown }).log = {
      warn: () => undefined,
      error: () => undefined,
      info: () => undefined,
    };
    next();
  });
  app.post("/api/generation/post-image", requireSupabaseUser, (_req, res) => {
    res.json({ ok: true });
  });
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("porta inválida");
  baseUrl = `http://127.0.0.1:${address.port}`;

  schoolUser = await createTestUser({
    label: "gen-school",
    signupRole: "school_user",
    schoolName: "Escola Geradora",
  });
  pendingUser = await createTestUser({
    label: "gen-pending",
    signupRole: "school_user",
    schoolName: "Escola Pendente",
  });
  createdUsers.push(schoolUser.id, pendingUser.id);

  await adminUpdateProfile(schoolUser.id, { approval_status: "approved" });
}, 120_000);

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  await cleanupTestData({ users: createdUsers });
}, 120_000);

async function callGeneration(token?: string): Promise<number> {
  const resp = await fetch(`${baseUrl}/api/generation/post-image`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({}),
  });
  return resp.status;
}

describe("rota de geração — autorização", () => {
  it("rejeita requisição sem token com 401", async () => {
    expect(await callGeneration()).toBe(401);
  });

  it("rejeita token inválido com 401", async () => {
    expect(await callGeneration("token-invalido")).toBe(401);
  });

  it("rejeita conta pendente com 403", async () => {
    expect(await callGeneration(pendingUser.token)).toBe(403);
  });

  it("deixa escola aprovada passar pelo middleware", async () => {
    expect(await callGeneration(schoolUser.token)).toBe(200);
  });
});
