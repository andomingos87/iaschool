// Testes da revisão no mock (M6) e das funções puras que a tela usa para
// montar os cartões. As regras verificadas são as mesmas que as RPCs
// aplicam no banco: confirmar exige `biometric_sorting` ativo, o lote é
// tudo ou nada, "não é aluno" apaga o recorte mantendo a caixa do rosto, e
// só rosto confirmado entra na pasta do aluno (D6).

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DataLayer } from "../contract";
import type { ReviewFace } from "../types";
import {
  groupReviewByStudent,
  pendingReviewCount,
  showReviewDeliveryGate,
  unassignedFaces,
} from "../types";
import type { ReviewCounts } from "../types";

function makeLocalStorageStub() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  } satisfies Storage;
}

let dataLayer: DataLayer;

beforeAll(async () => {
  (globalThis as Record<string, unknown>).localStorage = makeLocalStorageStub();
  if (typeof globalThis.window === "undefined") {
    (globalThis as Record<string, unknown>).window = new EventTarget();
  }
  const { createMockDataLayer } = await import("./index");
  dataLayer = createMockDataLayer();
});

function setSession(schoolId: string) {
  localStorage.setItem(
    "iaschool:session",
    JSON.stringify({
      user: {
        id: "test-user",
        email: "t@t.com",
        name: "Coordenadora Teste",
        role: "user",
        schools: [{ schoolId, schoolName: "Escola Teste", role: "school_admin" }],
      },
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      activeSchoolId: schoolId,
    }),
  );
}

beforeEach(() => {
  localStorage.clear();
  setSession("school-a");
});

/** Semeia evento, foto e um rosto sugerido, sem passar pelo upload. */
async function seedSuggestedFace(opts: { consent: boolean }) {
  const student = await dataLayer.students.create({
    name: "Aluna Teste",
    whatsapp: "5511999990000",
    birthDate: "2018-04-10",
    photos: [],
  });
  if (opts.consent) {
    await dataLayer.authorizations.grant({
      studentId: student.id,
      scope: "biometric_sorting",
    });
  }
  const event = await dataLayer.events.create({
    name: "Festa",
    eventDate: "2026-09-20",
    declareImageRights: true,
  });
  const photo = {
    id: "photo-1",
    schoolId: student.schoolId,
    eventId: event.id,
    storagePath: `${student.schoolId}/${event.id}/photo-1.jpg`,
    thumbPath: `${student.schoolId}/${event.id}/photo-1.webp`,
    contentHash: "h".repeat(64),
    originalFilename: "IMG.jpg",
    bytes: 1000,
    status: "processed" as const,
    uploadedBy: "test-user",
    createdAt: new Date().toISOString(),
  };
  localStorage.setItem("iaschool:photos", JSON.stringify([photo]));
  const faces = [
    {
      id: "face-1",
      eventId: event.id,
      schoolId: student.schoolId,
      photoId: photo.id,
      storagePath: photo.storagePath,
      thumbPath: photo.thumbPath,
      bbox: { x: 1, y: 1, w: 80, h: 80 },
      cropPath: "crop-1.jpg",
      detScore: 0.95,
      state: "suggested",
      studentId: student.id,
      studentName: student.name,
      matchScore: 0.9,
      highConfidence: true,
    },
    {
      id: "face-2",
      eventId: event.id,
      schoolId: student.schoolId,
      photoId: photo.id,
      storagePath: photo.storagePath,
      thumbPath: photo.thumbPath,
      bbox: { x: 200, y: 1, w: 60, h: 60 },
      cropPath: "crop-2.jpg",
      detScore: 0.7,
      state: "unassigned",
      highConfidence: false,
    },
  ];
  localStorage.setItem("iaschool:photo-faces", JSON.stringify(faces));
  return { student, event };
}

