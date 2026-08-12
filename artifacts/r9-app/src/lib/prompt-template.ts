// Motor de template do prompt de geração.
// O template usa placeholders {{nome}} e blocos condicionais
// {{#bloco}}...{{/bloco}} que só entram no prompt final quando o dado existe.
// O template padrão abaixo equivale exatamente ao prompt fixo original.

import type { GenerationRequest } from "./data/types";

export const DEFAULT_PROMPT_TEMPLATE = [
  "Crie uma arte de post de Instagram (1080x1080) para uma escolinha de futebol, seguindo fielmente o estilo, composição, tipografia e clima da PRIMEIRA imagem enviada (a referência).",
  "Use a foto do aluno enviada como imagem principal do post. Nome do aluno: {{nome_aluno}}.",
  "{{#posicao}}Posição do aluno: {{posicao}}.{{/posicao}}",
  "{{#metricas}}Exiba com destaque estas estatísticas do aluno, com números grandes e legíveis: {{metricas}}.{{/metricas}}",
  "{{#brasao}}Inclua o brasão do clube {{nome_clube}} (imagem enviada) em posição de destaque discreto.{{/brasao}}",
  "{{#cores_clube}}Use as cores oficiais do clube na composição: {{cores_clube}}.{{/cores_clube}}",
  "{{#uniforme}}Uma das imagens enviadas mostra o uniforme do clube — use-o como referência de vestuário/cores.{{/uniforme}}",
  "{{#logo_r9}}Inclua a marca 'R9 ESCOLINHAS' de forma discreta (selo/rodapé), usando o logotipo IAsport enviado como referência de marca.{{/logo_r9}}",
  "{{#prompt_auxiliar}}Instruções adicionais desta geração: {{prompt_auxiliar}}{{/prompt_auxiliar}}",
  "Texto em português do Brasil, sem erros de ortografia. Resultado profissional, pronto para publicação.",
].join("\n");

/** Legenda dos placeholders exibida na tela de admin. */
export const PLACEHOLDER_DOCS: Array<{ token: string; description: string }> = [
  { token: "{{nome_aluno}}", description: "Nome do aluno (em maiúsculas)" },
  { token: "{{posicao}}", description: "Posição do aluno (quando cadastrada)" },
  { token: "{{metricas}}", description: 'Métricas no formato "Nome: valor, ..."' },
  { token: "{{nome_clube}}", description: "Nome do clube do aluno" },
  { token: "{{cores_clube}}", description: "Cores oficiais do clube" },
  { token: "{{prompt_auxiliar}}", description: "Instruções extras digitadas na geração" },
  { token: "{{#posicao}}...{{/posicao}}", description: "Bloco: só entra se o aluno tiver posição" },
  { token: "{{#metricas}}...{{/metricas}}", description: "Bloco: só entra se houver métricas" },
  { token: "{{#brasao}}...{{/brasao}}", description: "Bloco: só entra se o brasão for exibido" },
  { token: "{{#cores_clube}}...{{/cores_clube}}", description: "Bloco: só entra se o clube tiver cores" },
  { token: "{{#uniforme}}...{{/uniforme}}", description: "Bloco: só entra se um uniforme foi escolhido" },
  { token: "{{#logo_r9}}...{{/logo_r9}}", description: "Bloco: só entra se o logo R9 estiver habilitado" },
  { token: "{{#prompt_auxiliar}}...{{/prompt_auxiliar}}", description: "Bloco: só entra se houver instruções extras" },
];

export interface PromptContext {
  /** valores dos placeholders */
  values: Record<string, string>;
  /** blocos condicionais habilitados */
  flags: Record<string, boolean>;
}

export function contextFromRequest(request: GenerationRequest): PromptContext {
  const metricas = request.metrics
    .map((m) => `${m.name}: ${m.value}`)
    .join(", ");
  const showBrasao = request.showClubLogo && !!request.club;
  const cores = showBrasao ? (request.club?.colors ?? []).join(", ") : "";
  const auxiliar = request.auxiliaryPrompt?.trim() ?? "";
  return {
    values: {
      nome_aluno: request.student.name.toUpperCase(),
      posicao: request.student.position ?? "",
      metricas,
      nome_clube: request.club?.name ?? "",
      cores_clube: cores,
      prompt_auxiliar: auxiliar,
    },
    flags: {
      posicao: !!request.student.position,
      metricas: request.metrics.length > 0,
      brasao: showBrasao,
      cores_clube: showBrasao && cores.length > 0,
      uniforme: !!request.uniform,
      logo_r9: request.includeR9Logo,
      prompt_auxiliar: auxiliar.length > 0,
    },
  };
}

/** Contexto de exemplo usado na prévia da tela de admin. */
export const SAMPLE_CONTEXT: PromptContext = {
  values: {
    nome_aluno: "JOÃO DA SILVA",
    posicao: "Atacante",
    metricas: "Gols: 12, Assistências: 7, Dribles: 23",
    nome_clube: "R9 Osasco FC",
    cores_clube: "#39ff14, #2e2e2e",
    prompt_auxiliar: "Fundo com clima de final de campeonato, confetes verdes.",
  },
  flags: {
    posicao: true,
    metricas: true,
    brasao: true,
    cores_clube: true,
    uniforme: true,
    logo_r9: true,
    prompt_auxiliar: true,
  },
};

/**
 * Renderiza o template: resolve blocos condicionais {{#x}}...{{/x}},
 * substitui placeholders {{x}} e normaliza espaços em branco.
 */
export function renderPromptTemplate(
  template: string,
  ctx: PromptContext,
): string {
  let out = template;
  // Blocos condicionais (sem aninhamento — suficiente para o caso de uso).
  out = out.replace(
    /\{\{#([a-z0-9_]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_all, name: string, body: string) => (ctx.flags[name] ? body : ""),
  );
  // Placeholders simples.
  out = out.replace(/\{\{([a-z0-9_]+)\}\}/g, (_all, name: string) =>
    ctx.values[name] ?? "",
  );
  // Normaliza: linhas viram frases separadas por espaço, sem espaços duplos.
  return out
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Monta o prompt final da geração usando o template salvo (ou o padrão). */
export function buildGenerationPrompt(
  request: GenerationRequest,
  template?: string | null,
): string {
  const tpl =
    template && template.trim().length > 0 ? template : DEFAULT_PROMPT_TEMPLATE;
  const prompt = renderPromptTemplate(tpl, contextFromRequest(request));
  // Nunca quebra: template inválido/vazio após render cai no padrão embutido.
  if (prompt.length === 0) {
    return renderPromptTemplate(
      DEFAULT_PROMPT_TEMPLATE,
      contextFromRequest(request),
    );
  }
  return prompt;
}
