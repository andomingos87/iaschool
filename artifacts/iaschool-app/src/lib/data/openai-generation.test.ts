// Testes do contrato de `generate()`: os detalhes da geração (prompt final,
// modelo, tamanho e lista ORDENADA de imagens com papéis) precisam continuar
// sendo retornados — o histórico do admin depende deles para depurar o template.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOpenAIGenerationService } from "./openai-generation";
import { buildGenerationPrompt } from "../prompt-template";
import type { OriginalGenerationRequest } from "../original-composition";
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

function makeRequest(
  overrides: Partial<GenerationRequest> = {},
): OriginalGenerationRequest {
  return {
    composition: {
      version: "original-pixels-v1",
      photoId: "foto-aluno",
      reviewed: true,
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
      ],
      protectedHead: { x: 0.3, y: 0.1, width: 0.4, height: 0.3 },
    },
    student: {
      id: "s1",
      name: "João Silva",
      whatsapp: "11999999999",
      photos: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    studentPhoto: img("foto-aluno"),
    schoolBrand: {
      id: "b1",
      name: "Escola Teste",
      logo: img("logo-escola"),
      colors: ["azul", "branco"],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    showSchoolLogo: true,
    reference: {
      id: "r1",
      image: img("referencia"),
      uploadedBy: "admin",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
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
      onprogress:
        | ((e: {
            lengthComputable: boolean;
            loaded: number;
            total: number;
          }) => void)
        | null;
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
        this.upload.onprogress?.({
          lengthComputable: true,
          loaded: 5,
          total: 10,
        });
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
    const sent = mockXhr({
      status: 200,
      body: { imageUrl: "data:image/png;base64,ok" },
    });
    const service = createOpenAIGenerationService();
    const request = makeRequest();

    const result = await service.generate(request);

    expect(result.imageUrl).toBe("data:image/png;base64,ok");
    expect(result.details.model).toBe("gpt-image-2.5-flare");
    expect(result.details.size).toBe("1024x1024");
    // Sem template do admin, o prompt final é o do template padrão embutido.
    expect(result.details.prompt).toBe(buildGenerationPrompt(request, null));
    // Ordem importa: a referência é sempre a primeira imagem.
    // Logo e cores da escola não entram, mesmo com flag e arquivo antigos.
    expect(result.details.images.map((i) => i.role)).toEqual([
      "Referência",
      "Foto do aluno",
    ]);
    expect(result.details.prompt).not.toContain("logo-escola");
    expect(result.details.prompt).not.toContain("azul");
    const meta = JSON.parse(String(sent.formData!.get("meta"))) as {
      showSchoolLogo: boolean;
    };
    expect(meta.showSchoolLogo).toBe(false);
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

  it("não oferece logo: escola com imagem e flag falsa não anexa nem cita o logo", async () => {
    const sent = mockXhr({
      status: 200,
      body: { imageUrl: "data:image/png;base64,ok" },
    });
    const service = createOpenAIGenerationService();
    const request = makeRequest({ showSchoolLogo: false });

    const result = await service.generate(request);

    expect(result.details.images.map((i) => i.role)).toEqual([
      "Referência",
      "Foto do aluno",
    ]);
    expect(result.details.prompt).not.toContain("Inclua o logo");
    expect(result.details.prompt).not.toContain("Logo da escola");
    const files = sent.formData!.getAll("images") as File[];
    expect(files).toHaveLength(2);
  });

  it("omite o logo da escola quando a opção está desligada", async () => {
    mockXhr({ status: 200, body: { imageUrl: "data:image/png;base64,ok" } });
    const service = createOpenAIGenerationService();
    const request = makeRequest({
      showSchoolLogo: false,
    });

    const result = await service.generate(request);

    expect(result.details.images.map((i) => i.role)).toEqual([
      "Referência",
      "Foto do aluno",
    ]);
  });

  it("template antigo com logo e cores da escola não anexa arquivo nem injeta a paleta", async () => {
    const sent = mockXhr({
      status: 200,
      body: { imageUrl: "data:image/png;base64,ok" },
    });
    const service = createOpenAIGenerationService(
      undefined,
      async () =>
        "{{#logo_escola}}Inclua o logo da escola.{{/logo_escola}} {{#cores_escola}}Cores {{cores_escola}}{{/cores_escola}} {{nome_aluno}}",
    );
    const result = await service.generate(makeRequest());

    expect(result.details.images.map((image) => image.role)).toEqual([
      "Referência",
      "Foto do aluno",
    ]);
    expect(result.details.prompt).not.toContain("Inclua o logo");
    expect(result.details.prompt).not.toContain("azul");
    expect(result.details.prompt).toContain("JOÃO SILVA");
    const files = sent.formData!.getAll("images") as File[];
    expect(files).toHaveLength(2);
    expect(files.some((file) => file.name.includes("logo"))).toBe(false);
  });

  it("usa o template salvo pelo admin no prompt dos detalhes", async () => {
    const sent = mockXhr({ status: 200, body: { imageUrl: "data:x" } });
    const template = "Post para {{nome_aluno}}.";
    const service = createOpenAIGenerationService(
      undefined,
      async () => template,
    );
    const request = makeRequest();

    const result = await service.generate(request);

    expect(result.details.prompt).toBe(
      buildGenerationPrompt(request, template),
    );
    expect(result.details.prompt).toContain("JOÃO SILVA");
    expect(sent.formData!.get("prompt")).toBe(result.details.prompt);
  });

  it("propaga erro do servidor sem retornar details", async () => {
    mockXhr({ status: 500, body: { error: "Falha interna" } });
    const service = createOpenAIGenerationService();

    await expect(service.generate(makeRequest())).rejects.toThrow(
      "Falha interna",
    );
  });
});

it("exige recorte conferido para a foto atual antes de qualquer envio", async () => {
  const request = makeRequest();
  request.composition.photoId = "outra-foto";
  await expect(
    createOpenAIGenerationService().generate(request),
  ).rejects.toThrow(/recorte/);
  expect(fetch).not.toHaveBeenCalled();
});

it("envia recorte e origem do fallback sem nome do aluno nos metadados", async () => {
  const sent = mockXhr({
    status: 200,
    body: { imageUrl: "data:image/png;base64,ok" },
  });
  await createOpenAIGenerationService(undefined, async () => {
    throw new Error("indisponível");
  }).generate(makeRequest());
  const meta = JSON.parse(String(sent.formData!.get("meta")));
  expect(meta.templateSource).toBe("fallback");
  expect(meta.studentName).toBeUndefined();
  expect(meta.schoolName).toBeUndefined();
  expect(JSON.parse(String(sent.formData!.get("composition")))).toMatchObject({
    version: "original-pixels-v1",
    reviewed: true,
    photoId: "foto-aluno",
  });
});

it("fluxo foto+prompt envia uma única imagem sem template, atalhos ou recorte", async () => {
  const sent = mockXhr({
      status: 200,
      body: { imageUrl: "data:image/png;base64,ok" },
    }),
    getTemplate = vi.fn();
  const legacy = makeRequest();
  const result = await createOpenAIGenerationService(
    undefined,
    getTemplate,
  ).generate({
    mode: "photo_prompt",
    student: legacy.student,
    studentPhoto: legacy.studentPhoto,
    schoolBrand: legacy.schoolBrand,
    prompt: "Festa junina com bandeirinhas",
  });
  expect(sent.formData!.get("mode")).toBe("photo_prompt");
  expect(sent.formData!.getAll("images")).toHaveLength(1);
  expect(sent.formData!.get("prompt")).toBe("Festa junina com bandeirinhas");
  expect(sent.formData!.get("composition")).toBeNull();
  expect(sent.formData!.get("meta")).toBeNull();
  expect(getTemplate).not.toHaveBeenCalled();
  expect(result.details.images).toHaveLength(1);
  expect(result.details.prompt).toBe("Festa junina com bandeirinhas");
});
it("fluxo simples bloqueia prompt vazio e erro mantém resposta recuperável", async () => {
  const legacy = makeRequest(),
    service = createOpenAIGenerationService();
  await expect(
    service.generate({
      mode: "photo_prompt",
      student: legacy.student,
      studentPhoto: legacy.studentPhoto,
      prompt: " ",
    }),
  ).rejects.toThrow("Escreva");
  expect(fetch).not.toHaveBeenCalled();
  mockXhr({ status: 502, body: { error: "Tente novamente" } });
  await expect(
    service.generate({
      mode: "photo_prompt",
      student: legacy.student,
      studentPhoto: legacy.studentPhoto,
      prompt: "Festa",
    }),
  ).rejects.toThrow("Tente novamente");
});
