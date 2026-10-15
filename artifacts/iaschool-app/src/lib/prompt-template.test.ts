// Testes do validador e renderizador do template do prompt (tela /admin/prompt).
// A validação deve espelhar exatamente a gramática de renderPromptTemplate.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_ART_SHORTCUTS,
  DEFAULT_PROMPT_TEMPLATE,
  PLACEHOLDER_DOCS,
  PROTECTION_RULE,
  REPLACE_TEXT_INSTRUCTION,
  REPLACE_TEXT_TOKEN,
  SAMPLE_CONTEXT,
  applyReplaceText,
  buildGenerationPrompt,
  contextFromRequest,
  hasUnfilledTextToken,
  removeReplaceText,
  renderPromptTemplate,
  shortcutInstructions,
  toggleArtShortcut,
  validatePromptTemplate,
} from "./prompt-template";
import type { GenerationRequest } from "./data/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Cria um GenerationRequest mínimo válido para testes de contextFromRequest. */
function makeRequest(
  overrides: Partial<GenerationRequest> = {},
): GenerationRequest {
  return {
    student: { id: "s1", name: "João", schoolId: "sc1", createdAt: "" },
    studentPhoto: { url: "foto.jpg", path: "foto.jpg" },
    showSchoolLogo: false,
    reference: {
      id: "r1",
      image: { url: "ref.jpg", path: "ref.jpg" },
      uploadedBy: "u1",
      createdAt: "",
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// validatePromptTemplate — suite original
// ---------------------------------------------------------------------------

describe("validatePromptTemplate", () => {
  it("não gera avisos para o template padrão", () => {
    expect(validatePromptTemplate(DEFAULT_PROMPT_TEMPLATE)).toEqual([]);
  });

  it("não gera avisos para placeholders e blocos conhecidos", () => {
    expect(
      validatePromptTemplate("{{nome_aluno}} {{#cores_escola}}{{cores_escola}}{{/cores_escola}}"),
    ).toEqual([]);
  });

  it("avisa sobre placeholder desconhecido (typo)", () => {
    const w = validatePromptTemplate("Olá {{nome_alluno}}");
    expect(w).toHaveLength(1);
    expect(w[0].token).toBe("{{nome_alluno}}");
    expect(w[0].message).toMatch(/desconhecido/i);
  });

  it("avisa sobre bloco desconhecido", () => {
    const w = validatePromptTemplate("{{#xpto}}oi{{/xpto}}");
    expect(w.map((x) => x.token)).toEqual(["{{#xpto}}", "{{/xpto}}"]);
  });

  it("avisa sobre bloco aberto sem fechamento", () => {
    const w = validatePromptTemplate("{{#cores_escola}} sem fim");
    expect(w).toHaveLength(1);
    expect(w[0].token).toBe("{{#cores_escola}}");
    expect(w[0].message).toMatch(/sem fechamento/i);
  });

  it("avisa sobre fechamento sem abertura", () => {
    const w = validatePromptTemplate("fim {{/prompt_auxiliar}}");
    expect(w).toHaveLength(1);
    expect(w[0].token).toBe("{{/prompt_auxiliar}}");
    expect(w[0].message).toMatch(/sem abertura/i);
  });

  it("avisa sobre espaços dentro das chaves — o renderer não substitui", () => {
    const w = validatePromptTemplate("{{ nome_aluno }}");
    expect(w).toHaveLength(1);
    expect(w[0].message).toMatch(/sintaxe inválida/i);
    // Confirma que o renderer realmente NÃO substitui essa forma.
    expect(renderPromptTemplate("{{ nome_aluno }}", SAMPLE_CONTEXT)).toBe(
      "{{ nome_aluno }}",
    );
  });

  it("avisa sobre bloco com espaço dentro das chaves", () => {
    const w = validatePromptTemplate("{{# cores_escola }}x{{/ cores_escola }}");
    expect(w.length).toBeGreaterThanOrEqual(2);
    expect(w.every((x) => /sintaxe inválida/i.test(x.message))).toBe(true);
  });

  it("avisa sobre caracteres fora de [a-z0-9_] (maiúsculas, hífen)", () => {
    const w = validatePromptTemplate("{{Nome-Aluno}} {{NOME_ALUNO}}");
    expect(w).toHaveLength(2);
    expect(w.every((x) => /sintaxe inválida/i.test(x.message))).toBe(true);
    // O renderer só aceita minúsculas — confirma que não substitui.
    expect(renderPromptTemplate("{{NOME_ALUNO}}", SAMPLE_CONTEXT)).toBe(
      "{{NOME_ALUNO}}",
    );
  });

  it("não repete o mesmo aviso duas vezes", () => {
    const w = validatePromptTemplate("{{oops}} e {{oops}}");
    expect(w).toHaveLength(1);
  });

  it("informa as posições de todas as ocorrências do trecho problemático", () => {
    const tpl = "{{oops}} e {{oops}}";
    const w = validatePromptTemplate(tpl);
    expect(w[0].occurrences).toEqual([
      { start: 0, end: 8 },
      { start: 11, end: 19 },
    ]);
    expect(tpl.slice(0, 8)).toBe("{{oops}}");
    expect(tpl.slice(11, 19)).toBe("{{oops}}");
  });

  it("informa a posição de bloco aberto sem fechamento", () => {
    const w = validatePromptTemplate("abc {{#cores_escola}} sem fim");
    expect(w[0].occurrences).toEqual([{ start: 4, end: 21 }]);
  });

  it("informa a posição de abertura {{ sem fechamento", () => {
    const w = validatePromptTemplate("Olá {{nome_aluno");
    expect(w[0].occurrences).toEqual([{ start: 4, end: 16 }]);
  });

  it("avisa sobre abertura {{ sem fechamento }}", () => {
    const w = validatePromptTemplate("Olá {{nome_aluno");
    expect(w).toHaveLength(1);
    expect(w[0].message).toMatch(/sem fechamento \}\}/i);
    // O renderer deixa o trecho literal.
    expect(renderPromptTemplate("Olá {{nome_aluno", SAMPLE_CONTEXT)).toBe(
      "Olá {{nome_aluno",
    );
  });

  it("avisa sobre }} solto sem abertura", () => {
    const w = validatePromptTemplate("texto }} solto");
    expect(w).toHaveLength(1);
    expect(w[0].token).toBe("}}");
    expect(renderPromptTemplate("texto }} solto", SAMPLE_CONTEXT)).toBe(
      "texto }} solto",
    );
  });

  it("não confunde delimitadores de tokens válidos com delimitadores soltos", () => {
    expect(validatePromptTemplate("{{nome_aluno}} {{#cores_escola}}x{{/cores_escola}}")).toEqual([]);
  });

  it("avisa sobre fechamento truncado junto de token válido", () => {
    const w = validatePromptTemplate("{{nome_aluno}} e {{cores_escola");
    expect(w).toHaveLength(1);
    expect(w[0].message).toMatch(/sem fechamento \}\}/i);
  });

  it("avisa sobre blocos aninhados — o motor não suporta", () => {
    const w = validatePromptTemplate(
      "{{#cores_escola}}{{#prompt_auxiliar}}x{{/prompt_auxiliar}}{{/cores_escola}}",
    );
    expect(w.some((x) => /aninhado/i.test(x.message))).toBe(true);
  });

  it("avisa sobre blocos cruzados", () => {
    const w = validatePromptTemplate(
      "{{#cores_escola}}{{#prompt_auxiliar}}x{{/cores_escola}}{{/prompt_auxiliar}}",
    );
    expect(w.some((x) => /cruzados|aninhado/i.test(x.message))).toBe(true);
    expect(w.some((x) => x.token === "{{#prompt_auxiliar}}" && /cruzados/i.test(x.message))).toBe(
      true,
    );
  });

  it("placeholder desconhecido realmente vira texto vazio no renderer", () => {
    expect(renderPromptTemplate("A{{nome_alluno}}B", SAMPLE_CONTEXT)).toBe("AB");
  });

  it("bloco aberto sem fechamento fica literal no renderer", () => {
    expect(renderPromptTemplate("{{#cores_escola}}oi", SAMPLE_CONTEXT)).toBe(
      "{{#cores_escola}}oi",
    );
  });
});

