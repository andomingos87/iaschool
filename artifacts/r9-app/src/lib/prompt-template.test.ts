// Testes do validador e renderizador do template do prompt (tela /admin/prompt).
// A validação deve espelhar exatamente a gramática de renderPromptTemplate.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROMPT_TEMPLATE,
  PLACEHOLDER_DOCS,
  SAMPLE_CONTEXT,
  buildGenerationPrompt,
  contextFromRequest,
  renderPromptTemplate,
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
    showClubLogo: false,
    includeR9Logo: false,
    reference: {
      id: "r1",
      image: { url: "ref.jpg", path: "ref.jpg" },
      uploadedBy: "u1",
      createdAt: "",
    },
    metrics: [],
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
      validatePromptTemplate("{{nome_aluno}} {{#posicao}}{{posicao}}{{/posicao}}"),
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
    const w = validatePromptTemplate("{{#posicao}} sem fim");
    expect(w).toHaveLength(1);
    expect(w[0].token).toBe("{{#posicao}}");
    expect(w[0].message).toMatch(/sem fechamento/i);
  });

  it("avisa sobre fechamento sem abertura", () => {
    const w = validatePromptTemplate("fim {{/metricas}}");
    expect(w).toHaveLength(1);
    expect(w[0].token).toBe("{{/metricas}}");
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
    const w = validatePromptTemplate("{{# posicao }}x{{/ posicao }}");
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
    const w = validatePromptTemplate("abc {{#posicao}} sem fim");
    expect(w[0].occurrences).toEqual([{ start: 4, end: 16 }]);
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
    expect(validatePromptTemplate("{{nome_aluno}} {{#posicao}}x{{/posicao}}")).toEqual([]);
  });

  it("avisa sobre fechamento truncado junto de token válido", () => {
    const w = validatePromptTemplate("{{nome_aluno}} e {{posicao");
    expect(w).toHaveLength(1);
    expect(w[0].message).toMatch(/sem fechamento \}\}/i);
  });

  it("avisa sobre blocos aninhados — o motor não suporta", () => {
    const w = validatePromptTemplate(
      "{{#posicao}}{{#metricas}}x{{/metricas}}{{/posicao}}",
    );
    expect(w.some((x) => /aninhado/i.test(x.message))).toBe(true);
  });

  it("avisa sobre blocos cruzados", () => {
    const w = validatePromptTemplate(
      "{{#posicao}}{{#metricas}}x{{/posicao}}{{/metricas}}",
    );
    expect(w.some((x) => /cruzados|aninhado/i.test(x.message))).toBe(true);
    expect(w.some((x) => x.token === "{{#metricas}}" && /cruzados/i.test(x.message))).toBe(
      true,
    );
  });

  it("placeholder desconhecido realmente vira texto vazio no renderer", () => {
    expect(renderPromptTemplate("A{{nome_alluno}}B", SAMPLE_CONTEXT)).toBe("AB");
  });

  it("bloco aberto sem fechamento fica literal no renderer", () => {
    expect(renderPromptTemplate("{{#posicao}}oi", SAMPLE_CONTEXT)).toBe(
      "{{#posicao}}oi",
    );
  });
});

// ---------------------------------------------------------------------------
// validatePromptTemplate — blocos invertidos
// ---------------------------------------------------------------------------

