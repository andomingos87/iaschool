// Testes das autorizações por escopo e do rosto de referência na
// implementação mock — as mesmas regras que o banco aplica no M4:
// um consentimento ativo por (aluno, escopo), revogar não apaga a prova,
// e referência só existe sob `biometric_sorting` ativa (D5).

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DataLayer } from "../contract";
import { REFERENCE_FACES_RECOMMENDED } from "../types";

// ---- Stubs de browser (ambiente node) ----
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

/** `blobToDataUrl` do mock usa FileReader; no node basta um substituto. */
class FileReaderStub {
  result: string | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readAsDataURL(_blob: Blob): void {
    this.result = "data:image/jpeg;base64,ZmFrZQ==";
    queueMicrotask(() => this.onload?.());
  }
}

let dataLayer: DataLayer;

beforeAll(async () => {
  (globalThis as Record<string, unknown>).localStorage = makeLocalStorageStub();
  if (typeof globalThis.window === "undefined") {
    (globalThis as Record<string, unknown>).window = new EventTarget();
  }
  (globalThis as Record<string, unknown>).FileReader = FileReaderStub;
  const { createMockDataLayer } = await import("./index");
  dataLayer = createMockDataLayer();
});

function setSession(schoolId: string | null) {
  const schools = schoolId
    ? [{ schoolId, schoolName: "Escola Teste", role: "school_admin" }]
    : [];
  localStorage.setItem(
    "iaschool:session",
    JSON.stringify({
      user: {
        id: "test-user",
        email: "t@t.com",
        name: "Coordenadora Teste",
        role: "user",
        schools,
      },
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      activeSchoolId: schoolId ?? undefined,
    }),
  );
}

beforeEach(() => {
  localStorage.clear();
  setSession("school-a");
});

function newStudent(name = "Aluna Teste") {
  return dataLayer.students.create({
    name,
    whatsapp: "5511999990000",
    birthDate: "2018-04-10",
    photos: [],
  });
}

function jpeg(): Blob {
  return new Blob([new Uint8Array([255, 216, 255])], { type: "image/jpeg" });
}

describe("authorizations (mock)", () => {
  it("grava o aceite com a evidência de quem registrou", async () => {
    const student = await newStudent();
    const granted = await dataLayer.authorizations.grant({
      studentId: student.id,
      scope: "biometric_sorting",
    });

    expect(granted.grantedAt).toBeTruthy();
    expect(granted.revokedAt).toBeUndefined();
    expect(granted.scope).toBe("biometric_sorting");
    // O toggle é declaração da escola, não aceite do responsável.
    expect(granted.evidence?.source).toBe("school_declaration");
    expect(granted.evidence?.registeredBy).toBe("Coordenadora Teste");
    // Sem texto jurídico não há versão de termo a citar.
    expect(granted.evidence?.termsVersion).toBeNull();
  });

  it("recusa dois consentimentos ativos do mesmo escopo", async () => {
    const student = await newStudent();
    await dataLayer.authorizations.grant({
      studentId: student.id,
      scope: "delivery_whatsapp",
    });
    await expect(
      dataLayer.authorizations.grant({
        studentId: student.id,
        scope: "delivery_whatsapp",
      }),
    ).rejects.toThrow(/já tem uma autorização ativa/i);
  });

  it("escopos diferentes convivem no mesmo aluno", async () => {
    const student = await newStudent();
    await dataLayer.authorizations.grant({
      studentId: student.id,
      scope: "biometric_sorting",
    });
    await dataLayer.authorizations.grant({
      studentId: student.id,
      scope: "delivery_whatsapp",
    });
    const list = await dataLayer.authorizations.listForStudent(student.id);
    expect(list.map((a) => a.scope).sort()).toEqual([
      "biometric_sorting",
      "delivery_whatsapp",
    ]);
  });

  it("revogar mantém a linha no histórico e libera reconceder", async () => {
    const student = await newStudent();
    const first = await dataLayer.authorizations.grant({
      studentId: student.id,
      scope: "biometric_sorting",
    });
    await dataLayer.authorizations.revoke(first.id);

    const second = await dataLayer.authorizations.grant({
      studentId: student.id,
      scope: "biometric_sorting",
    });
    expect(second.id).not.toBe(first.id);

    const list = await dataLayer.authorizations.listForStudent(student.id);
    expect(list).toHaveLength(2);
    expect(list.find((a) => a.id === first.id)?.revokedAt).toBeTruthy();
  });

  it("desrevogar é recusado", async () => {
    const student = await newStudent();
    const granted = await dataLayer.authorizations.grant({
      studentId: student.id,
      scope: "internal_use",
    });
    await dataLayer.authorizations.revoke(granted.id);
    await expect(dataLayer.authorizations.revoke(granted.id)).rejects.toThrow(
      /já foi revogada/i,
    );
  });
});

