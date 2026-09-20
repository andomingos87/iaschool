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

/** Aplica a máscara "00.000.000/0000-00" a partir de dígitos crus. */
export function maskCnpj(value: string): string {
  const d = onlyDigits(value).slice(0, 14);
  let out = d.slice(0, 2);
  if (d.length > 2) out += `.${d.slice(2, 5)}`;
  if (d.length > 5) out += `.${d.slice(5, 8)}`;
  if (d.length > 8) out += `/${d.slice(8, 12)}`;
  if (d.length > 12) out += `-${d.slice(12, 14)}`;
  return out;
}

/**
 * Valida o CNPJ pelos dois dígitos verificadores. Vazio é válido: o CNPJ é
 * opcional no cadastro da escola, mas quando informado tem que ser real.
 */
export function isValidCnpj(masked: string): boolean {
  const d = onlyDigits(masked);
  if (d.length === 0) return true;
  if (d.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(d)) return false;
  const digit = (slice: string): number => {
    let weight = slice.length - 7;
    let sum = 0;
    for (let i = 0; i < slice.length; i++) {
      sum += Number(slice[i]) * weight--;
      if (weight < 2) weight = 9;
    }
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };
  return (
    digit(d.slice(0, 12)) === Number(d[12]) &&
    digit(d.slice(0, 13)) === Number(d[13])
  );
}

/** Aplica a máscara "00000-000" ao CEP. */
export function maskZip(value: string): string {
  const d = onlyDigits(value).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}
