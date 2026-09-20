// Testes de integração da lixeira de alunos (tarefa: alunos excluídos somem
// da seleção de geração imediatamente).
//
// A tela de Geração usa useStudents() → dataLayer.students.list(); a página
// de detalhes usa students.get() e decide badge/bloqueio por `deletedAt`;
// a galeria usa generatedPosts.list(), que NÃO filtra por aluno na lixeira.
// Estes testes cobrem exatamente esses contratos na implementação mock.

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
  // Import dinâmico: o módulo usa window/localStorage no escopo de módulo.
  const { createMockDataLayer } = await import("./index");
  dataLayer = createMockDataLayer();
});

function setSession(role: "user" | "super_admin") {
  // Modelo do M1: papel global + vínculo com escola em `schools`.
  const schools =
    role === "user"
      ? [{ schoolId: "school-test", schoolName: "Escola Teste", role: "school_admin" }]
      : [];
  localStorage.setItem(
    "iaschool:session",
    JSON.stringify({
      user: { id: "test-user", email: "t@t.com", name: "Teste", role, schools },
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      activeSchoolId: schools[0]?.schoolId,
    }),
  );
}

beforeEach(() => {
  localStorage.clear();
  setSession("user");
});

async function createStudent(name: string) {
  return dataLayer.students.create({
    name,
    whatsapp: "+5511999990000",
    photos: [],
  } as never);
}

describe("lixeira de alunos × seleção de geração", () => {
  it("students.list() (fonte do wizard de geração) exclui alunos com deletedAt", async () => {
    const a = await createStudent("Aluno Ativo");
    const b = await createStudent("Aluno Excluído");

    await dataLayer.students.moveToTrash([b.id]);

    const list = await dataLayer.students.list();
    expect(list.map((s) => s.id)).toContain(a.id);
    expect(list.map((s) => s.id)).not.toContain(b.id);
    expect(list.every((s) => !s.deletedAt)).toBe(true);

    const trash = await dataLayer.students.listTrash();
    expect(trash.map((s) => s.id)).toEqual([b.id]);
    expect(trash[0]!.deletedAt).toBeTruthy();
  });

  it("students.get() ainda retorna o aluno na lixeira com deletedAt (badge 'Na lixeira' + bloqueio de geração)", async () => {
    const s = await createStudent("Aluno Detalhe");
    await dataLayer.students.moveToTrash([s.id]);

    const got = await dataLayer.students.get(s.id);
    expect(got).not.toBeNull();
    expect(got!.deletedAt).toBeTruthy(); // student-detail: isInTrash = !!deletedAt
  });

  it("generatedPosts.list() (galeria) mantém posts de alunos na lixeira", async () => {
    const s = await createStudent("Aluno Com Post");
    const post = await dataLayer.generatedPosts.create({
      studentId: s.id,
      imageUrl: "data:image/png;base64,x",
      metrics: [],
    });

    await dataLayer.students.moveToTrash([s.id]);

    const posts = await dataLayer.generatedPosts.list();
    const found = posts.find((p) => p.id === post.id);
    expect(found).toBeDefined();
    expect(found!.studentId).toBe(s.id); // student_id permanece válido
  });

  it("restore() devolve o aluno para a lista ativa", async () => {
    const s = await createStudent("Aluno Restaurado");
    await dataLayer.students.moveToTrash([s.id]);
    expect((await dataLayer.students.list()).map((x) => x.id)).not.toContain(s.id);

    await dataLayer.students.restore([s.id]);

    const list = await dataLayer.students.list();
    const back = list.find((x) => x.id === s.id);
    expect(back).toBeDefined();
    expect(back!.deletedAt).toBeFalsy();
    expect(await dataLayer.students.listTrash()).toEqual([]);
  });

  it("alunos com mais de 30 dias de lixeira são expurgados no list()", async () => {
    const s = await createStudent("Aluno Antigo");
    await dataLayer.students.moveToTrash([s.id]);

    // Retroage o deletedAt para 31 dias atrás direto no armazenamento.
    const raw = JSON.parse(localStorage.getItem("iaschool:students")!) as Array<
      Record<string, unknown>
    >;
    const old = new Date(Date.now() - 31 * 24 * 3600 * 1000).toISOString();
    localStorage.setItem(
      "iaschool:students",
      JSON.stringify(raw.map((x) => (x.id === s.id ? { ...x, deletedAt: old } : x))),
    );

    await dataLayer.students.list(); // dispara o expurgo oportunista
    expect(await dataLayer.students.listTrash()).toEqual([]);
    expect(await dataLayer.students.get(s.id)).toBeNull();
  });
});
