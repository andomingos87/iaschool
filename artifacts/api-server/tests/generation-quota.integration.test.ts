// Testes de integração do endpoint GET /api/generation/quota:
//   - sem token → 401
//   - escola aprovada → 200 com saldo (available=true, used/remaining coerentes)
import express from "express";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import generationRouter from "../src/routes/generation";
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
  const app = express();
  // O router usa req.log (pino-http); stub suficiente para os testes.
  app.use((req, _res, next) => {
    (req as unknown as { log: unknown }).log = {
      warn: () => undefined,
      error: () => undefined,
      info: () => undefined,
    };
    next();
  });
  app.use("/api", generationRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("porta inválida");
  baseUrl = `http://127.0.0.1:${address.port}`;

  schoolUser = await createTestUser({
    label: "quota-school",
    signupRole: "school_user",
    schoolName: "Escola Cota",
  });
  await adminUpdateProfile(schoolUser.id, { approval_status: "approved" });
}, 60_000);

afterAll(async () => {
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  if (schoolUser) await deleteTestUser(schoolUser.id);
}, 30_000);

describe("GET /api/generation/quota", () => {
  it("exige autenticação (401 sem token)", async () => {
    const res = await fetch(`${baseUrl}/api/generation/quota`);
    expect(res.status).toBe(401);
  });

  it("retorna o saldo do dia para escola aprovada", async () => {
    const res = await fetch(`${baseUrl}/api/generation/quota`, {
      headers: { Authorization: `Bearer ${schoolUser.token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      available: boolean;
      limit: number;
      used?: number;
      remaining?: number;
    };
    expect(typeof body.limit).toBe("number");
    expect(body.limit).toBeGreaterThan(0);
    // Com Supabase configurado nos testes, o saldo deve estar disponível.
    expect(body.available).toBe(true);
    expect(body.used).toBe(0); // usuário recém-criado não gerou nada hoje
    expect(body.remaining).toBe(body.limit);
  });
});
