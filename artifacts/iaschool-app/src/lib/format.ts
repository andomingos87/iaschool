// Utilitários de formatação pt-BR (máscaras, WhatsApp, datas).

/** Aplica a máscara "(11) 99999-9999" a partir de dígitos crus. */
export function maskWhatsapp(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  const ddd = digits.slice(0, 2);
  const part1 = digits.slice(2, 7);
  const part2 = digits.slice(7, 11);
  let out = "";
  if (ddd) out += `(${ddd}`;
  if (digits.length >= 2) out += ") ";
  out += part1;
  if (part2) out += `-${part2}`;
  return out.trimEnd();
}

/** Extrai somente os dígitos. */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Converte a máscara para o formato de armazenamento com DDI 55.
 * Ex: "(11) 99999-8888" -> "5511999998888"
 */
export function whatsappToStored(masked: string): string {
  const digits = onlyDigits(masked);
  return digits.startsWith("55") ? digits : `55${digits}`;
}

/** Converte o valor armazenado (com DDI 55) de volta para a máscara. */
export function storedToMasked(stored: string): string {
  let digits = onlyDigits(stored);
  if (digits.startsWith("55") && digits.length > 11) {
    digits = digits.slice(2);
  }
  return maskWhatsapp(digits);
}

/** Valida um número de WhatsApp brasileiro (DDD + 9 dígitos). */
export function isValidWhatsapp(masked: string): boolean {
  const digits = onlyDigits(masked);
  return digits.length === 11;
}

/** Máscara de data "dd/mm/aaaa" a partir de dígitos. */
export function maskDate(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  const d = digits.slice(0, 2);
  const m = digits.slice(2, 4);
  const y = digits.slice(4, 8);
  let out = d;
  if (m) out += `/${m}`;
  if (y) out += `/${y}`;
  return out;
}

/** Converte "dd/mm/aaaa" para ISO "aaaa-mm-dd" (ou "" se inválido). */
export function brDateToIso(br: string): string {
  const digits = br.replace(/\D/g, "");
  if (digits.length !== 8) return "";
  const d = digits.slice(0, 2);
  const m = digits.slice(2, 4);
  const y = digits.slice(4, 8);
  return `${y}-${m}-${d}`;
}

/** Converte ISO "aaaa-mm-dd" para "dd/mm/aaaa". */
export function isoToBrDate(iso?: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("T")[0].split("-");
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
}

/** Data e hora amigável pt-BR. */
export function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** Idade a partir de data ISO. */
export function ageFromIso(iso?: string): number | null {
  if (!iso) return null;
  const birth = new Date(iso);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const mm = now.getMonth() - birth.getMonth();
  if (mm < 0 || (mm === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

/** Iniciais para avatares. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
