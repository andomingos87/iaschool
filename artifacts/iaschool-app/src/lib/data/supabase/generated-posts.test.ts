// Teste do fallback de `generatedPosts.create` quando a coluna `details`
// ainda não existe no banco (setup.sql não re-executado): o post deve ser
// salvo SEM os detalhes em vez de perder a imagem no histórico.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Estado configurável do mock do Supabase (por teste).
type InsertResult = { data: Record<string, unknown> | null; error: { message: string; code?: string } | null };
const state: {
  inserts: Array<Record<string, unknown>>;
  results: InsertResult[];
} = { inserts: [], results: [] };

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: "uid-1" } } },
        error: null,
      }),
    },
    from: (table: string) => {
      if (table !== "generated_posts") {
        throw new Error(`tabela inesperada no teste: ${table}`);
      }
      return {
        insert(payload: Record<string, unknown>) {
          state.inserts.push(payload);
          const result = state.results.shift() ?? {
            data: null,
            error: { message: "sem resultado configurado" },
          };
          return {
            select: () => ({ single: async () => result }),
          };
        },
      };
    },
  }),
}));

import { createSupabaseDataLayer } from "./index";

const SAVED_ROW = {
  id: "post-1",
  student_id: "s1",
  image_url: "data:image/png;base64,ok",
  metrics: [],
  created_at: "2026-08-14T00:00:00.000Z",
};

const INPUT = {
  studentId: "s1",
  imageUrl: "data:image/png;base64,ok",
  metrics: [],
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
  state.results = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("generatedPosts.create — fallback sem a coluna details", () => {
  it("salva com details quando a coluna existe", async () => {
    state.results = [
      { data: { ...SAVED_ROW, details: INPUT.details }, error: null },
    ];
    const layer = createSupabaseDataLayer();

    const post = await layer.generatedPosts.create(INPUT);

    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]).toMatchObject({
      student_id: "s1",
      details: INPUT.details,
      owner_id: "uid-1",
    });
    expect(post.details).toEqual(INPUT.details);
  });

  it("re-tenta sem details quando o banco não tem a coluna (42703)", async () => {
    state.results = [
      {
        data: null,
        error: {
          message: 'column "details" of relation "generated_posts" does not exist',
          code: "42703",
        },
      },
      { data: SAVED_ROW, error: null },
    ];
    const layer = createSupabaseDataLayer();

    const post = await layer.generatedPosts.create(INPUT);

    expect(state.inserts).toHaveLength(2);
    // O retry NÃO envia a coluna details — só os campos que existem.
    expect(state.inserts[1]).not.toHaveProperty("details");
    expect(state.inserts[1]).toMatchObject({
      student_id: "s1",
      image_url: INPUT.imageUrl,
      owner_id: "uid-1",
    });
    // Post é salvo mesmo assim; detalhes ficam nulos (geração antiga).
    expect(post.id).toBe("post-1");
    expect(post.details).toBeNull();
  });

  it("também cai no fallback com erro de schema cache do PostgREST", async () => {
    state.results = [
      {
        data: null,
        error: {
          message: "Could not find the 'details' column of 'generated_posts' in the schema cache",
          code: "PGRST204",
        },
      },
      { data: SAVED_ROW, error: null },
    ];
    const layer = createSupabaseDataLayer();

    const post = await layer.generatedPosts.create(INPUT);

    expect(state.inserts).toHaveLength(2);
    expect(post.details).toBeNull();
  });

  it("erros não relacionados à coluna details não disparam retry", async () => {
    state.results = [
      { data: null, error: { message: "permission denied for table generated_posts" } },
    ];
    const layer = createSupabaseDataLayer();

    await expect(layer.generatedPosts.create(INPUT)).rejects.toThrow(
      /Falha ao salvar post gerado/,
    );
    expect(state.inserts).toHaveLength(1);
  });

  it("se o retry também falhar, o erro é propagado", async () => {
    state.results = [
      {
        data: null,
        error: { message: 'column "details" does not exist', code: "42703" },
      },
      { data: null, error: { message: "permission denied" } },
    ];
    const layer = createSupabaseDataLayer();

    await expect(layer.generatedPosts.create(INPUT)).rejects.toThrow(
      /Falha ao salvar post gerado/,
    );
    expect(state.inserts).toHaveLength(2);
  });
});
