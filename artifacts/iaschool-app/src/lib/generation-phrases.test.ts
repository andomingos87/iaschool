import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GenerationLoader } from "../components/generation-loader";
import { GENERATION_PHRASES } from "./generation-phrases";

describe("frases da geração", () => {
  it("a espera renderizada não diz que as cores da escola entram na arte", () => {
    expect(GENERATION_PHRASES.length).toBeGreaterThan(1);
    for (const phrase of GENERATION_PHRASES) {
      expect(phrase).not.toMatch(/cores da escola/i);
    }
    const html = renderToStaticMarkup(createElement(GenerationLoader, { uploadProgress: null }));
    expect(html).toContain(GENERATION_PHRASES[0]);
    expect(html).not.toMatch(/cores da escola/i);
    expect(html).not.toContain("Aplicando as cores");
  });
});
