// Testes de integração do M4 contra o Supabase real (migrations
// iaschool_fase3_authorizations_reference_faces,
// iaschool_fase3_has_active_authorization_tenant_check e
// iaschool_fase3_reference_face_jobs):
//   1. `authorizations`: um aceite ativo por (aluno, escopo); a prova é
//      congelada (só `revoked_at` muda, e nunca de volta para nulo); não há
//      delete nem para membro nem para ninguém pela API.
//   2. Isolamento: membro de A não lê nem grava autorização de B.
//   3. `student_reference_faces` é invisível para `authenticated`; a leitura
//      passa por RPC e nunca devolve o vetor.
//   4. Fila `student_reference_jobs`: sem `biometric_sorting` ativa não entra
//      job; o worker (service_role) reivindica, conclui e a referência nasce.
//   5. `student_biometric_readiness` recusa escola de outro tenant.
//   6. Storage `student-refs`: o upload exige consentimento ativo do aluno
//      que está no 2º segmento do caminho.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ANON_KEY,
  SUPABASE_URL,
  adminApproveSchool,
  adminInsert,
  adminRest,
  adminRpc,
  createTestUser,
  deleteTestUser,
  envReady,
  userDelete,
  userInsert,
  userInsertReturning,
  userRpc,
  userSelect,
  userUpdate,
  type TestUser,
} from "./supabase-test-utils";

if (!envReady()) {
  throw new Error(
    "Testes de RLS exigem SUPABASE_URL/VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY.",
  );
}

let schoolA: TestUser;
let schoolB: TestUser;
const createdUsers: string[] = [];
let schoolAId = "";
let schoolBId = "";
let studentA = "";
let studentB = "";

/** Vetor de 512 posições: qualquer valor serve, o que importa é a forma. */
const EMBEDDING = `[${Array.from({ length: 512 }, () => 0.1).join(",")}]`;

async function newStudent(schoolId: string, uid: string, name: string) {
  return adminInsert("students", {
    school_id: schoolId,
    owner_id: uid,
    name,
    whatsapp: `+5511${Math.floor(1e8 + Math.random() * 8e8)}`,
    photos: [],
  });
}

/** Aceite ativo criado com service role, para os casos que já o pressupõem. */
async function grant(schoolId: string, studentId: string, uid: string, scope: string) {
  return adminInsert("authorizations", {
    school_id: schoolId,
    student_id: studentId,
    scope,
    granted_at: new Date().toISOString(),
    created_by: uid,
  });
}

beforeAll(async () => {
  schoolA = await createTestUser({ label: "auth-a", signupRole: "school", schoolName: "Escola A" });
  schoolB = await createTestUser({ label: "auth-b", signupRole: "school", schoolName: "Escola B" });
  createdUsers.push(schoolA.id, schoolB.id);
  schoolAId = await adminApproveSchool(schoolA.id);
  schoolBId = await adminApproveSchool(schoolB.id);
  studentA = await newStudent(schoolAId, schoolA.id, "Aluno A");
  studentB = await newStudent(schoolBId, schoolB.id, "Aluno B");
}, 120_000);

afterAll(async () => {
  // Autorizações, referências e jobs cascateiam pelo aluno; aluno pela escola.
  for (const id of createdUsers) await deleteTestUser(id);
  for (const id of [schoolAId, schoolBId]) {
    if (id) await adminRest(`schools?id=eq.${id}`, { method: "DELETE" });
  }
}, 120_000);

