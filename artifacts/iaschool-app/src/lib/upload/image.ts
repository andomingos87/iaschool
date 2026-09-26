// Preparo da foto no cliente: HEIC → JPEG e redimensionamento para 2560px
// de lado maior, JPEG q85 (D3). O original não é guardado por padrão.

import imageCompression from "browser-image-compression";
import {
  ACCEPTED_FORMATS_LABEL,
  REFERENCE_JPEG_QUALITY,
  REFERENCE_MAX_SIDE_PX,
  UPLOAD_JPEG_QUALITY,
  UPLOAD_MAX_SIDE_PX,
  isHeicLike,
  mimeFromName,
} from "./constants";

export interface PreparedPhoto {
  /** JPEG pronto para o bucket `event-photos`. */
  blob: Blob;
  width?: number;
  height?: number;
}

export type PreparePhoto = (file: File) => Promise<PreparedPhoto>;

/**
 * O navegador não conseguiu ler o arquivo como imagem: formato sem suporte
 * (TIFF e RAW no Chrome) ou arquivo corrompido. A mensagem vai para a tela
 * ao lado do nome do arquivo, então não repete o nome.
 */
export class UnreadableImageError extends Error {
  constructor(message = `Não foi possível ler a imagem. Formatos aceitos: ${ACCEPTED_FORMATS_LABEL}.`) {
    super(message);
    this.name = "UnreadableImageError";
  }
}

/** Marcas do box `ftyp` que só aparecem em HEIC/HEIF com HEVC. */
const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs"]);
/** Marcas genéricas do HEIF: servem tanto a HEIC quanto a AVIF. */
const HEIF_GENERIC_BRANDS = new Set(["mif1", "msf1"]);

/**
 * HEIC pelo conteúdo, para o arquivo que chega com nome ou MIME errado
 * (`.jpg` que na verdade é HEIC, comum em foto repassada por app de nuvem).
 * Lê só o box `ftyp` do começo do arquivo.
 */
export async function sniffHeic(file: Blob): Promise<boolean> {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  } catch {
    return false;
  }
  if (bytes.length < 16) return false;
  const ascii = (at: number) => String.fromCharCode(bytes[at]!, bytes[at + 1]!, bytes[at + 2]!, bytes[at + 3]!);
  if (ascii(4) !== "ftyp") return false;
  const major = ascii(8);
  if (HEIC_BRANDS.has(major)) return true;
  if (!HEIF_GENERIC_BRANDS.has(major)) return false;
  // Marca genérica: é HEIC se alguma compatível for HEVC e nenhuma for AVIF.
  const boxSize = Math.min((bytes[0]! << 24) | (bytes[1]! << 16) | (bytes[2]! << 8) | bytes[3]!, bytes.length);
  const compatible: string[] = [];
  for (let at = 16; at + 4 <= boxSize; at += 4) compatible.push(ascii(at));
  return compatible.some((b) => HEIC_BRANDS.has(b)) && !compatible.some((b) => b === "avif" || b === "avis");
}

/**
 * Converte HEIC/HEIF para JPEG. A biblioteca (libheif em wasm, ~1 MB gzip)
 * só é baixada quando aparece o primeiro HEIC no lote.
 */
export async function convertHeicToJpeg(file: File): Promise<File> {
  const { heicTo } = await import("heic-to");
  const blob = await heicTo({ blob: file, type: "image/jpeg", quality: 0.95 });
  // Troca qualquer extensão: o HEIC pode ter chegado com nome de `.jpg`.
  const name = file.name.replace(/\.[^./]+$/, "") + ".jpg";
  return new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified });
}

/**
 * Deixa o arquivo num formato que o canvas do navegador lê: HEIC (detectado
 * por MIME, extensão ou conteúdo) vira JPEG; arquivo sem MIME ganha o da
 * extensão, porque a compressão recusa o que não se declara `image/*`.
 */
