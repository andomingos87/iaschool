// Testes do validador do template do prompt (tela /admin/prompt).
// A validação deve espelhar exatamente a gramática de renderPromptTemplate.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROMPT_TEMPLATE,
  SAMPLE_CONTEXT,
  renderPromptTemplate,
  validatePromptTemplate,
} from "./prompt-template";

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