describe("authorizations", () => {
  it("membro registra o aceite e o vê; membro de outra escola não", async () => {
    const created = await userInsertReturning(schoolA, "authorizations", {
      school_id: schoolAId,
      student_id: studentA,
      scope: "internal_use",
      granted_at: new Date().toISOString(),
      created_by: schoolA.id,
      evidence: { source: "school_declaration", terms_version: null },
    });
    expect(created.status).toBeLessThan(300);

    const mine = await userSelect(schoolA, "authorizations", `student_id=eq.${studentA}`);
    expect(mine.rows.length).toBeGreaterThan(0);

    const foreign = await userSelect(schoolB, "authorizations", `student_id=eq.${studentA}`);
    expect(foreign.rows).toHaveLength(0);
  });

  it("não deixa apontar para aluno de outra escola", async () => {
    const status = await userInsert(schoolA, "authorizations", {
      school_id: schoolAId,
      student_id: studentB,
      scope: "social_media",
      granted_at: new Date().toISOString(),
      created_by: schoolA.id,
    });
    expect(status).toBeGreaterThanOrEqual(400);
  });

  it("um aceite ativo por (aluno, escopo); reconceder exige revogar antes", async () => {
    const first = await userInsertReturning(schoolA, "authorizations", {
      school_id: schoolAId,
      student_id: studentA,
      scope: "social_media",
      granted_at: new Date().toISOString(),
      created_by: schoolA.id,
    });
    expect(first.status).toBeLessThan(300);
    const id = first.row!["id"] as string;

    const duplicate = await userInsert(schoolA, "authorizations", {
      school_id: schoolAId,
      student_id: studentA,
      scope: "social_media",
      granted_at: new Date().toISOString(),
      created_by: schoolA.id,
    });
    expect(duplicate).toBe(409);

    const revoked = await userUpdate(schoolA, "authorizations", `id=eq.${id}`, {
      revoked_at: new Date().toISOString(),
    });
    expect((revoked.rows[0] as Record<string, unknown>)["revoked_at"]).not.toBeNull();

    const again = await userInsert(schoolA, "authorizations", {
      school_id: schoolAId,
      student_id: studentA,
      scope: "social_media",
      granted_at: new Date().toISOString(),
      created_by: schoolA.id,
    });
    expect(again).toBeLessThan(300);

    // O histórico das duas linhas fica.
    const all = await userSelect(
      schoolA,
      "authorizations",
      `student_id=eq.${studentA}&scope=eq.social_media&select=id`,
    );
    expect(all.rows).toHaveLength(2);
  });

  it("a prova é congelada: só `revoked_at` muda, e nunca volta para nulo", async () => {
    const created = await userInsertReturning(schoolA, "authorizations", {
      school_id: schoolAId,
      student_id: studentA,
      scope: "delivery_whatsapp",
      granted_at: "2026-09-01T10:00:00Z",
      created_by: schoolA.id,
      evidence: { source: "school_declaration", registered_by: "Coordenação" },
    });
    const id = created.row!["id"] as string;

    const tampered = await userUpdate(schoolA, "authorizations", `id=eq.${id}`, {
      evidence: { source: "guardian_portal", registered_by: "adulterado" },
      granted_at: "2020-01-01T00:00:00Z",
      scope: "social_media",
    });
    expect(tampered.status).toBeLessThan(300);
    const after = tampered.rows[0] as Record<string, unknown>;
    expect((after["evidence"] as Record<string, unknown>)["registered_by"]).toBe("Coordenação");
    expect(after["scope"]).toBe("delivery_whatsapp");
    expect(String(after["granted_at"])).toContain("2026-09-01");

    await userUpdate(schoolA, "authorizations", `id=eq.${id}`, {
      revoked_at: new Date().toISOString(),
    });
    const unrevoke = await userUpdate(schoolA, "authorizations", `id=eq.${id}`, {
      revoked_at: null,
    });
    expect(unrevoke.status).toBeGreaterThanOrEqual(400);
  });

  it("consentimento não se apaga pela API", async () => {
    const id = await grant(schoolAId, studentA, schoolA.id, "biometric_sorting");
    const resp = await userDelete(schoolA, "authorizations", `id=eq.${id}`);
    // Sem policy e sem privilégio de delete: a linha continua lá.
    const still = await userSelect(schoolA, "authorizations", `id=eq.${id}&select=id`);
    expect(resp.status).toBeGreaterThanOrEqual(400);
    expect(still.rows).toHaveLength(1);
  });
});

describe("student_reference_faces", () => {
  it("é invisível para authenticated; a leitura é pela RPC, sem o vetor", async () => {
    const authId = await grant(schoolBId, studentB, schoolB.id, "biometric_sorting");
    await adminInsert("student_reference_faces", {
      school_id: schoolBId,
      student_id: studentB,
      embedding: EMBEDDING,
      authorization_id: authId,
      created_by: schoolB.id,
      quality: 0.9,
      source_photo_path: `${schoolBId}/${studentB}/ref.jpg`,
    });

    const direct = await userSelect(schoolB, "student_reference_faces", "select=*");
    expect(direct.status).toBeGreaterThanOrEqual(400);

    const viaRpc = await userRpc(schoolB, "list_student_reference_faces", {
      p_student: studentB,
    });
    expect(viaRpc.status).toBeLessThan(300);
    expect(viaRpc.rows).toHaveLength(1);
    const row = viaRpc.rows[0] as Record<string, unknown>;
    expect(row).not.toHaveProperty("embedding");
    expect(row["retention_until"]).toBe(`${new Date().getFullYear()}-12-31`);

    // Aluno de outra escola: a RPC recusa.
    const foreign = await userRpc(schoolA, "list_student_reference_faces", {
      p_student: studentB,
    });
    expect(foreign.status).toBeGreaterThanOrEqual(400);
  });
});