describe("validatePromptTemplate — blocos invertidos", () => {
  it("não gera aviso para bloco invertido com nome conhecido", () => {
    expect(
      validatePromptTemplate("{{^cores_clube}}sem cores{{/cores_clube}}"),
    ).toEqual([]);
  });

  it("não gera aviso para múltiplas ocorrências do mesmo bloco invertido", () => {
    expect(
      validatePromptTemplate(
        "{{^posicao}}sem posição{{/posicao}} {{^posicao}}repetido{{/posicao}}",
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
    const w = validatePromptTemplate("{{^posicao}} sem fim");
    expect(w).toHaveLength(1);
    expect(w[0].message).toMatch(/sem fechamento/i);
  });

  it("avisa sobre fechamento sem abertura correspondente (invertido)", () => {
    const w = validatePromptTemplate("fim {{/cores_clube}}");
    expect(w).toHaveLength(1);
    expect(w[0].message).toMatch(/sem abertura/i);
  });

  it("avisa sobre bloco invertido aninhado dentro de outro bloco", () => {
    const w = validatePromptTemplate(
      "{{#posicao}}{{^metricas}}x{{/metricas}}{{/posicao}}",
    );
    expect(w.some((x) => /aninhado/i.test(x.message))).toBe(true);
  });

  it("bloco invertido ativo quando flag é false/ausente", () => {
    const ctx = { values: {}, flags: { cores_clube: false } };
    expect(
      renderPromptTemplate("{{^cores_clube}}sem cores{{/cores_clube}}", ctx),
    ).toBe("sem cores");
  });

  it("bloco invertido inativo quando flag é true", () => {
    const ctx = { values: {}, flags: { cores_clube: true } };
    expect(
      renderPromptTemplate("{{^cores_clube}}sem cores{{/cores_clube}}", ctx),
    ).toBe("");
  });

  it("bloco invertido com flag ausente no contexto renderiza o corpo", () => {
    // flag não definida → falsy → bloco invertido ativo
    expect(
      renderPromptTemplate("{{^uniforme}}sem uniforme{{/uniforme}}", {
        values: {},
        flags: {},
      }),
    ).toBe("sem uniforme");
  });

  it("bloco normal e invertido do mesmo nome funcionam juntos", () => {
    const tplComCores =
      "{{#cores_clube}}com cores{{/cores_clube}}{{^cores_clube}}sem cores{{/cores_clube}}";
    expect(
      renderPromptTemplate(tplComCores, { values: {}, flags: { cores_clube: true } }),
    ).toBe("com cores");
    expect(
      renderPromptTemplate(tplComCores, { values: {}, flags: { cores_clube: false } }),
    ).toBe("sem cores");
  });
});

// ---------------------------------------------------------------------------
// renderPromptTemplate — blocos invertidos
// ---------------------------------------------------------------------------

describe("renderPromptTemplate — blocos invertidos", () => {
  it("renderiza bloco invertido apenas quando flag está ausente/falsa", () => {
    const tpl = "A{{^brasao}}SEM BRASÃO{{/brasao}}B";
    expect(renderPromptTemplate(tpl, { values: {}, flags: { brasao: false } })).toBe(
      "ASEM BRASÃOB",
    );
    expect(renderPromptTemplate(tpl, { values: {}, flags: { brasao: true } })).toBe(
      "AB",
    );
  });

  it("bloco invertido sem fechamento permanece literal", () => {
    expect(
      renderPromptTemplate("{{^posicao}}sem fim", { values: {}, flags: {} }),
    ).toBe("{{^posicao}}sem fim");
  });

  it("múltiplos blocos invertidos diferentes são processados independentemente", () => {
    const tpl =
      "{{^posicao}}Posição desconhecida. {{/posicao}}{{^metricas}}Sem métricas. {{/metricas}}";
    expect(
      renderPromptTemplate(tpl, {
        values: {},
        flags: { posicao: false, metricas: true },
      }),
    ).toBe("Posição desconhecida.");
  });
});

// ---------------------------------------------------------------------------
// contextFromRequest — cores desacopladas do brasão
// ---------------------------------------------------------------------------

describe("contextFromRequest — cores_clube desacoplado do brasão", () => {
  const clubComCores = {
    id: "c1",
    name: "Clube Teste",
    colors: ["#ff0000", "#0000ff"],
    uniforms: [],
    createdAt: "",
    updatedAt: "",
  };

  it("cores_clube ativo quando clube tem cores e brasão está ligado", () => {
    const ctx = contextFromRequest(
      makeRequest({ club: clubComCores, showClubLogo: true }),
    );
    expect(ctx.flags.cores_clube).toBe(true);
    expect(ctx.values.cores_clube).toBe("#ff0000, #0000ff");
    expect(ctx.flags.brasao).toBe(true);
  });

  it("cores_clube ativo mesmo quando brasão está desligado", () => {
    const ctx = contextFromRequest(
      makeRequest({ club: clubComCores, showClubLogo: false }),
    );
    expect(ctx.flags.cores_clube).toBe(true);
    expect(ctx.values.cores_clube).toBe("#ff0000, #0000ff");
    expect(ctx.flags.brasao).toBe(false);
  });

  it("cores_clube inativo quando não há clube", () => {
    const ctx = contextFromRequest(
      makeRequest({ club: undefined, showClubLogo: false }),
    );
    expect(ctx.flags.cores_clube).toBe(false);
    expect(ctx.values.cores_clube).toBe("");
  });

  it("cores_clube inativo quando clube não tem cores cadastradas", () => {
    const clubSemCores = { ...clubComCores, colors: [] };
    const ctx = contextFromRequest(
      makeRequest({ club: clubSemCores, showClubLogo: true }),
    );
    expect(ctx.flags.cores_clube).toBe(false);
    expect(ctx.values.cores_clube).toBe("");
  });

  it("brasao segue showClubLogo independentemente das cores", () => {
    // brasão ligado, sem cores → brasao=true, cores_clube=false
    const clubSemCores = { ...clubComCores, colors: [] };
    const ctxBrasaoSemCores = contextFromRequest(
      makeRequest({ club: clubSemCores, showClubLogo: true }),
    );
    expect(ctxBrasaoSemCores.flags.brasao).toBe(true);
    expect(ctxBrasaoSemCores.flags.cores_clube).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Prompt do admin (caso real) — valida e renderiza sem erro
// ---------------------------------------------------------------------------

const ADMIN_PROMPT_NOVO = `TAREFA
Gerar uma arte de post de Instagram, formato quadrado, para uma escolinha de
futebol, destacando um aluno e suas estatísticas.

IMAGENS ENVIADAS
As imagens chegam nesta ordem exata. Cada uma serve APENAS ao papel indicado.
1. REFERÊNCIA DE ESTILO — a arte de post já pronta. Use somente como guia de
   layout, tipografia, tratamento de cor e clima.
2. FOTO DO ALUNO — a fotografia do atleta. Este é o sujeito principal da arte.
As imagens seguintes, na ordem em que foram enviadas, são:
{{#brasao}}
- BRASÃO DO CLUBE — escudo/emblema do {{nome_clube}}, geralmente em fundo
  transparente ou chapado. Reproduza fielmente: não redesenhe formas, letras
  nem cores.
{{/brasao}}
{{#uniforme}}
- UNIFORME DO CLUBE — peça de vestuário esportivo (camisa/kit), fotografada ou
  em mockup. Vista o aluno com este uniforme, respeitando cores, faixas, gola e
  detalhes. Não invente patrocínio, número nem nome nas costas.
{{/uniforme}}
{{#logo_r9}}
- LOGOTIPO DA MARCA — logotipo IAsport. Reproduza fielmente como selo de
  marca, sem redesenhar.
{{/logo_r9}}
Não existem outras imagens além destas. Não presuma imagens ausentes.

IDENTIDADE (prioridade máxima, acima de qualquer outra instrução)
Preserve fielmente o rosto, a estrutura facial, o tom de pele, o cabelo, a idade
aparente e o biotipo do aluno exatamente como na FOTO DO ALUNO. Não substitua
por um modelo genérico, não embeleze, não envelheça nem rejuvenesça. Recorte o
aluno e reintegre-o à composição com iluminação, sombra e contato de solo
coerentes com a cena.

ESTILO
Da REFERÊNCIA DE ESTILO, siga: grid e layout, hierarquia visual, tipografia
(família, peso, caixa, inclinação), tratamento de cor, texturas de fundo,
efeitos de luz e clima geral.
Copie a LINGUAGEM VISUAL, nunca o CONTEÚDO: ignore o rosto, o nome, os números e
qualquer texto presentes nela. Nenhuma pessoa da REFERÊNCIA pode aparecer na
arte final.

TEXTOS
Renderize exatamente como escrito, caractere por caractere, com acentuação
correta do português do Brasil. Não acrescente nenhum texto além destes:
- Nome do atleta: "{{nome_aluno}}"
{{#posicao}}- Posição: "{{posicao}}"{{/posicao}}
{{#metricas}}- Estatísticas, cada uma com o número grande e o rótulo menor
  acompanhando: {{metricas}}{{/metricas}}

COMPOSIÇÃO
Hierarquia visual, do mais para o menos proeminente:
1) o aluno  2) o nome  3) os valores das estatísticas  4) elementos de marca.
{{#brasao}}Brasão: pequeno e integrado ao layout (canto superior ou junto ao
nome), nítido, sem competir com o rosto do aluno.{{/brasao}}
{{#logo_r9}}Selo de marca: pequeno no rodapé, legível, nunca
cortado.{{/logo_r9}}
Margem de segurança de 6% em todas as bordas — nenhum texto, número ou logo pode
encostar na borda ou ser cortado.

PALETA
{{#cores_clube}}Cores oficiais do clube: {{cores_clube}}. Aplique-as em elementos
gráficos (faixas, blocos, brilhos, destaque numérico), mantendo contraste alto e
texto sempre legível.{{/cores_clube}}
{{^cores_clube}}Siga a paleta da REFERÊNCIA DE ESTILO.{{/cores_clube}}

{{#prompt_auxiliar}}
AJUSTES DESTA GERAÇÃO
{{prompt_auxiliar}}
Estes ajustes não podem violar as regras de IDENTIDADE, TEXTOS e RESTRIÇÕES.
{{/prompt_auxiliar}}

RESTRIÇÕES
- Não invente números, nomes, datas, patrocinadores, hashtags, @ ou frases soltas.
- Não escreva palavras em outro idioma nem letras sem significado.
- Não reproduza logos de clubes profissionais, ligas ou marcas esportivas reais.
- Não crie moldura, borda de foto, marca d'água, legenda ou interface de app.
- Não duplique o aluno nem crie um segundo rosto na cena.
- Não deforme mãos, orelhas, dentes ou o brasão.`;

describe("Prompt novo do admin", () => {
  it("valida sem nenhum aviso", () => {
    expect(validatePromptTemplate(ADMIN_PROMPT_NOVO)).toEqual([]);
  });

  it("renderiza com clube+cores+brasão+uniforme+logo+posição+métricas+instruções (tudo ativo)", () => {
    const rendered = renderPromptTemplate(ADMIN_PROMPT_NOVO, SAMPLE_CONTEXT);
    expect(rendered).toContain("JOÃO DA SILVA");
    expect(rendered).toContain("Atacante");
    expect(rendered).toContain("Gols: 12");
    // bloco normal de cores ativo → menciona as cores
    expect(rendered).toContain("#39ff14");
    // bloco invertido de cores inativo → "Siga a paleta" não aparece
    expect(rendered).not.toContain("Siga a paleta");
  });

  it("renderiza sem clube: bloco invertido de cores ativo → 'Siga a paleta'", () => {
    const ctxSemCores = {
      ...SAMPLE_CONTEXT,
      flags: { ...SAMPLE_CONTEXT.flags, cores_clube: false },
    };
    const rendered = renderPromptTemplate(ADMIN_PROMPT_NOVO, ctxSemCores);
    expect(rendered).toContain("Siga a paleta");
    expect(rendered).not.toContain("#39ff14");
  });

  it("renderiza sem brasão: bloco brasão excluído", () => {
    const ctxSemBrasao = {
      ...SAMPLE_CONTEXT,
      flags: { ...SAMPLE_CONTEXT.flags, brasao: false },
    };
    const rendered = renderPromptTemplate(ADMIN_PROMPT_NOVO, ctxSemBrasao);
    expect(rendered).not.toContain("BRASÃO DO CLUBE");
    expect(rendered).not.toContain("Brasão: pequeno");
  });

  it("renderiza sem posição nem métricas: blocos excluídos", () => {
    const ctx = {
      ...SAMPLE_CONTEXT,
      flags: { ...SAMPLE_CONTEXT.flags, posicao: false, metricas: false },
    };
    const rendered = renderPromptTemplate(ADMIN_PROMPT_NOVO, ctx);
    expect(rendered).not.toContain("Posição");
    expect(rendered).not.toContain("Estatísticas");
  });

  it("renderiza sem instruções adicionais: bloco prompt_auxiliar excluído", () => {
    const ctx = {
      ...SAMPLE_CONTEXT,
      flags: { ...SAMPLE_CONTEXT.flags, prompt_auxiliar: false },
    };
    const rendered = renderPromptTemplate(ADMIN_PROMPT_NOVO, ctx);
    expect(rendered).not.toContain("AJUSTES");
  });

  it("renderiza sem logo R9: bloco logo_r9 excluído", () => {
    const ctx = {
      ...SAMPLE_CONTEXT,
      flags: { ...SAMPLE_CONTEXT.flags, logo_r9: false },
    };
    const rendered = renderPromptTemplate(ADMIN_PROMPT_NOVO, ctx);
    expect(rendered).not.toContain("LOGOTIPO DA MARCA");
    expect(rendered).not.toContain("Selo de marca");
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
// Gerar sem métricas não deixa rastro vazio na arte (task #69)
// ---------------------------------------------------------------------------

describe("geração sem métricas — bloco {{#metricas}} omitido do prompt final", () => {
  it("contextFromRequest com metrics vazio → flag metricas=false e valor vazio", () => {
    const ctx = contextFromRequest(makeRequest({ metrics: [] }));
    expect(ctx.flags.metricas).toBe(false);
    expect(ctx.values.metricas).toBe("");
  });

  it("renderPromptTemplate com flag metricas=false remove o bloco inteiro", () => {
    const ctx = contextFromRequest(makeRequest({ metrics: [] }));
    const rendered = renderPromptTemplate(DEFAULT_PROMPT_TEMPLATE, ctx);
    // O bloco deve ser removido: nem o delimitador nem o corpo aparecem
    expect(rendered).not.toContain("{{#metricas}}");
    expect(rendered).not.toContain("{{/metricas}}");
    expect(rendered).not.toContain("Exiba com destaque estas estatísticas");
  });

  it("renderPromptTemplate com flag metricas=false não deixa texto vazio de métricas", () => {
    const ctx = contextFromRequest(makeRequest({ metrics: [] }));
    const rendered = renderPromptTemplate(DEFAULT_PROMPT_TEMPLATE, ctx);
    // O valor placeholder também não deve aparecer (seria string vazia expandida)
    expect(rendered).not.toMatch(/estatísticas.*:\s*[,.]?$/m);
    // Sem espaços duplos que denunciem conteúdo excisado
    expect(rendered).not.toMatch(/\s{2,}/);
  });

  it("buildGenerationPrompt com metrics vazio omite o bloco de métricas do prompt final", () => {
    const request = makeRequest({ metrics: [] });
    const prompt = buildGenerationPrompt(request);
    expect(prompt).not.toContain("Exiba com destaque estas estatísticas");
    expect(prompt).not.toContain("{{#metricas}}");
    expect(prompt).not.toContain("{{/metricas}}");
  });

  it("buildGenerationPrompt com metrics preenchidos inclui o bloco de métricas", () => {
    const request = makeRequest({
      metrics: [{ metricId: "m1", name: "Gols", value: "10" }],
    });
    const prompt = buildGenerationPrompt(request);
    expect(prompt).toContain("Exiba com destaque estas estatísticas");
    expect(prompt).toContain("Gols: 10");
  });

  it("renderPromptTemplate com metrics vazio e template personalizado também omite o bloco", () => {
    const customTemplate =
      "Nome: {{nome_aluno}}. {{#metricas}}Stats: {{metricas}}.{{/metricas}} Fim.";
    const ctx = contextFromRequest(makeRequest({ metrics: [] }));
    const rendered = renderPromptTemplate(customTemplate, ctx);
    expect(rendered).toBe("Nome: JOÃO. Fim.");
    expect(rendered).not.toContain("Stats");
  });
});