// ---------------------------------------------------------------------------
// validatePromptTemplate — blocos invertidos
// ---------------------------------------------------------------------------

describe("validatePromptTemplate — blocos invertidos", () => {
  it("não gera aviso para bloco invertido com nome conhecido", () => {
    expect(
      validatePromptTemplate("{{^cores_escola}}sem cores{{/cores_escola}}"),
    ).toEqual([]);
  });

  it("não gera aviso para múltiplas ocorrências do mesmo bloco invertido", () => {
    expect(
      validatePromptTemplate(
        "{{^cores_escola}}sem cores{{/cores_escola}} {{^cores_escola}}repetido{{/cores_escola}}",
      ),
    ).toEqual([]);
  });

  it("avisa sobre bloco invertido com nome desconhecido", () => {
    const w = validatePromptTemplate("{{^xpto}}texto{{/xpto}}");
    // Deve avisar para o abre e para o fecha (bloco desconhecido).
    expect(w.length).toBeGreaterThanOrEqual(1);
    expect(w.some((x) => /desconhecido/i.test(x.message))).toBe(true);
  });

  it("avisa sobre bloco invertido aberto sem fechamento", () => {
    const w = validatePromptTemplate("{{^cores_escola}} sem fim");
    expect(w).toHaveLength(1);
    expect(w[0].message).toMatch(/sem fechamento/i);
  });

  it("avisa sobre fechamento sem abertura correspondente (invertido)", () => {
    const w = validatePromptTemplate("fim {{/cores_escola}}");
    expect(w).toHaveLength(1);
    expect(w[0].message).toMatch(/sem abertura/i);
  });

  it("avisa sobre bloco invertido aninhado dentro de outro bloco", () => {
    const w = validatePromptTemplate(
      "{{#cores_escola}}{{^prompt_auxiliar}}x{{/prompt_auxiliar}}{{/cores_escola}}",
    );
    expect(w.some((x) => /aninhado/i.test(x.message))).toBe(true);
  });

  it("bloco invertido ativo quando flag é false/ausente", () => {
    const ctx = { values: {}, flags: { cores_escola: false } };
    expect(
      renderPromptTemplate("{{^cores_escola}}sem cores{{/cores_escola}}", ctx),
    ).toBe("sem cores");
  });

  it("bloco invertido inativo quando flag é true", () => {
    const ctx = { values: {}, flags: { cores_escola: true } };
    expect(
      renderPromptTemplate("{{^cores_escola}}sem cores{{/cores_escola}}", ctx),
    ).toBe("");
  });

  it("bloco invertido com flag ausente no contexto renderiza o corpo", () => {
    // flag não definida → falsy → bloco invertido ativo
    expect(
      renderPromptTemplate("{{^logo_escola}}sem logo{{/logo_escola}}", {
        values: {},
        flags: {},
      }),
    ).toBe("sem logo");
  });

  it("bloco normal e invertido do mesmo nome funcionam juntos", () => {
    const tplComCores =
      "{{#cores_escola}}com cores{{/cores_escola}}{{^cores_escola}}sem cores{{/cores_escola}}";
    expect(
      renderPromptTemplate(tplComCores, { values: {}, flags: { cores_escola: true } }),
    ).toBe("com cores");
    expect(
      renderPromptTemplate(tplComCores, { values: {}, flags: { cores_escola: false } }),
    ).toBe("sem cores");
  });
});