describe("fila do rosto de referência", () => {
  it("sem biometric_sorting ativa, o job é recusado", async () => {
    const student = await newStudent(schoolAId, schoolA.id, "Sem consentimento");
    // Autorização registrada mas sem aceite: não vale.
    const authId = await adminInsert("authorizations", {
      school_id: schoolAId,
      student_id: student,
      scope: "biometric_sorting",
      created_by: schoolA.id,
    });
    const status = await userInsert(schoolA, "student_reference_jobs", {
      school_id: schoolAId,
      student_id: student,
      authorization_id: authId,
      storage_path: `${schoolAId}/${student}/${crypto.randomUUID()}.jpg`,
      created_by: schoolA.id,
    });
    expect(status).toBeGreaterThanOrEqual(400);
  });

  it("com consentimento o job entra, o worker conclui e a referência nasce", async () => {
    const student = await newStudent(schoolAId, schoolA.id, "Com consentimento");
    const authId = await grant(schoolAId, student, schoolA.id, "biometric_sorting");
    const path = `${schoolAId}/${student}/${crypto.randomUUID()}.jpg`;

    const created = await userInsertReturning(schoolA, "student_reference_jobs", {
      school_id: schoolAId,
      student_id: student,
      authorization_id: authId,
      storage_path: path,
      created_by: schoolA.id,
    });
    expect(created.status).toBeLessThan(300);
    const jobId = created.row!["id"] as string;
    expect(created.row!["status"]).toBe("queued");

    // Membro de outra escola não vê a fila de A.
    const foreign = await userSelect(schoolB, "student_reference_jobs", `id=eq.${jobId}`);
    expect(foreign.rows).toHaveLength(0);

    // A escola não muda o estado do job (sem policy nem privilégio de update).
    const tampered = await userUpdate(schoolA, "student_reference_jobs", `id=eq.${jobId}`, {
      status: "done",
    });
    expect(tampered.status).toBeGreaterThanOrEqual(400);

    // Nem reivindica: a RPC do worker é só do service_role.
    const claimAsUser = await userRpc(schoolA, "claim_student_reference_jobs", {
      p_limit: 5,
      p_lease_seconds: 60,
    });
    expect(claimAsUser.status).toBeGreaterThanOrEqual(400);

    const claimed = await adminRpc("claim_student_reference_jobs", {
      p_limit: 20,
      p_lease_seconds: 120,
    });
    expect(claimed.status).toBeLessThan(300);
    expect((claimed.body as Array<{ id: string }>).some((j) => j.id === jobId)).toBe(true);

    // Concluir sem vetor é erro: a referência não existe sem embedding.
    const noVector = await adminRpc("complete_student_reference_job", {
      p_job_id: jobId,
      p_ok: true,
    });
    expect(noVector.status).toBeGreaterThanOrEqual(400);

    const done = await adminRpc("complete_student_reference_job", {
      p_job_id: jobId,
      p_ok: true,
      p_embedding: EMBEDDING,
      p_quality: 0.87,
    });
    expect(done.body).toBe("done");

    const faces = await userRpc(schoolA, "list_student_reference_faces", {
      p_student: student,
    });
    expect(faces.rows).toHaveLength(1);
    expect((faces.rows[0] as Record<string, unknown>)["source_photo_path"]).toBe(path);

    // A escola remove a referência pela RPC, que devolve o caminho do objeto.
    const faceId = (faces.rows[0] as Record<string, unknown>)["id"] as string;
    const removed = await userRpc(schoolA, "delete_student_reference_face", {
      p_face_id: faceId,
    });
    expect(removed.body).toBe(path);
    const after = await userRpc(schoolA, "list_student_reference_faces", {
      p_student: student,
    });
    expect(after.rows).toHaveLength(0);
  });

  it("consentimento revogado na fila derruba o job, não trava nele", async () => {
    const student = await newStudent(schoolAId, schoolA.id, "Revogado na fila");
    const authId = await grant(schoolAId, student, schoolA.id, "biometric_sorting");
    const created = await userInsertReturning(schoolA, "student_reference_jobs", {
      school_id: schoolAId,
      student_id: student,
      authorization_id: authId,
      storage_path: `${schoolAId}/${student}/${crypto.randomUUID()}.jpg`,
      created_by: schoolA.id,
    });
    const jobId = created.row!["id"] as string;

    await adminRpc("claim_student_reference_jobs", { p_limit: 20, p_lease_seconds: 120 });
    await userUpdate(schoolA, "authorizations", `id=eq.${authId}`, {
      revoked_at: new Date().toISOString(),
    });

    const done = await adminRpc("complete_student_reference_job", {
      p_job_id: jobId,
      p_ok: true,
      p_embedding: EMBEDDING,
    });
    expect(done.body).toBe("revoked");

    const after = await userSelect(schoolA, "student_reference_jobs", `id=eq.${jobId}`);
    expect((after.rows[0] as Record<string, unknown>)["status"]).toBe("failed");
    const faces = await userRpc(schoolA, "list_student_reference_faces", {
      p_student: student,
    });
    expect(faces.rows).toHaveLength(0);
  });

  it("a escola desiste de um job apagando a linha", async () => {
    const student = await newStudent(schoolAId, schoolA.id, "Desistência");
    const authId = await grant(schoolAId, student, schoolA.id, "biometric_sorting");
    const created = await userInsertReturning(schoolA, "student_reference_jobs", {
      school_id: schoolAId,
      student_id: student,
      authorization_id: authId,
      storage_path: `${schoolAId}/${student}/${crypto.randomUUID()}.jpg`,
      created_by: schoolA.id,
    });
    const jobId = created.row!["id"] as string;

    const foreignDelete = await userDelete(schoolB, "student_reference_jobs", `id=eq.${jobId}`);
    expect(foreignDelete.rows).toHaveLength(0);

    const own = await userDelete(schoolA, "student_reference_jobs", `id=eq.${jobId}`);
    expect(own.rows).toHaveLength(1);
  });
});