async function toDecodable(file: File): Promise<File> {
  if (isHeicLike(file) || (await sniffHeic(file))) {
    try {
      return await convertHeicToJpeg(file);
    } catch {
      throw new UnreadableImageError(
        "Não foi possível converter a foto HEIC. O arquivo pode estar corrompido; exporte como JPEG e envie de novo.",
      );
    }
  }
  const type = file.type && file.type !== "application/octet-stream" ? file.type : mimeFromName(file.name);
  if (!type) throw new UnreadableImageError();
  if (type === file.type) return file;
  return new File([file], file.name, { type, lastModified: file.lastModified });
}

/** Redimensiona e reencoda; qualquer falha de leitura vira `UnreadableImageError`. */
async function compress(file: File, options: Parameters<typeof imageCompression>[1]): Promise<File> {
  try {
    return await imageCompression(file, options);
  } catch {
    // A biblioteca rejeita com o `Event` do <img> quando não decodifica.
    throw new UnreadableImageError();
  }
}

/** Dimensões de um blob de imagem, sem decodificar duas vezes quando possível. */
async function readDimensions(blob: Blob): Promise<{ width?: number; height?: number }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(blob);
      const dims = { width: bmp.width, height: bmp.height };
      bmp.close();
      return dims;
    } catch {
      // cai no <img> abaixo
    }
  }
  if (typeof Image === "undefined") return {};
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({});
    };
    img.src = url;
  });
}

/**
 * Redimensiona para 2560px de lado maior e reencoda em JPEG q85. Fotos
 * menores que isso só trocam de formato (PNG → JPEG) sem ganhar pixels.
 */
export const prepareForUpload: PreparePhoto = async (file) => {
  const source = await toDecodable(file);
  const blob = await compress(source, {
    maxWidthOrHeight: UPLOAD_MAX_SIDE_PX,
    initialQuality: UPLOAD_JPEG_QUALITY,
    fileType: "image/jpeg",
    // Sem alvo de tamanho: uma passada só, na qualidade fixa da D3.
    maxSizeMB: Number.POSITIVE_INFINITY,
    useWebWorker: true,
    preserveExif: false,
  });
  const dims = await readDimensions(blob);
  return { blob, ...dims };
};

/**
 * Prepara a foto de REFERÊNCIA do aluno (spec §7.4): HEIC → JPEG e 1280px de
 * lado maior. O bucket `student-refs` só aceita `image/jpeg`, então PNG
 * também passa por aqui.
 */
export const prepareReferencePhoto: PreparePhoto = async (file) => {
  const source = await toDecodable(file);
  const blob = await compress(source, {
    maxWidthOrHeight: REFERENCE_MAX_SIDE_PX,
    initialQuality: REFERENCE_JPEG_QUALITY,
    fileType: "image/jpeg",
    maxSizeMB: Number.POSITIVE_INFINITY,
    useWebWorker: true,
    // Sem EXIF: nada de GPS nem modelo de câmera num retrato de aluno.
    preserveExif: false,
  });
  const dims = await readDimensions(blob);
  return { blob, ...dims };
};

/** Formatos que a API de geração aceita e que o upload avulso guarda como vieram. */
const KEEP_TYPE = new Set(["image/jpeg", "image/png", "image/webp"]);
/** Costumam ter transparência (logo): viram PNG para não ganhar fundo branco. */
const TO_PNG = new Set(["image/gif", "image/svg+xml"]);

/**
 * Upload avulso (foto do aluno, logo da escola, referência de arte): até
 * 1600px e 0,8 MB. Sai sempre em JPEG, PNG ou WebP, os únicos que a API de
 * geração aceita; o resto (HEIC, AVIF, BMP, TIFF no Safari) vira JPEG.
 */
export async function prepareAssetImage(file: File): Promise<File> {
  const source = await toDecodable(file);
  const type = source.type.toLowerCase();
  const fileType = KEEP_TYPE.has(type) ? type : TO_PNG.has(type) ? "image/png" : "image/jpeg";
  const blob = await compress(source, {
    maxWidthOrHeight: 1600,
    maxSizeMB: 0.8,
    fileType,
    useWebWorker: true,
  });
  const ext = fileType === "image/jpeg" ? ".jpg" : `.${fileType.slice("image/".length)}`;
  const name = source.name.replace(/\.[^./]+$/, "") + ext;
  return new File([blob], name, { type: fileType, lastModified: file.lastModified });
}
