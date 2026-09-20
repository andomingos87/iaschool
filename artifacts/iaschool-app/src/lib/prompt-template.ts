// Motor de template do prompt de geração.
// O template usa placeholders {{nome}} e blocos condicionais
// {{#bloco}}...{{/bloco}} que só entram no prompt final quando o dado existe,
// e blocos invertidos {{^bloco}}...{{/bloco}} que entram quando o dado ESTÁ
// ausente/vazio. O template padrão abaixo é o prompt base do IAschool para
// artes de eventos escolares.

import type { GenerationRequest } from "./data/types";

export const DEFAULT_PROMPT_TEMPLATE = [
  "Crie uma arte de post para redes sociais de uma escola (1080x1080), seguindo fielmente o estilo, composição, tipografia e clima da PRIMEIRA imagem enviada (a referência).",
  "Use a foto do aluno enviada como imagem principal da arte. Nome do aluno: {{nome_aluno}}.",
  "{{#logo_escola}}Inclua o logo da escola {{nome_escola}} (imagem enviada) em posição de destaque discreto.{{/logo_escola}}",
  "{{#cores_escola}}Use as cores da identidade visual da escola na composição: {{cores_escola}}.{{/cores_escola}}",
  "{{#prompt_auxiliar}}Instruções adicionais desta geração: {{prompt_auxiliar}}{{/prompt_auxiliar}}",
  "Ambiente escolar, tom acolhedor e adequado a crianças e adolescentes.",
  "Texto em português do Brasil, sem erros de ortografia. Resultado profissional, pronto para publicação.",
].join("\n");

/** Legenda dos placeholders exibida na tela de admin. */
export const PLACEHOLDER_DOCS: Array<{ token: string; description: string }> = [
  { token: "{{nome_aluno}}", description: "Nome do aluno (em maiúsculas)" },
  { token: "{{nome_escola}}", description: "Nome da escola do aluno" },
  { token: "{{cores_escola}}", description: "Cores da identidade visual da escola" },
  { token: "{{prompt_auxiliar}}", description: "Instruções extras digitadas na geração" },
  { token: "{{#logo_escola}}...{{/logo_escola}}", description: "Bloco: só entra se o logo da escola for exibido" },
  { token: "{{#cores_escola}}...{{/cores_escola}}", description: "Bloco: só entra se a escola tiver cores cadastradas" },
  { token: "{{^cores_escola}}...{{/cores_escola}}", description: "Bloco invertido: só entra se a escola NÃO tiver cores" },
  { token: "{{#prompt_auxiliar}}...{{/prompt_auxiliar}}", description: "Bloco: só entra se houver instruções extras" },
  { token: "{{^nome}}...{{/nome}}", description: "Bloco invertido: só entra quando a condição do bloco NÃO está ativa" },
];

/** Placeholders simples reconhecidos pelo motor. */
export const KNOWN_PLACEHOLDERS = [
  "nome_aluno",
  "nome_escola",
  "cores_escola",
  "prompt_auxiliar",
] as const;

/** Blocos condicionais reconhecidos pelo motor (normais e invertidos). */
export const KNOWN_BLOCKS = [
  "logo_escola",
  "cores_escola",
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
 * Blocos invertidos {{^nome}}...{{/nome}} são aceitos para nomes conhecidos.
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
  //    "open_inv" representa blocos invertidos {{^nome}}.
  type Token =
    | { kind: "open" | "open_inv" | "close"; name: string; raw: string; start: number; end: number }
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
    } else if (/^\^[a-z0-9_]+$/.test(inner)) {
      tokens.push({ kind: "open_inv", name: inner.slice(1), raw, start, end });
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
  //    gera aviso. Blocos normais (open) e invertidos (open_inv) usam o mesmo
  //    fechamento {{/nome}} e compartilham a pilha.
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
    } else if (t.kind === "open" || t.kind === "open_inv") {
      if (!knownBlocks.has(t.name)) {
        const kindLabel = t.kind === "open_inv" ? "invertido" : "";
        add(
          t.raw,
          `Bloco ${kindLabel ? kindLabel + " " : ""}desconhecido — "${t.name}" não está na lista de blocos disponíveis.`,
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
          `Fechamento sem abertura — falta {{#${t.name}}} ou {{^${t.name}}}; a tag ficará como texto literal no prompt.`,
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
  const showLogo = request.showSchoolLogo && !!request.schoolBrand;
  // cores_escola é desacoplado do logo: disponível sempre que a escola tiver
  // cores cadastradas, independentemente da opção de exibir o logo.
  const brandColors = (request.schoolBrand?.colors ?? []).join(", ");
  const auxiliar = request.auxiliaryPrompt?.trim() ?? "";
  return {
    values: {
      nome_aluno: request.student.name.toUpperCase(),
      nome_escola: request.schoolBrand?.name ?? "",
      cores_escola: brandColors,
      prompt_auxiliar: auxiliar,
    },
    flags: {
      logo_escola: showLogo,
      // Ativo quando há escola com pelo menos uma cor cadastrada.
      cores_escola: !!request.schoolBrand && brandColors.length > 0,
      prompt_auxiliar: auxiliar.length > 0,
    },
  };
}

/** Contexto de exemplo usado na prévia da tela de admin. */
export const SAMPLE_CONTEXT: PromptContext = {
  values: {
    nome_aluno: "JOÃO DA SILVA",
    nome_escola: "Escola Horizonte",
    cores_escola: "#2563eb, #2e2e2e",
    prompt_auxiliar: "Tema do evento: Festa Junina, com bandeirinhas coloridas ao fundo.",
  },
  flags: {
    logo_escola: true,
    cores_escola: true,
    prompt_auxiliar: true,
  },
};

/**
 * Renderiza o template: resolve blocos condicionais {{#x}}...{{/x}},
 * blocos invertidos {{^x}}...{{/x}}, substitui placeholders {{x}} e
 * normaliza espaços em branco.
 */
export function renderPromptTemplate(
  template: string,
  ctx: PromptContext,
): string {
  let out = template;
  // Blocos invertidos: rendem o corpo quando a flag está ausente/falsa.
  out = out.replace(
    /\{\{\^([a-z0-9_]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_all, name: string, body: string) => (!ctx.flags[name] ? body : ""),
  );
  // Blocos condicionais normais (sem aninhamento — suficiente para o caso de uso).
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