// ---------------------------------------------------------------------------
// renderPromptTemplate — blocos invertidos
// ---------------------------------------------------------------------------

describe("renderPromptTemplate — blocos invertidos", () => {
  it("renderiza bloco invertido apenas quando flag está ausente/falsa", () => {
    const tpl = "A{{^logo_escola}}SEM LOGO{{/logo_escola}}B";
    expect(renderPromptTemplate(tpl, { values: {}, flags: { logo_escola: false } })).toBe(
      "ASEM LOGOB",
    );
    expect(renderPromptTemplate(tpl, { values: {}, flags: { logo_escola: true } })).toBe(
      "AB",
    );
  });

  it("bloco invertido sem fechamento permanece literal", () => {
    expect(
      renderPromptTemplate("{{^cores_escola}}sem fim", { values: {}, flags: {} }),
    ).toBe("{{^cores_escola}}sem fim");
  });

  it("múltiplos blocos invertidos diferentes são processados independentemente", () => {
    const tpl =
      "{{^cores_escola}}Sem cores. {{/cores_escola}}{{^prompt_auxiliar}}Sem ajustes. {{/prompt_auxiliar}}";
    expect(
      renderPromptTemplate(tpl, {
        values: {},
        flags: { cores_escola: false, prompt_auxiliar: true },
      }),
    ).toBe("Sem cores.");
  });
});

