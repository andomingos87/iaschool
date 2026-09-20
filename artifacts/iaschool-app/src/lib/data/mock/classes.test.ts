// Testes das turmas (`classes`) na implementação mock — a mesma regra que o
// banco aplica com `unique (school_id, school_year, grade, name)` e com
// `students.class_id on delete set null`.

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DataLayer } from "../contract";

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

let dataLayer: DataLayer;

beforeAll(async () => {
  (globalThis as Record<string, unknown>).localStorage = makeLocalStorageStub();
  if (typeof globalThis.window === "undefined") {
    (globalThis as Record<string, unknown>).window = new EventTarget();
  }
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
        name: "Teste",
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

function newClass(over: Partial<{ grade: string; name: string; schoolYear: number }> = {}) {
  return dataLayer.classes.create({
    schoolYear: over.schoolYear ?? 2026,
    grade: (over.grade ?? "3EF") as never,
    name: over.name ?? "A",
  });
}

describe("turmas no modelo por escola", () => {
  it("cria a turma na escola ativa e a devolve na listagem", async () => {
    const c = await newClass();
    expect(c.schoolId).toBe("school-a");

    const list = await dataLayer.classes.list();
    expect(list.map((x) => x.id)).toEqual([c.id]);
  });

  it("recusa duplicata de ano letivo + série + nome na mesma escola", async () => {
    await newClass({ grade: "3EF", name: "A" });
    await expect(newClass({ grade: "3EF", name: "A" })).rejects.toThrow(
      /Já existe uma turma/,
    );
    // Mesma série e nome em outro ano letivo é outra turma.
    await expect(
      newClass({ grade: "3EF", name: "A", schoolYear: 2027 }),
    ).resolves.toBeTruthy();
  });

  it("não deixa a edição colidir com outra turma existente", async () => {
    await newClass({ grade: "3EF", name: "A" });
    const b = await newClass({ grade: "3EF", name: "B" });
    await expect(dataLayer.classes.update(b.id, { name: "A" })).rejects.toThrow(
      /Já existe uma turma/,
    );
    // Salvar a própria turma sem mudar a chave continua permitido.
    await expect(
      dataLayer.classes.update(b.id, { name: "B" }),
    ).resolves.toBeTruthy();
  });

  it("não vaza turma de outra escola", async () => {
    const a = await newClass({ name: "A" });
    setSession("school-b");
    expect(await dataLayer.classes.list()).toEqual([]);
    expect(await dataLayer.classes.get(a.id)).toBeNull();
  });

  it("excluir a turma deixa o aluno sem turma, sem apagar o cadastro", async () => {
    const c = await newClass();
    const student = await dataLayer.students.create({
      name: "Aluno",
      whatsapp: "5511999990000",
      photos: [],
      classId: c.id,
    } as never);
    expect(student.classId).toBe(c.id);

    await dataLayer.classes.delete(c.id);

    const after = await dataLayer.students.get(student.id);
    expect(after).not.toBeNull();
    expect(after!.classId).toBeUndefined();
  });

  it("sem escola ativa, criar turma falha com mensagem de vínculo", async () => {
    setSession(null);
    await expect(newClass()).rejects.toThrow(/não está vinculada a uma escola/);
  });
});
