// Testes do contrato de `generate()`: os detalhes da geração (prompt final,
// modelo, tamanho e lista ORDENADA de imagens com papéis) precisam continuar
// sendo retornados — o histórico do admin depende deles para depurar o template.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOpenAIGenerationService } from "./openai-generation";
import { buildGenerationPrompt } from "../prompt-template";
import type { GenerationRequest, StoredImage } from "./types";

// ---------- fixtures ----------

function img(id: string): StoredImage {
  return {
    id,
    url: `https://example.test/${id}.png`,
    path: `bucket/${id}.png`,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeRequest(overrides: Partial<GenerationRequest> = {}): GenerationRequest {
  return {
    student: {
      id: "s1",
      name: "João Silva",
      whatsapp: "11999999999",
      position: "Atacante",
      photos: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    studentPhoto: img("foto-aluno"),
    club: {
      id: "c1",
      name: "FC Teste",
      logo: img("brasao"),
      uniforms: [img("uniforme")],
      colors: ["azul", "branco"],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    showClubLogo: true,
    includeR9Logo: true,
    uniform: img("uniforme"),
    reference: {
      id: "r1",
      image: img("referencia"),
      uploadedBy: "admin",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    metrics: [{ metricId: "m1", name: "Gols", value: "12" }],
    ...overrides,
  };
}

// ---------- mocks de rede ----------

/** fetch: devolve um PNG pequeno para qualquer URL de imagem. */
function mockFetchOk() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob([new Uint8Array(16)], { type: "image/png" }),
    })),
  );
}

/**
 * XMLHttpRequest fake: captura o FormData enviado e responde com o JSON
 * configurado (sucesso ou erro), sem tocar a rede.
 */
function mockXhr(response: { status: number; body: unknown }) {
  const sent: { formData: FormData | null; headers: Record<string, string> } = {
    formData: null,
    headers: {},
  };
  class FakeXhr {
    timeout = 0;
    status = 0;
    responseText = "";
    upload: {
      onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null;
      onload: (() => void) | null;
    } = { onprogress: null, onload: null };
    onload: (() => void) | null = null;
    ontimeout: (() => void) | null = null;
    onerror: (() => void) | null = null;
    open() {}
    setRequestHeader(k: string, v: string) {
      sent.headers[k] = v;
    }
    send(formData: FormData) {
      sent.formData = formData;
      queueMicrotask(() => {
        this.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 });
        this.upload.onload?.();
        this.status = response.status;
        this.responseText = JSON.stringify(response.body);
        this.onload?.();
      });
    }
  }
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  return sent;
}

beforeEach(() => {
  mockFetchOk();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------- testes ----------

describe("createOpenAIGenerationService().generate — detalhes da geração", () => {
  it("retorna details com prompt, modelo, tamanho e imagens ordenadas (todas as opções)", async () => {
    const sent = mockXhr({ status: 200, body: { imageUrl: "data:image/png;base64,ok" } });
    const service = createOpenAIGenerationService();
    const request = makeRequest();

    const result = await service.generate(request);

    expect(result.imageUrl).toBe("data:image/png;base64,ok");
    expect(result.details.model).toBe("gpt-image-2");
    expect(result.details.size).toBe("1024x1024");
    // Sem template do admin, o prompt final é o do template padrão embutido.
    expect(result.details.prompt).toBe(buildGenerationPrompt(request, null));
    // Ordem importa: a referência é sempre a primeira imagem.
    expect(result.details.images.map((i) => i.role)).toEqual([
      "Referência",
      "Foto do aluno",
      "Escudo do clube",
      "Uniforme",
      "Logo R9",
    ]);
    for (const image of result.details.images) {
      expect(image.fileName).toMatch(/\.png$/);
      expect(image.sizeBytes).toBeGreaterThan(0);
    }

    // Os detalhes espelham exatamente o que foi enviado no multipart.
    const files = sent.formData!.getAll("images") as File[];
    expect(files.map((f) => f.name)).toEqual(
      result.details.images.map((i) => i.fileName),
    );
    expect(sent.formData!.get("prompt")).toBe(result.details.prompt);
  });

  it("omite escudo/uniforme/logo quando as opções estão desligadas", async () => {
    mockXhr({ status: 200, body: { imageUrl: "data:image/png;base64,ok" } });
    const service = createOpenAIGenerationService();
    const request = makeRequest({
      showClubLogo: false,
      includeR9Logo: false,
      uniform: undefined,
    });

    const result = await service.generate(request);

    expect(result.details.images.map((i) => i.role)).toEqual([
      "Referência",
      "Foto do aluno",
    ]);
  });

  it("usa o template salvo pelo admin no prompt dos detalhes", async () => {
    const sent = mockXhr({ status: 200, body: { imageUrl: "data:x" } });
    const template = "Post para {{nome_aluno}}.";
    const service = createOpenAIGenerationService(undefined, async () => template);
    const request = makeRequest();

    const result = await service.generate(request);

    expect(result.details.prompt).toBe(buildGenerationPrompt(request, template));
    expect(result.details.prompt).toContain("JOÃO SILVA");
    expect(sent.formData!.get("prompt")).toBe(result.details.prompt);
  });

  it("propaga erro do servidor sem retornar details", async () => {
    mockXhr({ status: 500, body: { error: "Falha interna" } });
    const service = createOpenAIGenerationService();

    await expect(service.generate(makeRequest())).rejects.toThrow("Falha interna");
  });
});