// ---------------------------------------------------------------------------
// contextFromRequest — cores desacopladas do logo da escola
// ---------------------------------------------------------------------------

describe("contextFromRequest — marca da escola fora da geração", () => {
  const escolaComCores = {
    id: "b1",
    name: "Escola Teste",
    logo: { id: "logo", url: "https://example.test/logo.png", path: "logo.png", createdAt: "" },
    colors: ["#ff0000", "#0000ff"],
    createdAt: "",
    updatedAt: "",
  };

  it("não injeta cores nem logo, mesmo com cadastro antigo e a flag ligada", () => {
    const ctx = contextFromRequest(
      makeRequest({ schoolBrand: escolaComCores, showSchoolLogo: true }),
    );
    expect(ctx.flags.cores_escola).toBe(false);
    expect(ctx.flags.logo_escola).toBe(false);
    expect(ctx.values.cores_escola).toBe("");
    expect(ctx.values.nome_escola).toBe("Escola Teste");
  });

  it("template antigo com blocos de marca não leva logo nem cores ao prompt", () => {
    const template = [
      "Aluno {{nome_aluno}} da {{nome_escola}}.",
      "{{#logo_escola}}Inclua o logo da escola.{{/logo_escola}}",
      "{{#cores_escola}}Cores: {{cores_escola}}.{{/cores_escola}}",
      "{{^cores_escola}}Siga a paleta do modelo de arte.{{/cores_escola}}",
    ].join(" ");
    const prompt = buildGenerationPrompt(
      makeRequest({ schoolBrand: escolaComCores, showSchoolLogo: true }),
      template,
    );
    expect(prompt).toContain("JOÃO");
    expect(prompt).toContain("Escola Teste");
    expect(prompt).toContain("Siga a paleta do modelo de arte");
    expect(prompt).not.toContain("Inclua o logo");
    expect(prompt).not.toContain("#ff0000");
    expect(prompt).not.toContain("{{cores_escola}}");
  });

  it("sem escola, o nome fica vazio e a marca continua desligada", () => {
    const ctx = contextFromRequest(
      makeRequest({ schoolBrand: undefined, showSchoolLogo: true }),
    );
    expect(ctx.flags.cores_escola).toBe(false);
    expect(ctx.flags.logo_escola).toBe(false);
    expect(ctx.values.cores_escola).toBe("");
    expect(ctx.values.nome_escola).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Prompt do admin (caso real) — valida e renderiza sem erro
// ---------------------------------------------------------------------------

const ADMIN_PROMPT_NOVO = `TAREFA
Gerar uma arte de post para redes sociais de uma escola, formato quadrado,
destacando um aluno em um evento escolar.

IMAGENS ENVIADAS
As imagens chegam nesta ordem exata. Cada uma serve APENAS ao papel indicado.
1. MODELO DE ARTE — a arte já pronta. Use somente como guia de layout,
   tipografia, tratamento de cor e clima.
2. FOTO DO ALUNO — a fotografia do aluno. Este é o sujeito principal da arte.
As imagens seguintes, na ordem em que foram enviadas, são:
{{#logo_escola}}
- LOGO DA ESCOLA — marca da {{nome_escola}}, geralmente em fundo transparente
  ou chapado. Reproduza fielmente: não redesenhe formas, letras nem cores.
{{/logo_escola}}
Não existem outras imagens além destas. Não presuma imagens ausentes.

IDENTIDADE (prioridade máxima, acima de qualquer outra instrução)
Preserve fielmente o rosto, a estrutura facial, o tom de pele, o cabelo, a idade
aparente e o biotipo do aluno exatamente como na FOTO DO ALUNO. Não substitua
por um modelo genérico, não embeleze, não envelheça nem rejuvenesça.

ESTILO
Do MODELO DE ARTE, siga: grid e layout, hierarquia visual, tipografia, cor,
texturas de fundo e clima geral.
Copie a LINGUAGEM VISUAL, nunca o CONTEÚDO: ignore o rosto, o nome e qualquer
texto presentes nele.

TEXTOS
Renderize exatamente como escrito, com acentuação correta do português do
Brasil. Não acrescente nenhum texto além destes:
- Nome do aluno: "{{nome_aluno}}"

COMPOSIÇÃO
Hierarquia visual: 1) o aluno  2) o nome  3) elementos de marca.
{{#logo_escola}}Logo da escola: pequeno e integrado ao layout, nítido, sem
competir com o rosto do aluno.{{/logo_escola}}
Margem de segurança de 6% em todas as bordas.

PALETA
{{#cores_escola}}Cores da escola: {{cores_escola}}. Aplique-as em elementos
gráficos, mantendo contraste alto e texto sempre legível.{{/cores_escola}}
{{^cores_escola}}Siga a paleta do MODELO DE ARTE.{{/cores_escola}}

{{#prompt_auxiliar}}
AJUSTES DESTA GERAÇÃO
{{prompt_auxiliar}}
Estes ajustes não podem violar as regras de IDENTIDADE e TEXTOS.
{{/prompt_auxiliar}}

RESTRIÇÕES
- Não invente números, nomes, datas, patrocinadores, hashtags, @ ou frases soltas.
- Não escreva palavras em outro idioma nem letras sem significado.
- Não crie moldura, marca d'água, legenda ou interface de app.
- Não duplique o aluno nem crie um segundo rosto na cena.`;

describe("Prompt novo do admin", () => {
  it("valida sem nenhum aviso", () => {
    expect(validatePromptTemplate(ADMIN_PROMPT_NOVO)).toEqual([]);
  });

  it("renderiza com escola+cores+logos+instruções (tudo ativo)", () => {
    const rendered = renderPromptTemplate(ADMIN_PROMPT_NOVO, {
      ...SAMPLE_CONTEXT,
      values: { ...SAMPLE_CONTEXT.values, cores_escola: "#2563eb, #2e2e2e" },
      flags: { ...SAMPLE_CONTEXT.flags, logo_escola: true, cores_escola: true },
    });
    expect(rendered).toContain("JOÃO DA SILVA");
    expect(rendered).toContain("Escola Horizonte");
    // bloco normal de cores ativo → menciona as cores
    expect(rendered).toContain("#2563eb");
    // bloco invertido de cores inativo → "Siga a paleta" não aparece
    expect(rendered).not.toContain("Siga a paleta");
  });

  it("renderiza sem cores da escola: bloco invertido ativo → 'Siga a paleta'", () => {
    const ctxSemCores = {
      ...SAMPLE_CONTEXT,
      flags: { ...SAMPLE_CONTEXT.flags, cores_escola: false },
    };
    const rendered = renderPromptTemplate(ADMIN_PROMPT_NOVO, ctxSemCores);
    expect(rendered).toContain("Siga a paleta");
    expect(rendered).not.toContain("#2563eb");
  });

  it("renderiza sem logo da escola: bloco excluído", () => {
    const ctx = {
      ...SAMPLE_CONTEXT,
      flags: { ...SAMPLE_CONTEXT.flags, logo_escola: false },
    };
    const rendered = renderPromptTemplate(ADMIN_PROMPT_NOVO, ctx);
    expect(rendered).not.toContain("LOGO DA ESCOLA");
    expect(rendered).not.toContain("Logo da escola: pequeno");
  });

  it("renderiza sem instruções adicionais: bloco prompt_auxiliar excluído", () => {
    const ctx = {
      ...SAMPLE_CONTEXT,
      flags: { ...SAMPLE_CONTEXT.flags, prompt_auxiliar: false },
    };
    const rendered = renderPromptTemplate(ADMIN_PROMPT_NOVO, ctx);
    expect(rendered).not.toContain("AJUSTES");
  });

});

// ---------------------------------------------------------------------------
// PLACEHOLDER_DOCS menciona a sintaxe {{^...}}
// ---------------------------------------------------------------------------

describe("PLACEHOLDER_DOCS", () => {
  it("documenta a sintaxe de bloco invertido", () => {
    const texts = PLACEHOLDER_DOCS.map((d) => d.token + " " + d.description).join(" ");
    expect(texts).toMatch(/\{\{\^/);
  });
});

// ---------------------------------------------------------------------------
// Gerar sem cores da escola não deixa rastro vazio na arte
// ---------------------------------------------------------------------------

describe("geração sem cores — bloco {{#cores_escola}} omitido do prompt final", () => {
  const escolaSemCores = {
    id: "b1",
    name: "Escola Teste",
    colors: [],
    createdAt: "",
    updatedAt: "",
  };

  it("contextFromRequest sem cores → flag cores_escola=false e valor vazio", () => {
    const ctx = contextFromRequest(makeRequest({ schoolBrand: escolaSemCores }));
    expect(ctx.flags.cores_escola).toBe(false);
    expect(ctx.values.cores_escola).toBe("");
  });

  it("renderPromptTemplate com flag cores_escola=false remove o bloco inteiro", () => {
    const ctx = contextFromRequest(makeRequest({ schoolBrand: escolaSemCores }));
    const rendered = renderPromptTemplate(DEFAULT_PROMPT_TEMPLATE, ctx);
    expect(rendered).not.toContain("{{#cores_escola}}");
    expect(rendered).not.toContain("{{/cores_escola}}");
    expect(rendered).not.toContain("Use as cores da identidade visual");
  });

  it("renderPromptTemplate com flag cores_escola=false não deixa espaço duplo", () => {
    const ctx = contextFromRequest(makeRequest({ schoolBrand: escolaSemCores }));
    const rendered = renderPromptTemplate(DEFAULT_PROMPT_TEMPLATE, ctx);
    expect(rendered).not.toMatch(/\s{2,}/);
  });

  it("buildGenerationPrompt sem cores omite o bloco do prompt final", () => {
    const prompt = buildGenerationPrompt(
      makeRequest({ schoolBrand: escolaSemCores }),
    );
    expect(prompt).not.toContain("Use as cores da identidade visual");
    expect(prompt).not.toContain("{{#cores_escola}}");
  });

  it("template padrão não pede logo, mesmo com a flag ligada", () => {
    expect(DEFAULT_PROMPT_TEMPLATE).not.toContain("Inclua o logo");
    expect(DEFAULT_PROMPT_TEMPLATE).not.toContain("logo_escola");
    const prompt = buildGenerationPrompt(
      makeRequest({
        showSchoolLogo: true,
        schoolBrand: {
          id: "b1",
          name: "Escola Teste",
          colors: ["#112233"],
          createdAt: "",
          updatedAt: "",
        },
      }),
    );
    expect(prompt).not.toContain("Inclua o logo");
    expect(prompt).not.toContain("#112233");
    expect(prompt).toContain("Não invente textos e logos");
  });

  it("template padrão omite cores mesmo quando a escola tem cores", () => {
    const prompt = buildGenerationPrompt(
      makeRequest({
        schoolBrand: { ...escolaSemCores, colors: ["#ff0000"] },
      }),
    );
    expect(prompt).not.toContain("Use as cores da identidade visual");
    expect(prompt).not.toContain("#ff0000");
  });

  it("template personalizado também omite o bloco quando não há cores", () => {
    const customTemplate =
      "Nome: {{nome_aluno}}. {{#cores_escola}}Cores: {{cores_escola}}.{{/cores_escola}} Fim.";
    const ctx = contextFromRequest(makeRequest({ schoolBrand: escolaSemCores }));
    expect(renderPromptTemplate(customTemplate, ctx)).toBe("Nome: JOÃO. Fim.");
  });
});

// ---------------------------------------------------------------------------
// S02 — atalhos de instrução e regra fixa (ART-03 a ART-06)
// ---------------------------------------------------------------------------

describe("atalhos de instrução (S02)", () => {
  it("os atalhos padrão mantêm só 'Manter a foto original' ligado", () => {
    expect(DEFAULT_ART_SHORTCUTS).toEqual({
      noLogo: false,
      noText: false,
      replaceText: false,
      keepOriginal: true,
    });
  });

  it("'Não usar texto' desliga 'Trocar o texto' e vice-versa", () => {
    const comTroca = toggleArtShortcut(DEFAULT_ART_SHORTCUTS, "replaceText");
    expect(comTroca.replaceText).toBe(true);
    const comSemTexto = toggleArtShortcut(comTroca, "noText");
    expect(comSemTexto.noText).toBe(true);
    expect(comSemTexto.replaceText).toBe(false);

    const voltaTroca = toggleArtShortcut(comSemTexto, "replaceText");
    expect(voltaTroca.replaceText).toBe(true);
    expect(voltaTroca.noText).toBe(false);
  });

  it("aplicar 'Trocar o texto' preserva o texto livre e não duplica", () => {
    const umaVez = applyReplaceText("Tema: festa junina");
    expect(umaVez).toContain("Tema: festa junina");
    expect(umaVez).toContain(REPLACE_TEXT_INSTRUCTION);
    const duasVezes = applyReplaceText(umaVez);
    expect(duasVezes).toBe(umaVez);
    expect(duasVezes.split(REPLACE_TEXT_INSTRUCTION).length - 1).toBe(1);
  });

  it("desfazer remove só a linha da instrução", () => {
    const texto = applyReplaceText("Tema: festa junina");
    expect(removeReplaceText(texto)).toBe("Tema: festa junina");
    expect(removeReplaceText("apenas livre")).toBe("apenas livre");
  });

  it("detecta o marcador por preencher", () => {
    expect(hasUnfilledTextToken("texto sem marcador")).toBe(false);
    expect(hasUnfilledTextToken(`substituir ${REPLACE_TEXT_TOKEN}`)).toBe(true);
  });

  it("as instruções dos atalhos refletem o estado", () => {
    const todas = shortcutInstructions({
      noLogo: true,
      noText: true,
      replaceText: true,
      keepOriginal: true,
    });
    expect(todas).toMatch(/nenhum logo/i);
    expect(todas).toMatch(/títulos/i);
    expect(todas).toMatch(/Manter a foto original/i);
    expect(shortcutInstructions(undefined)).toBe("");
  });
});

describe("buildGenerationPrompt — regra fixa (ART-05, ART-06)", () => {
  it("começa pela regra fixa e mantém o template renderizado", () => {
    const prompt = buildGenerationPrompt(makeRequest());
    expect(prompt.startsWith(PROTECTION_RULE)).toBe(true);
    expect(prompt).toContain("JOÃO");
    expect(prompt.split(PROTECTION_RULE).length - 1).toBe(1);
  });

  it("mantém a regra mesmo com texto livre conflitante", () => {
    const prompt = buildGenerationPrompt(
      makeRequest({ auxiliaryPrompt: "Troque a roupa do aluno por outra." }),
    );
    expect(prompt.indexOf(PROTECTION_RULE)).toBe(0);
    expect(prompt.indexOf(PROTECTION_RULE)).toBeLessThan(
      prompt.indexOf("Troque a roupa"),
    );
  });

  it("inclui as instruções dos atalhos ativos", () => {
    const prompt = buildGenerationPrompt(
      makeRequest({
        shortcuts: {
          noLogo: true,
          noText: false,
          replaceText: false,
          keepOriginal: true,
        },
      }),
    );
    expect(prompt).toMatch(/nenhum logo/i);
  });
});

it("prévia normaliza dimensão de template antigo para o tamanho real da API", () => {
  const request = {student:{name:"Aluno"}, schoolBrand:{name:"Escola"}} as GenerationRequest;
  expect(buildGenerationPrompt(request,"Crie uma arte 1080 × 1080.")).toContain("1024x1024");
  expect(buildGenerationPrompt(request,"Crie uma arte 1080 × 1080.")).not.toContain("1080");
});
