import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GenerationBatchWait } from "./generation-batch-wait";
import {
  BATCH_WAIT_LEAVE,
  BATCH_WAIT_PHRASES,
} from "../lib/generation-phrases";

describe("espera do lote", () => {
  it("mostra uma frase, o progresso e que dá para sair", () => {
    const html = renderToStaticMarkup(
      createElement(GenerationBatchWait, {
        phrase: BATCH_WAIT_PHRASES[0],
        completed: 1,
        total: 4,
      }),
    );
    expect(html).toContain("Suas artes estão sendo preparadas.");
    expect(html).toContain(BATCH_WAIT_PHRASES[0]);
    expect(html).toContain("1 de 4");
    expect(html).toContain(BATCH_WAIT_LEAVE);
    expect(html.toLowerCase()).not.toContain("cores da escola");
    expect(html.toLowerCase()).not.toContain("recort");
  });
});
