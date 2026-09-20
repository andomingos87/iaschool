// `generatedPosts.create` (M1): a arte pertence à ESCOLA do aluno, não à
// escola ativa da sessão — o repositório lê `students.school_id` antes de
// inserir e grava `school_id` no post. Erros do banco são propagados com
// contexto em pt-BR.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Estado configurável do mock do Supabase (por teste).
type Result = { data: Record<string, unknown> | null; error: { message: string; code?: string } | null };
const state: {
  inserts: Array<Record<string, unknown>>;
  studentLookups: string[];
  studentResult: Result;
  insertResult: Result;
} = {
  inserts: [],
  studentLookups: [],
  studentResult: { data: null, error: null },
  insertResult: { data: null, error: null },
};

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: "uid-1" } } },
        error: null,
      }),
    },
    from: (table: string) => {
      if (table === "students") {
        return {
          select: () => ({
            eq: (_col: string, id: string) => {
              state.studentLookups.push(id);
              return { single: async () => state.studentResult };
            },
          }),
        };
      }
      if (table === "generated_posts") {
        return {
          insert(payload: Record<string, unknown>) {
            state.inserts.push(payload);
            return { select: () => ({ single: async () => state.insertResult }) };
          },
        };
      }
      throw new Error(`tabela inesperada no teste: ${table}`);
    },
  }),
}));

import { createSupabaseDataLayer } from "./index";

const SAVED_ROW = {
  id: "post-1",
  student_id: "s1",
  school_id: "school-a",
  image_url: "data:image/png;base64,ok",
  created_at: "2026-08-14T00:00:00.000Z",
};

const INPUT = {
  studentId: "s1",
  imageUrl: "data:image/png;base64,ok",
  details: {
    prompt: "prompt final",
    model: "gpt-image-2",
    size: "1024x1024",
    images: [{ role: "Referência", fileName: "referencia.png", sizeBytes: 10 }],
  },
};

beforeEach(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "https://fake.supabase.co");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "fake-anon-key");
  state.inserts = [];
  state.studentLookups = [];
  state.studentResult = { data: { school_id: "school-a" }, error: null };
  state.insertResult = { data: { ...SAVED_ROW, details: INPUT.details }, error: null };
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("generatedPosts.create — escola do aluno", () => {
  it("grava school_id da escola do aluno, owner_id do usuário e os details", async () => {
    const layer = createSupabaseDataLayer();

    const post = await layer.generatedPosts.create(INPUT);

    expect(state.studentLookups).toEqual(["s1"]);
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]).toMatchObject({
      student_id: "s1",
      school_id: "school-a",
      owner_id: "uid-1",
      details: INPUT.details,
    });
    expect(post.id).toBe("post-1");
    expect(post.details).toEqual(INPUT.details);
  });

  it("falha antes de inserir quando o aluno não é encontrado", async () => {
    state.studentResult = { data: null, error: { message: "Row not found" } };
    const layer = createSupabaseDataLayer();

    await expect(layer.generatedPosts.create(INPUT)).rejects.toThrow(
      /Falha ao localizar o aluno da arte/,
    );
    expect(state.inserts).toHaveLength(0);
  });

  it("propaga erro do insert com contexto", async () => {
    state.insertResult = {
      data: null,
      error: { message: "permission denied for table generated_posts" },
    };
    const layer = createSupabaseDataLayer();

    await expect(layer.generatedPosts.create(INPUT)).rejects.toThrow(
      /Falha ao salvar post gerado/,
    );
    expect(state.inserts).toHaveLength(1);
  });
});
