// Testes de integração do M5 contra o Supabase real (migrations
// iaschool_fase3_photo_faces_recognition e iaschool_fase3_permanent_job_failure):
//   1. O vetor de `photo_faces` é bloqueado por privilégio de COLUNA: pedir
//      `select=embedding` com token válido não devolve dado nenhum.
//   2. Membro da escola A lê os rostos de A e não os de B.
//   3. Cliente não insere, altera nem apaga rosto — isso é do worker.
//   4. `match_reference_faces` não é executável por `authenticated` (D7).
//   5. `student_photos` traz só `confirmed` e recusa aluno de outro tenant.
//   6. `face_recognition_settings` é legível por todos e editável só por `dev`.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ANON_KEY,
  SUPABASE_URL,
  adminApproveSchool,
  adminInsert,
  adminRest,
  createTestUser,
  deleteTestUser,
  envReady,
  userInsert,
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
let eventA = "";
let photoA = "";
let faceA = "";

const EMBEDDING = `[${Array.from({ length: 512 }, () => 0.1).join(",")}]`;
const BBOX = { x: 10, y: 20, w: 120, h: 120 };

async function newStudent(schoolId: string, uid: string, name: string) {
  return adminInsert("students", {
    school_id: schoolId,
    owner_id: uid,
    name,
    whatsapp: `+5511${Math.floor(1e8 + Math.random() * 8e8)}`,
    photos: [],
  });
}

async function newPhoto(schoolId: string, eventId: string, uid: string) {
  return adminInsert("photos", {
    school_id: schoolId,
    event_id: eventId,
    storage_path: `${schoolId}/${eventId}/${crypto.randomUUID()}.jpg`,
    content_hash: crypto.randomUUID().replace(/-/g, "").repeat(2),
    original_filename: "cena.jpg",
    bytes: 1000,
    status: "processed",
    uploaded_by: uid,
  });
}

beforeAll(async () => {
  schoolA = await createTestUser({ label: "faces-a", signupRole: "school", schoolName: "Escola A" });
  schoolB = await createTestUser({ label: "faces-b", signupRole: "school", schoolName: "Escola B" });
  createdUsers.push(schoolA.id, schoolB.id);
  schoolAId = await adminApproveSchool(schoolA.id);
  schoolBId = await adminApproveSchool(schoolB.id);
  studentA = await newStudent(schoolAId, schoolA.id, "Aluno A");
  studentB = await newStudent(schoolBId, schoolB.id, "Aluno B");

  eventA = await adminInsert("events", {
    school_id: schoolAId,
    name: "Festa A",
    event_date: "2026-06-20",
    created_by: schoolA.id,
  });
  photoA = await newPhoto(schoolAId, eventA, schoolA.id);

  // Um rosto atribuído a um aluno com consentimento: é o único caso em que o
  // vetor pode existir (D5).
  await adminInsert("authorizations", {
    school_id: schoolAId,
    student_id: studentA,
    scope: "biometric_sorting",
    granted_at: new Date().toISOString(),
    created_by: schoolA.id,
  });
  faceA = await adminInsert("photo_faces", {
    school_id: schoolAId,
    photo_id: photoA,
    bbox: BBOX,
    det_score: 0.95,
    crop_path: `${schoolAId}/${eventA}/crop.jpg`,
    embedding: EMBEDDING,
    student_id: studentA,
    match_score: 0.91,
    state: "suggested",
  });
}, 120_000);

afterAll(async () => {
  for (const id of createdUsers) await deleteTestUser(id);
  for (const id of [schoolAId, schoolBId]) {
    if (id) await adminRest(`schools?id=eq.${id}`, { method: "DELETE" });
  }
}, 120_000);

