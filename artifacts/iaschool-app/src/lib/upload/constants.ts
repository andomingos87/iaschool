// Regras do upload em massa no cliente (spec §7.1 e D3).

/** Uploads simultâneos. */
export const UPLOAD_CONCURRENCY = 6;
/** Retentativas depois da primeira falha; a espera cresce a cada uma. */
export const UPLOAD_MAX_RETRIES = 3;
/** Backoff exponencial entre tentativas, em ms. */
export const UPLOAD_BACKOFF_MS = [1_000, 4_000, 16_000] as const;
/** Acima disso o cliente pede para dividir a pasta. */
export const MAX_FILES_PER_BATCH = 5_000;
/** Lado maior da foto enviada (D3): mantém rosto ≥ 80px em foto de turma. */
export const UPLOAD_MAX_SIDE_PX = 2_560;
/** Qualidade JPEG da foto enviada (D3). */
export const UPLOAD_JPEG_QUALITY = 0.85;
/** Workers de hash em paralelo (o gargalo é o disco, não a CPU). */
export const HASH_WORKERS = 2;

/** Tipos aceitos. HEIC/HEIF é convertido para JPEG no cliente. */
export const ACCEPTED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);
/** Extensões aceitas, para quando o navegador não informa o MIME (HEIC no Windows). */
export const ACCEPTED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".heic", ".heif"]);
export const HEIC_EXTENSIONS = new Set([".heic", ".heif"]);

/** Extensão em minúsculas, com o ponto, ou "" se não houver. */
export function fileExtension(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

/** Arquivo aceito pelo lote: pelo MIME ou, na falta dele, pela extensão. */
export function isAcceptedImage(file: { name: string; type: string }): boolean {
  if (file.type && ACCEPTED_MIME.has(file.type.toLowerCase())) return true;
  if (file.type && file.type.startsWith("image/") && !file.type.includes("heic") && !file.type.includes("heif")) {
    // Outros formatos de imagem (webp, gif, bmp) ficam de fora de propósito:
    // o pipeline é para foto de câmera.
    return false;
  }
  return !file.type && ACCEPTED_EXTENSIONS.has(fileExtension(file.name));
}

export function isHeicLike(file: { name: string; type: string }): boolean {
  const t = file.type.toLowerCase();
  return t.includes("heic") || t.includes("heif") || HEIC_EXTENSIONS.has(fileExtension(file.name));
}