describe("faceReview (mock)", () => {
  it("lista os pendentes e conta por estado", async () => {
    const { event } = await seedSuggestedFace({ consent: true });
    const faces = await dataLayer.faceReview.listForEvent(event.id);
    expect(faces.map((f) => f.id).sort()).toEqual(["face-1", "face-2"]);
    const counts = await dataLayer.faceReview.counts(event.id);
    expect(counts.suggested).toBe(1);
    expect(counts.unassigned).toBe(1);
    expect(counts.studentsPending).toBe(1);
    expect(pendingReviewCount(counts)).toBe(2);
    expect(showReviewDeliveryGate(counts)).toBe(false);
  });

  it("a porta de envio só abre com a fila zerada e rosto já confirmado", () => {
    const base: ReviewCounts = {
      suggested: 0,
      unassigned: 0,
      confirmed: 0,
      rejected: 0,
      notAStudent: 0,
      adultOrStaff: 0,
      studentsPending: 0,
    };
    expect(showReviewDeliveryGate(undefined)).toBe(false);
    expect(showReviewDeliveryGate(base)).toBe(false);
    expect(showReviewDeliveryGate({ ...base, suggested: 2 })).toBe(false);
    expect(showReviewDeliveryGate({ ...base, unassigned: 1, confirmed: 3 })).toBe(false);
    expect(showReviewDeliveryGate({ ...base, confirmed: 1 })).toBe(true);
  });

  it("confirmar exige a autorização de reconhecimento ativa", async () => {
    const { student, event } = await seedSuggestedFace({ consent: false });
    await expect(
      dataLayer.faceReview.confirmBulk(["face-1"], student.id),
    ).rejects.toThrow(/autorização de reconhecimento/i);
    const counts = await dataLayer.faceReview.counts(event.id);
    expect(counts.confirmed).toBe(0);
  });

  it("o lote é tudo ou nada: um rosto inexistente não confirma nenhum", async () => {
    const { student, event } = await seedSuggestedFace({ consent: true });
    await expect(
      dataLayer.faceReview.confirmBulk(["face-1", "nao-existe"], student.id),
    ).rejects.toThrow(/não existe/i);
    const counts = await dataLayer.faceReview.counts(event.id);
    expect(counts.confirmed).toBe(0);
  });

  it("confirmar duas vezes não confirma de novo (dois revisores)", async () => {
    const { student } = await seedSuggestedFace({ consent: true });
    expect(await dataLayer.faceReview.confirmBulk(["face-1"], student.id)).toBe(1);
    expect(await dataLayer.faceReview.confirmBulk(["face-1"], student.id)).toBe(0);
  });

  it("só o confirmado entra na pasta do aluno", async () => {
    const { student } = await seedSuggestedFace({ consent: true });
    expect(await dataLayer.photos.listForStudent(student.id)).toHaveLength(0);
    await dataLayer.faceReview.confirmBulk(["face-1"], student.id);
    const folder = await dataLayer.photos.listForStudent(student.id);
    expect(folder).toHaveLength(1);
    expect(folder[0]?.id).toBe("photo-1");
  });

  it('"criança de fora" apaga o recorte e mantém a caixa do rosto', async () => {
    const { event } = await seedSuggestedFace({ consent: true });
    await dataLayer.faceReview.reject("face-2", "not_a_student");
    const faces = await dataLayer.faceReview.listForEvent(event.id, ["not_a_student"]);
    expect(faces).toHaveLength(1);
    expect(faces[0]?.cropPath).toBeUndefined();
    // bbox e det_score sobrevivem: sem eles não há o que desfocar (§9.3.1).
    expect(faces[0]?.bbox).toEqual({ x: 200, y: 1, w: 60, h: 60 });
    expect(faces[0]?.detScore).toBe(0.7);
  });

  it("evento sai de revisão quando não sobra rosto pendente", async () => {
    const { student, event } = await seedSuggestedFace({ consent: true });
    localStorage.setItem(
      "iaschool:events",
      JSON.stringify(
        (JSON.parse(localStorage.getItem("iaschool:events") ?? "[]") as Array<{ id: string }>).map(
          (e) => (e.id === event.id ? { ...e, status: "review" } : e),
        ),
      ),
    );
    await dataLayer.faceReview.confirmBulk(["face-1"], student.id);
    expect((await dataLayer.events.get(event.id))?.status).toBe("review");
    await dataLayer.faceReview.reject("face-2", "adult_or_staff");
    expect((await dataLayer.events.get(event.id))?.status).toBe("ready");
  });
});

function face(partial: Partial<ReviewFace> & Pick<ReviewFace, "id">): ReviewFace {
  return {
    photoId: "p",
    storagePath: "s",
    bbox: { x: 0, y: 0, w: 10, h: 10 },
    detScore: 0.9,
    state: "suggested",
    highConfidence: false,
    ...partial,
  };
}

describe("groupReviewByStudent", () => {
  it("separa por aluno e por faixa de confiança", () => {
    const groups = groupReviewByStudent([
      face({ id: "1", studentId: "a", studentName: "Ana", highConfidence: true }),
      face({ id: "2", studentId: "a", studentName: "Ana", highConfidence: false }),
      face({ id: "3", studentId: "b", studentName: "Bruno", highConfidence: true }),
    ]);
    expect(groups.map((g) => g.studentName)).toEqual(["Ana", "Bruno"]);
    expect(groups[0]?.confident.map((f) => f.id)).toEqual(["1"]);
    expect(groups[0]?.needsAttention.map((f) => f.id)).toEqual(["2"]);
  });

  it("ignora o que não é sugestão: só sugerido vira cartão", () => {
    const groups = groupReviewByStudent([
      face({ id: "1", state: "unassigned" }),
      face({ id: "2", state: "confirmed", studentId: "a", studentName: "Ana" }),
      face({ id: "3", state: "suggested", studentId: "a", studentName: "Ana" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.needsAttention.map((f) => f.id)).toEqual(["3"]);
  });
});

describe("unassignedFaces", () => {
  it("devolve só os sem correspondência", () => {
    const list = unassignedFaces([
      face({ id: "1", state: "unassigned" }),
      face({ id: "2", state: "suggested", studentId: "a" }),
    ]);
    expect(list.map((f) => f.id)).toEqual(["1"]);
  });
});
