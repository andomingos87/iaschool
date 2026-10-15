import { generationSearchMatch } from "./generation-batches";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EMPTY_GENERATION_SELECTION,
  eligibleRoster,
  expandGenerationSelection,
  toggleGenerationClass,
  toggleGenerationStudent,
  classSelection,
  batchReviewError,
  createGenerationBatchService,
  createMockGenerationBatchService,
} from "./generation-batches";
import type { DataLayer, Student, SchoolClass } from "./data";
const alunos = [
  {
    id: "a",
    schoolId: "school",
    classId: "turma",
    name: "Ana",
    birthDate: "1990-01-01",
    photos: [{ id: "principal", url: "synthetic" }],
  },
  {
    id: "b",
    schoolId: "school",
    classId: "turma",
    name: "Bia",
    birthDate: "1990-01-01",
    photos: [{ id: "principal", url: "synthetic" }],
  },
  { id: "c", schoolId: "other", classId: "turma", photos: [] },
] as unknown as Student[];
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("seleção escolar de artes em lote", () => {
  it("filtra pela elegibilidade do servidor e pela escola ativa", () => {
    expect(
      eligibleRoster(alunos, "school", {
        students: [
          { studentId: "a", photoId: "principal" },
          { studentId: "c", photoId: "foreign" },
        ],
        remainingQuota: 5,
      }).map((a) => a.id),
    ).toEqual(["a"]);
    expect(eligibleRoster(alunos, "school", undefined)).toEqual([]);
  });
  it("turma adiciona aptos sem duplicar e remover turma preserva aluno direto", () => {
    let selected = toggleGenerationStudent(
      EMPTY_GENERATION_SELECTION,
      "a",
      alunos.slice(0, 2),
    );
    selected = toggleGenerationClass(selected, "turma", alunos.slice(0, 2));
    expect(expandGenerationSelection(selected, alunos.slice(0, 2))).toEqual([
      "a",
      "b",
    ]);
    selected = toggleGenerationClass(selected, "turma", alunos.slice(0, 2));
    expect(expandGenerationSelection(selected, alunos.slice(0, 2))).toEqual([
      "a",
    ]);
  });
  it("remoção individual exclui apenas aquele aluno da turma", () => {
    let selected = toggleGenerationClass(
      EMPTY_GENERATION_SELECTION,
      "turma",
      alunos.slice(0, 2),
    );
    selected = toggleGenerationStudent(selected, "a", alunos.slice(0, 2));
    expect(expandGenerationSelection(selected, alunos.slice(0, 2))).toEqual([
      "b",
    ]);
  });
  it("conta integrantes da escola e aptos", () => {
    const c = { id: "turma", schoolId: "school", name: "1º A" } as SchoolClass;
    expect(classSelection(c, alunos, [alunos[0]!])).toMatchObject({
      total: 2,
      eligibleIds: ["a"],
    });
  });
  it("bloqueia cota insuficiente, foto faltante e aluno repetido", () => {
    const items = [
      {
        studentId: "a",
        photo: { source: "profile" as const, id: "principal" },
      },
    ];
    expect(batchReviewError("Festa", items, 1)).toBeNull();
    expect(batchReviewError("Festa", items, 0)).toBeTruthy();
    expect(batchReviewError("Festa", [...items, ...items], 5)).toBeTruthy();
    expect(
      batchReviewError(
        "Festa",
        [{ studentId: "a", photo: { source: "profile", id: "" } }],
        5,
      ),
    ).toBeTruthy();
  });
});
describe("contrato HTTP de lotes", () => {
  it("envia só IDs e prompt, preserva requestId e desembrulha lista", async () => {
    const transport = vi
      .fn()
      .mockImplementation(
        async () =>
          new Response(JSON.stringify({ batches: [] }), { status: 200 }),
      );
    const service = createGenerationBatchService(
      async () => "test-token",
      transport,
    );
    expect(await service.list("school")).toEqual([]);
    await service.create({
      requestId: "same-request",
      schoolId: "school",
      prompt: "Festa",
      students: [
        { studentId: "a", photo: { source: "profile", id: "principal" } },
      ],
    });
    expect(transport.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      cache: "no-store",
      body: JSON.stringify({
        requestId: "same-request",
        schoolId: "school",
        prompt: "Festa",
        students: [
          { studentId: "a", photo: { source: "profile", id: "principal" } },
        ],
      }),
    });
  });
  it("não repete automaticamente erro de servidor ou falta de autenticação", async () => {
    const transport = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: "quota_exceeded" }), {
        status: 409,
      }),
    );
    await expect(
      createGenerationBatchService(async () => "token", transport).list(
        "school",
      ),
    ).rejects.toThrow("cota");
    expect(transport).toHaveBeenCalledTimes(1);
    await expect(
      createGenerationBatchService(async () => null, transport).list("school"),
    ).rejects.toThrow("Entre");
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
describe("simulação local recuperável", () => {
  function setup() {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    });
    const create = vi.fn(async (input) => ({
      id: crypto.randomUUID(),
      ...input,
    }));
    const data = {
      students: {
        list: async () => alunos,
        get: async (id: string) => alunos.find((s) => s.id === id),
      },
      authorizations: {
        listForStudent: async () => [
          {
            scope: "biometric_sorting",
            grantedAt: "2020-01-01",
            revokedAt: null,
          },
        ],
      },
      generatedPosts: { create },
    } as unknown as DataLayer;
    return {
      create,
      service: createMockGenerationBatchService(data, {
        failStudentIds: ["b"],
      }),
    };
  }
  it("adulto sem autorização e aluno sem foto nunca entram na pesquisa", async () => {
    const { service } = setup();
    const allowed = await service.eligibility("school");
    expect(allowed.students.map((s) => s.studentId)).toEqual(["a", "b"]);
    const deniedData = {
      students: { list: async () => alunos },
      authorizations: { listForStudent: async () => [] },
    } as unknown as DataLayer;
    expect(
      (await createMockGenerationBatchService(deniedData).eligibility("school"))
        .students,
    ).toEqual([]);
  });
  it("continua outros após falha, salva uma vez mesmo consultas concorrentes e retoma só falha", async () => {
    vi.useFakeTimers();
    const { service, create } = setup();
    const input = {
      requestId: "batch",
      schoolId: "school",
      prompt: "Festa",
      students: alunos.slice(0, 2).map((s) => ({
        studentId: s.id,
        photo: { source: "profile" as const, id: "principal" },
      })),
    };
    await Promise.all([service.create(input), service.create(input)]);
    vi.advanceTimersByTime(4000);
    const [result] = await Promise.all([
      service.get("batch"),
      service.list("school"),
      service.get("batch"),
    ]);
    expect(result.status).toBe("partial");
    expect(create).toHaveBeenCalledTimes(1);
    const failed = result.items.find((i) => i.status === "failed")!;
    await service.retry("batch", { requestId: "retry", itemIds: [failed.id] });
    await service.retry("batch", { requestId: "retry", itemIds: [failed.id] });
    vi.advanceTimersByTime(4000);
    expect((await service.get("batch")).status).toBe("completed");
    expect(create).toHaveBeenCalledTimes(2);
    expect((await service.eligibility("school")).remainingQuota).toBe(47);
    await expect(
      service.retry("batch", {
        requestId: "new",
        itemIds: [result.items[0]!.id],
      }),
    ).rejects.toThrow();
  });
});


describe("busca do wizard", () => {
  it("busca nome com espaços e acentos sem depender de IDs", () => {
    expect(generationSearchMatch("  João  Silva ", "joao silva")).toBe(true);
    expect(generationSearchMatch("Aluno Sintético B", "Sintético A")).toBe(false);
  });
  it("não encontra aluno pelo prefixo técnico ou ID oculto", () => {
    expect(generationSearchMatch("Bruno Souza", "aluno")).toBe(false);
    expect(generationSearchMatch("Bruno Souza", "school-123")).toBe(false);
  });
  it("busca rótulo da turma e mostra todos quando a busca está vazia", () => {
    expect(generationSearchMatch("1º ano — Fundamental · A", "1º ano")).toBe(true);
    expect(generationSearchMatch("1º ano — Fundamental · A", " ")).toBe(true);
  });
});