describe("photo_faces", () => {
  it("o vetor não sai nem pedindo a coluna direto", async () => {
    const direct = await userSelect(schoolA, "photo_faces", `id=eq.${faceA}&select=embedding`);
    expect(direct.status).toBeGreaterThanOrEqual(400);

    // `select=*` também não pode contrabandear a coluna.
    const star = await userSelect(schoolA, "photo_faces", `id=eq.${faceA}&select=*`);
    expect(star.status).toBeGreaterThanOrEqual(400);
  });

  it("membro lê as colunas permitidas do próprio rosto", async () => {
    const mine = await userSelect(
      schoolA,
      "photo_faces",
      `id=eq.${faceA}&select=id,state,student_id,bbox,det_score,crop_path,match_score`,
    );
    expect(mine.status).toBeLessThan(300);
    expect(mine.rows).toHaveLength(1);
    const row = mine.rows[0] as Record<string, unknown>;
    expect(row["state"]).toBe("suggested");
    expect(row["student_id"]).toBe(studentA);
    expect(row["bbox"]).toEqual(BBOX);
    expect(row).not.toHaveProperty("embedding");
  });

  it("membro de outra escola não vê o rosto", async () => {
    const foreign = await userSelect(
      schoolB,
      "photo_faces",
      `id=eq.${faceA}&select=id,state`,
    );
    expect(foreign.rows).toHaveLength(0);
  });

  it("cliente não grava, não altera e não apaga rosto", async () => {
    const insert = await userInsert(schoolA, "photo_faces", {
      school_id: schoolAId,
      photo_id: photoA,
      bbox: BBOX,
      det_score: 0.9,
      state: "confirmed",
    });
    expect(insert).toBeGreaterThanOrEqual(400);

    // Confirmar rosto é a RPC do M6, não um UPDATE do cliente (D6).
    const update = await userUpdate(schoolA, "photo_faces", `id=eq.${faceA}`, {
      state: "confirmed",
    });
    expect(update.status).toBeGreaterThanOrEqual(400);

    const resp = await fetch(`${SUPABASE_URL}/rest/v1/photo_faces?id=eq.${faceA}`, {
      method: "DELETE",
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${schoolA.token}` },
    });
    expect(resp.status).toBeGreaterThanOrEqual(400);
  });

  it("a busca vetorial não é executável pelo cliente (D7)", async () => {
    const resp = await userRpc(schoolA, "match_reference_faces", {
      p_school: schoolAId,
      p_embedding: EMBEDDING,
      p_limit: 5,
    });
    expect(resp.status).toBeGreaterThanOrEqual(400);
  });
});

describe("student_photos", () => {
  it("sugestão não entra na pasta; confirmado entra", async () => {
    const before = await userRpc(schoolA, "student_photos", { p_student: studentA });
    expect(before.status).toBeLessThan(300);
    expect(before.rows).toHaveLength(0);

    await adminRest(`photo_faces?id=eq.${faceA}`, {
      method: "PATCH",
      body: JSON.stringify({
        state: "confirmed",
        reviewed_by: schoolA.id,
        reviewed_at: new Date().toISOString(),
      }),
    });

    const after = await userRpc(schoolA, "student_photos", { p_student: studentA });
    expect(after.rows).toHaveLength(1);
    const row = after.rows[0] as Record<string, unknown>;
    expect(row["photo_id"]).toBe(photoA);
    expect(row["event_id"]).toBe(eventA);
  });

  it("uma foto com dois rostos confirmados aparece uma vez só", async () => {
    const other = await newStudent(schoolAId, schoolA.id, "Colega");
    await adminInsert("photo_faces", {
      school_id: schoolAId,
      photo_id: photoA,
      bbox: BBOX,
      det_score: 0.9,
      student_id: other,
      state: "confirmed",
    });
    // Duas linhas em `photo_faces`, uma foto em cada pasta.
    const mine = await userRpc(schoolA, "student_photos", { p_student: studentA });
    const theirs = await userRpc(schoolA, "student_photos", { p_student: other });
    expect(mine.rows).toHaveLength(1);
    expect(theirs.rows).toHaveLength(1);
    expect((theirs.rows[0] as Record<string, unknown>)["photo_id"]).toBe(photoA);
  });

  it("recusa aluno de escola de que a sessão não é membro", async () => {
    const resp = await userRpc(schoolA, "student_photos", { p_student: studentB });
    expect(resp.status).toBeGreaterThanOrEqual(400);
  });

  it("foto na lixeira sai da pasta", async () => {
    const trashed = await newPhoto(schoolAId, eventA, schoolA.id);
    await adminInsert("photo_faces", {
      school_id: schoolAId,
      photo_id: trashed,
      bbox: BBOX,
      det_score: 0.9,
      student_id: studentA,
      state: "confirmed",
    });
    const before = await userRpc(schoolA, "student_photos", { p_student: studentA });
    expect(before.rows).toHaveLength(2);

    await adminRest(`photos?id=eq.${trashed}`, {
      method: "PATCH",
      body: JSON.stringify({ deleted_at: new Date().toISOString() }),
    });
    const after = await userRpc(schoolA, "student_photos", { p_student: studentA });
    expect(after.rows).toHaveLength(1);
  });
});

describe("face_recognition_settings", () => {
  it("qualquer membro lê os limiares; a escola não os altera", async () => {
    const read = await userSelect(schoolA, "face_recognition_settings", "select=*");
    expect(read.status).toBeLessThan(300);
    expect(read.rows).toHaveLength(1);
    const row = read.rows[0] as Record<string, number>;
    expect(row["tau"]).toBeCloseTo(0.52, 5);
    expect(row["margin"]).toBeCloseTo(0.1, 5);
    expect(row["min_face_px"]).toBe(60);
    expect(row["det_size_event"]).toBe(1600);
    expect(row["det_size_reference"]).toBe(640);

    // Mexer no limiar muda quantos rostos de criança o sistema atribui
    // sozinho: é do papel `dev`, não da escola (decisão #5).
    const write = await userUpdate(schoolA, "face_recognition_settings", "id=eq.1", {
      tau: 0.1,
    });
    expect(write.rows).toHaveLength(0);

    const still = await userSelect(schoolA, "face_recognition_settings", "select=tau");
    expect((still.rows[0] as Record<string, number>)["tau"]).toBeCloseTo(0.52, 5);
  });
});
