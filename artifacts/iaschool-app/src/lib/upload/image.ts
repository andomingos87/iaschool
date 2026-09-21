// Preparo da foto no cliente: HEIC → JPEG e redimensionamento para 2560px
// de lado maior, JPEG q85 (D3). O original não é guardado por padrão.

import imageCompression from "browser-image-compression";
import {
  REFERENCE_JPEG_QUALITY,
  REFERENCE_MAX_SIDE_PX,
  UPLOAD_JPEG_QUALITY,
  UPLOAD_MAX_SIDE_PX,
  isHeicLike,
} from "./constants";

export interface PreparedPhoto {
  /** JPEG pronto para o bucket `event-photos`. */
  blob: Blob;
  width?: number;
  height?: number;
}

export type PreparePhoto = (file: File) => Promise<PreparedPhoto>;

/**
 * Converte HEIC/HEIF para JPEG. A biblioteca (libheif em wasm, ~1 MB gzip)
 * só é baixada quando aparece o primeiro HEIC no lote.
 */
export async function convertHeicToJpeg(file: File): Promise<File> {
  const { heicTo } = await import("heic-to");
  const blob = await heicTo({ blob: file, type: "image/jpeg", quality: 0.95 });
  const name = file.name.replace(/\.(heic|heif)$/i, "") + ".jpg";
  return new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified });
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
  const source = isHeicLike(file) ? await convertHeicToJpeg(file) : file;
  const blob = await imageCompression(source, {
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
  const source = isHeicLike(file) ? await convertHeicToJpeg(file) : file;
  const blob = await imageCompression(source, {
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
