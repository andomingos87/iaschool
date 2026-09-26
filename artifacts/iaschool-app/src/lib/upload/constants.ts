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
/**
 * Lado maior da foto de REFERÊNCIA do aluno (spec §7.4). Menor que a do
 * evento de propósito: é um retrato, e ampliar retrato põe o rosto acima da
 * maior âncora do SCRFD — o spike perdeu 14 de 15 retratos a 1024. O bucket
 * `student-refs` também aceita no máximo 10 MB por arquivo.
 */
export const REFERENCE_MAX_SIDE_PX = 1_280;
/** Qualidade JPEG da foto de referência: mais alta que a do evento, é uma só. */
export const REFERENCE_JPEG_QUALITY = 0.92;

/** Workers de hash em paralelo (o gargalo é o disco, não a CPU). */
export const HASH_WORKERS = 2;

/**
 * Tipos aceitos. Tudo vira JPEG no cliente antes de subir: HEIC/HEIF passa
 * pelo libheif (o Chrome não decodifica HEIC), o resto o navegador lê sozinho.
 * TIFF e RAW ficam de fora: o Chrome não decodifica e não há conversor aqui.
 */
export const ACCEPTED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/pjpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
  "image/bmp",
  "image/x-ms-bmp",
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);
/** Extensões aceitas, para quando o navegador não informa o MIME (HEIC no Windows). */
export const ACCEPTED_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".jfif",
  ".png",
  ".webp",
  ".avif",
  ".gif",
  ".bmp",
  ".heic",
  ".heif",
]);
export const HEIC_EXTENSIONS = new Set([".heic", ".heif"]);

/** Valor do `accept` dos seletores de arquivo: MIME e extensão, porque no Windows o HEIC não tem MIME. */
export const ACCEPT_ATTRIBUTE = [...ACCEPTED_MIME, ...ACCEPTED_EXTENSIONS].join(",");
/** Formatos aceitos, para as mensagens da tela. */
export const ACCEPTED_FORMATS_LABEL = "JPEG, PNG, HEIC, WebP, AVIF, GIF ou BMP";

/** MIME pela extensão, para arquivo que chega sem tipo. */
const MIME_BY_EXTENSION: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".jfif": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".svg": "image/svg+xml",
};

/** Extensão em minúsculas, com o ponto, ou "" se não houver. */
export function fileExtension(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

/** MIME inferido da extensão, ou "" se a extensão não for de imagem conhecida. */
export function mimeFromName(name: string): string {
  return MIME_BY_EXTENSION[fileExtension(name)] ?? "";
}

/** MIME vazio ou genérico: o navegador não sabe o que é, então vale a extensão. */
function hasNoUsefulMime(type: string): boolean {
  return !type || type === "application/octet-stream";
}

/** Arquivo aceito pelo lote: pelo MIME ou, na falta dele, pela extensão. */
export function isAcceptedImage(file: { name: string; type: string }): boolean {
  const type = file.type.toLowerCase();
  if (ACCEPTED_MIME.has(type)) return true;
  return hasNoUsefulMime(type) && ACCEPTED_EXTENSIONS.has(fileExtension(file.name));
}

/**
 * Filtro do upload avulso (foto do aluno, logo, referência): além dos
 * formatos do lote, tenta qualquer `image/*` (SVG, TIFF no Safari). Se o
 * navegador não conseguir ler, o preparo falha com mensagem clara.
 */
export function isImageLike(file: { name: string; type: string }): boolean {
  return isAcceptedImage(file) || file.type.toLowerCase().startsWith("image/");
}

export function isHeicLike(file: { name: string; type: string }): boolean {
  const t = file.type.toLowerCase();
  return t.includes("heic") || t.includes("heif") || HEIC_EXTENSIONS.has(fileExtension(file.name));
}
