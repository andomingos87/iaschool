import { beforeEach, describe, expect, it, vi } from "vitest";

const { edit } = vi.hoisted(() => ({ edit: vi.fn() }));
vi.mock("openai", () => ({
  OpenAI: class {
    images = { edit };
    constructor(_opts: unknown) {}
    static APIError = class extends Error {
      status = 400;
    };
  },
  toFile: async (data: Buffer, name: string) => ({ data, name }),
}));

import { generationBatchDeps } from "../src/lib/generation-batch-process";

describe("ordem das imagens do lote", () => {
  beforeEach(() => {
    edit.mockReset();
    edit.mockResolvedValue({ data: [{ b64_json: Buffer.from("ok").toString("base64") }] });
    vi.stubEnv("OPENAI_API_KEY", "synthetic");
  });
  it("manda o modelo e depois a foto, sem fidelidade nem qualidade", async () => {
    const style = Buffer.from("style");
    const photo = Buffer.from("photo");
    await generationBatchDeps.generate(style, photo, "Arte");
    const arg = edit.mock.calls[0]?.[0] as {
      image: { name: string; data: Buffer }[];
      model: string;
      prompt: string;
      input_fidelity?: string;
      quality?: string;
    };
    expect(arg.image.map((file) => file.name)).toEqual(["modelo-estilo.png", "foto-aluno.png"]);
    expect(arg.image[0]?.data).toBe(style);
    expect(arg.image[1]?.data).toBe(photo);
    expect(arg.model).toBe("gpt-image-2.5-flare");
    expect(arg.prompt).toContain("A primeira imagem enviada é somente o modelo de estilo.");
    expect(arg.input_fidelity).toBeUndefined();
    expect(arg.quality).toBeUndefined();
  });
});
