// Regra fixa de preservação da pessoa na geração de arte (S02, ART-05/ART-06).
//
// O prompt chega montado pelo cliente (template salvo + texto livre + atalhos),
// mas a proteção da identidade não pode depender da tela: uma chamada direta ao
// endpoint com um prompt conflitante precisa continuar preservando a pessoa da
// foto original. Por isso o servidor prepende esta regra quando ela não está no
// prompt recebido.
//
// O texto precisa ser IDÊNTICO ao de
// `artifacts/iaschool-app/src/lib/prompt-template.ts` (PROTECTION_RULE); a
// checagem de presença é feita por inclusão da string inteira.

export const PROTECTION_RULE = [
  "Regra fixa (acima de template, atalho ou texto livre):",
  "a pessoa da arte é exatamente a da FOTO DO ALUNO enviada.",
  "Preserve rosto, expressão, identidade, proporções, pose, cabelo, roupa e",
  "acessórios nos pixels da foto original; não redesenhe, não retoque, não",
  "embeleze, não envelheça nem rejuvenesça, e não invente partes ausentes.",
  "Nunca troque roupa, expressão ou corpo, e não use a pessoa do modelo de arte.",
].join(" ");

/**
 * Devolve o prompt sempre com a regra fixa, sem duplicá-la quando o cliente já
 * a enviou (o app a inclui para a prévia refletir o que será enviado).
 */
export function ensureProtectionRule(prompt: string): string {
  if (prompt.includes(PROTECTION_RULE)) return prompt;
  return `${PROTECTION_RULE} ${prompt}`.trim();
}

/** Reject instructions to edit the person; fixed rule itself is excluded. */
export function personEditConflict(prompt: string): boolean {
  const editable = prompt.replaceAll(PROTECTION_RULE, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return /(?:troqu\w*|mude\w*|alter\w*|redesenh\w*|retoqu\w*|embelez\w*|envelhe\w*|rejuven\w*)[^.!?]{0,80}(?:roupa|expressao|corpo|aluno|pessoa|rosto|cabelo)/i.test(editable);
}

/** Instrução do fluxo simples; a IA edita a foto sem garantia de pixels idênticos. */
export function photoPromptInstructions(prompt: string): string {
  return [
    "Crie uma arte escolar usando a foto de referência enviada.",
    "Preserve a identidade e os traços reconhecíveis da pessoa, sua idade e aparência.",
    "Não invente outras pessoas. Siga as instruções da escola abaixo:",
    prompt.trim(),
  ].join(" ");
}