describe("student_biometric_readiness", () => {
  it("uma linha por aluno ativo e recusa escola de outro tenant", async () => {
    const mine = await userRpc(schoolA, "student_biometric_readiness", {
      p_school: schoolAId,
    });
    expect(mine.status).toBeLessThan(300);
    const rows = mine.rows as Array<Record<string, unknown>>;
    expect(rows.length).toBeGreaterThan(0);
    const first = rows.find((r) => r["student_id"] === studentA)!;
    expect(first).toBeDefined();
    expect(typeof first["has_consent"]).toBe("boolean");
    expect(typeof first["reference_count"]).toBe("number");

    const foreign = await userRpc(schoolA, "student_biometric_readiness", {
      p_school: schoolBId,
    });
    expect(foreign.status).toBeGreaterThanOrEqual(400);
  });
});

describe("storage: student-refs", () => {
  const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);

  async function upload(user: TestUser, path: string, type = "image/jpeg") {
    const resp = await fetch(`${SUPABASE_URL}/storage/v1/object/student-refs/${path}`, {
      method: "POST",
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${user.token}`, "Content-Type": type },
      body: JPEG,
    });
    return resp.status;
  }

  async function del(user: TestUser, path: string) {
    await fetch(`${SUPABASE_URL}/storage/v1/object/student-refs/${path}`, {
      method: "DELETE",
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${user.token}` },
    });
  }

  it("exige consentimento ativo do aluno do caminho", async () => {
    const student = await newStudent(schoolAId, schoolA.id, "Storage");
    const semConsentimento = `${schoolAId}/${student}/${crypto.randomUUID()}.jpg`;
    expect(await upload(schoolA, semConsentimento)).toBeGreaterThanOrEqual(400);

    await grant(schoolAId, student, schoolA.id, "biometric_sorting");
    const comConsentimento = `${schoolAId}/${student}/${crypto.randomUUID()}.jpg`;
    expect(await upload(schoolA, comConsentimento)).toBeLessThan(300);

    // Membro de outra escola não sobe no prefixo de A nem lendo o consentimento.
    expect(
      await upload(schoolB, `${schoolAId}/${student}/${crypto.randomUUID()}.jpg`),
    ).toBeGreaterThanOrEqual(400);

    await del(schoolA, comConsentimento);
  });

  it("recusa o caminho sem o id do aluno no 2º segmento", async () => {
    const student = await newStudent(schoolAId, schoolA.id, "Storage raso");
    await grant(schoolAId, student, schoolA.id, "biometric_sorting");
    expect(await upload(schoolA, `${schoolAId}/solto.jpg`)).toBeGreaterThanOrEqual(400);
  });
});