describe("rosto de referência (mock)", () => {
  it("recusa a foto sem biometric_sorting ativa (D5)", async () => {
    const student = await newStudent();
    await expect(
      dataLayer.referenceFaces.enqueue({
        studentId: student.id,
        schoolId: student.schoolId,
        authorizationId: "inexistente",
        blob: jpeg(),
      }),
    ).rejects.toThrow(/autorização de reconhecimento ativa/i);
  });

  it("com consentimento, a foto entra na fila e ainda não é referência", async () => {
    const student = await newStudent();
    const auth = await dataLayer.authorizations.grant({
      studentId: student.id,
      scope: "biometric_sorting",
    });
    const job = await dataLayer.referenceFaces.enqueue({
      studentId: student.id,
      schoolId: student.schoolId,
      authorizationId: auth.id,
      blob: jpeg(),
    });

    expect(job.status).toBe("queued");
    expect(job.storagePath).toBe(
      `${student.schoolId}/${student.id}/${job.id}.jpg`,
    );
    // Sem motor facial não há vetor — e sem vetor não há referência.
    await expect(dataLayer.referenceFaces.list(student.id)).resolves.toHaveLength(0);
    await expect(dataLayer.referenceFaces.listJobs(student.id)).resolves.toHaveLength(1);
  });

  it("revogar depois de enfileirar impede uma foto nova", async () => {
    const student = await newStudent();
    const auth = await dataLayer.authorizations.grant({
      studentId: student.id,
      scope: "biometric_sorting",
    });
    await dataLayer.referenceFaces.enqueue({
      studentId: student.id,
      schoolId: student.schoolId,
      authorizationId: auth.id,
      blob: jpeg(),
    });
    await dataLayer.authorizations.revoke(auth.id);

    await expect(
      dataLayer.referenceFaces.enqueue({
        studentId: student.id,
        schoolId: student.schoolId,
        authorizationId: auth.id,
        blob: jpeg(),
      }),
    ).rejects.toThrow(/autorização de reconhecimento ativa/i);
  });

  it("descartar tira a foto da fila", async () => {
    const student = await newStudent();
    const auth = await dataLayer.authorizations.grant({
      studentId: student.id,
      scope: "biometric_sorting",
    });
    const job = await dataLayer.referenceFaces.enqueue({
      studentId: student.id,
      schoolId: student.schoolId,
      authorizationId: auth.id,
      blob: jpeg(),
    });
    await dataLayer.referenceFaces.cancelJob(job.id);
    await expect(dataLayer.referenceFaces.listJobs(student.id)).resolves.toHaveLength(0);
  });
});

describe("cobertura biométrica (mock)", () => {
  it("conta consentimento, referência e fila por aluno", async () => {
    const semConsentimento = await newStudent("Sem consentimento");
    const naFila = await newStudent("Na fila");
    const auth = await dataLayer.authorizations.grant({
      studentId: naFila.id,
      scope: "biometric_sorting",
    });
    await dataLayer.referenceFaces.enqueue({
      studentId: naFila.id,
      schoolId: naFila.schoolId,
      authorizationId: auth.id,
      blob: jpeg(),
    });

    const readiness = await dataLayer.referenceFaces.readiness("school-a");
    expect(readiness.size).toBe(2);

    const a = readiness.get(semConsentimento.id)!;
    expect(a.hasConsent).toBe(false);
    expect(a.referenceCount).toBe(0);
    expect(a.pendingCount).toBe(0);

    const b = readiness.get(naFila.id)!;
    expect(b.hasConsent).toBe(true);
    // Foto na fila não conta como referência: cobertura segue baixa.
    expect(b.referenceCount).toBe(0);
    expect(b.pendingCount).toBe(1);
    expect(b.lowCoverage).toBe(true);
    expect(REFERENCE_FACES_RECOMMENDED).toBe(2);
  });

  it("não enxerga aluno de escola de que a sessão não é membro", async () => {
    await newStudent("Da escola A");
    setSession("school-b");
    const readiness = await dataLayer.referenceFaces.readiness("school-a");
    expect(readiness.size).toBe(0);
  });
});
