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

/** Placeholders simples reconhecidos pelo motor. */
export const KNOWN_PLACEHOLDERS = [
  "nome_aluno",
  "posicao",
  "metricas",
  "nome_clube",
  "cores_clube",
  "prompt_auxiliar",
] as const;

/** Blocos condicionais reconhecidos pelo motor. */
export const KNOWN_BLOCKS = [
  "posicao",
  "metricas",
  "brasao",
  "cores_clube",
  "uniforme",
  "logo_r9",
  "prompt_auxiliar",
] as const;

export interface TemplateWarning {
  /** Trecho exatamente como digitado no template. */
  token: string;
  /** Mensagem curta em pt-BR explicando o problema. */
  message: string;
  /**
   * Posições (início/fim, em índices de caractere do template) de todas as
   * ocorrências do trecho problemático — usadas para destacar no editor e
   * levar o cursor até o local ao clicar no aviso.
   */
  occurrences: Array<{ start: number; end: number }>;
}

/**
 * Valida o texto do template com exatamente a mesma gramática do renderer
 * (nomes em minúsculas `[a-z0-9_]+`, sem espaços dentro das chaves).
 * Retorna avisos (não bloqueantes) para:
 * - placeholders desconhecidos ({{nome_alluno}}) — viram texto vazio
 * - blocos desconhecidos ({{#xpto}}...{{/xpto}}) — o conteúdo é removido
 * - blocos abertos sem fechamento ({{#x}} sem {{/x}}) e vice-versa — a tag
 *   fica como texto literal no prompt
 * - sintaxe inválida ({{ nome }}, {{Nome-Aluno}}) — o motor ignora e o trecho
 *   fica como texto literal no prompt
 */
export function validatePromptTemplate(template: string): TemplateWarning[] {
  const warnings: TemplateWarning[] = [];
  const byKey = new Map<string, TemplateWarning>();
  const add = (token: string, message: string, start?: number, end?: number) => {
    const key = `${token}|${message}`;
    let w = byKey.get(key);
    if (!w) {
      w = { token, message, occurrences: [] };
      byKey.set(key, w);
      warnings.push(w);
    }
    if (start !== undefined && end !== undefined) {
      w.occurrences.push({ start, end });
    }
  };

  const knownPlaceholders = new Set<string>(KNOWN_PLACEHOLDERS);
  const knownBlocks = new Set<string>(KNOWN_BLOCKS);

  // 1) Tokeniza qualquer construção {{...}} (válida ou não) na ordem em que
  //    aparece, classificando com a mesma gramática do renderer.
  type Token =
    | { kind: "open" | "close"; name: string; raw: string; start: number; end: number }
    | { kind: "placeholder"; name: string; raw: string; start: number; end: number }
    | { kind: "invalid"; raw: string; start: number; end: number };
  const tokens: Token[] = [];
  const re = /\{\{([^{}]*)\}\}/g;
  let m: RegExpExecArray | null;
  // Cópia com os tokens apagados, para achar delimitadores soltos depois.
  let residue = template;
  while ((m = re.exec(template)) !== null) {
    const raw = m[0];
    const inner = m[1];
    const start = m.index;
    const end = m.index + raw.length;
    residue =
      residue.slice(0, start) + " ".repeat(raw.length) + residue.slice(end);
    if (/^#[a-z0-9_]+$/.test(inner)) {
      tokens.push({ kind: "open", name: inner.slice(1), raw, start, end });
    } else if (/^\/[a-z0-9_]+$/.test(inner)) {
      tokens.push({ kind: "close", name: inner.slice(1), raw, start, end });
    } else if (/^[a-z0-9_]+$/.test(inner)) {
      tokens.push({ kind: "placeholder", name: inner, raw, start, end });
    } else {
      tokens.push({ kind: "invalid", raw, start, end });
    }
  }

  // 2) Delimitadores incompletos/soltos fora de qualquer token completo
  //    (ex.: "{{nome_aluno" sem "}}", ou "}}" sozinho) ficam literais no prompt.
  const strayOpen = residue.match(/\{\{[^\n{}]*/);
  if (strayOpen && strayOpen.index !== undefined) {
    add(
      strayOpen[0].trim(),
      "Abertura {{ sem fechamento }} — o trecho ficará como texto literal no prompt.",
      strayOpen.index,
      strayOpen.index + strayOpen[0].length,
    );
  }
  const residueSansOpen = residue.replace(/\{\{[^\n{}]*/g, (s) =>
    " ".repeat(s.length),
  );
  const strayClose = residueSansOpen.match(/\}\}/);
  if (strayClose && strayClose.index !== undefined) {
    add(
      "}}",
      "Fechamento }} sem abertura {{ — o trecho ficará como texto literal no prompt.",
      strayClose.index,
      strayClose.index + 2,
    );
  }

  // 3) Valida nomes e o pareamento/ordem dos blocos.
  //    O renderer não suporta aninhamento, então bloco dentro de bloco também
  //    gera aviso.
  const stack: Array<{ name: string; start: number; end: number }> = [];
  for (const t of tokens) {
    if (t.kind === "placeholder") {
      if (!knownPlaceholders.has(t.name)) {
        add(
          t.raw,
          "Placeholder desconhecido — será substituído por texto vazio na geração.",
          t.start,
          t.end,
        );
      }
    } else if (t.kind === "invalid") {
      add(
        t.raw,
        "Sintaxe inválida — use letras minúsculas, números e _ sem espaços (ex.: {{nome_aluno}}); do contrário o trecho fica como texto literal no prompt.",
        t.start,
        t.end,
      );
    } else if (t.kind === "open") {
      if (!knownBlocks.has(t.name)) {
        add(
          t.raw,
          `Bloco desconhecido — "${t.name}" não está na lista de blocos disponíveis.`,
          t.start,
          t.end,
        );
      }
      if (stack.length > 0) {
        add(
          t.raw,
          `Bloco aninhado dentro de {{#${stack[stack.length - 1].name}}} — o motor não suporta blocos dentro de blocos e o resultado será incorreto.`,
          t.start,
          t.end,
        );
      }
      stack.push({ name: t.name, start: t.start, end: t.end });
    } else {
      // close
      if (!knownBlocks.has(t.name)) {
        add(
          t.raw,
          `Fechamento de bloco desconhecido — "${t.name}" não é um bloco disponível.`,
          t.start,
          t.end,
        );
      }
      const idx = stack.map((s) => s.name).lastIndexOf(t.name);
      if (idx === -1) {
        add(
          t.raw,
          `Fechamento sem abertura — falta {{#${t.name}}}; a tag ficará como texto literal no prompt.`,
          t.start,
          t.end,
        );
      } else {
        // Blocos cruzados: tudo acima do par correspondente ficou fora de ordem.
        for (let i = stack.length - 1; i > idx; i--) {
          add(
            `{{#${stack[i].name}}}`,
            `Blocos cruzados — {{#${stack[i].name}}} foi aberto dentro de {{#${t.name}}} mas não foi fechado antes de {{/${t.name}}}; o resultado será incorreto.`,
            stack[i].start,
            stack[i].end,
          );
        }
        stack.length = idx;
      }
    }
  }
  for (const s of stack) {
    add(
      `{{#${s.name}}}`,
      `Bloco aberto sem fechamento — falta {{/${s.name}}}; a tag ficará como texto literal no prompt.`,
      s.start,
      s.end,
    );
  }

  return warnings;
}

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
