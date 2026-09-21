// O trabalho de um job de ingest (spec §7.2, D4): baixa o JPEG 2560px,
// lê dimensões (já orientadas), tenta o EXIF como reserva de `taken_at`
// (o cliente manda a data no insert; o JPEG normalmente sobe sem EXIF),
// gera a miniatura WebP 320px e sobe em `event-thumbs`.

import sharp from "sharp";
import type { StorageApi } from "./storage";
import { EVENT_PHOTOS_BUCKET, EVENT_THUMBS_BUCKET } from "./storage";
import type { PhotoRow } from "./types";

export interface ProcessOptions {
  thumbSize: number;
  thumbQuality: number;
  signal?: AbortSignal;
}

export interface ProcessOutcome {
  width: number;
  height: number;
  thumbPath: string;
  takenAt?: string;
  durationMs: number;
}

/** Fotos maiores que isto (50 MP) são recusadas pelo sharp em vez de estourar a memória. */
const MAX_INPUT_PIXELS = 50_000_000;

/** EXIF orientation 5–8 são as rotações de 90°: largura e altura trocam. */
export function orientedDimensions(meta: { width?: number; height?: number; orientation?: number }): {
  width: number;
  height: number;
} {
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  return (meta.orientation ?? 1) >= 5 ? { width: h, height: w } : { width: w, height: h };
}

const EXIF_DATE = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/;

/**
 * `DateTimeOriginal` do bloco EXIF que o sharp devolve em `metadata().exif`
 * (TIFF cru). Sem fuso na tag, a hora é tratada como UTC: o worker não sabe
 * onde a foto foi tirada, e isto é só reserva para quando o cliente não
 * mandou nada. Nunca lança.
 */
export function readExifTakenAt(exif: Buffer | undefined): string | undefined {
  if (!exif || exif.length < 8) return undefined;
  try {
    const parsed = exifReader(exif) as {
      Photo?: { DateTimeOriginal?: unknown; OffsetTimeOriginal?: unknown };
      exif?: { DateTimeOriginal?: unknown; OffsetTimeOriginal?: unknown };
    };
    const block = parsed.Photo ?? parsed.exif;
    const raw = block?.DateTimeOriginal;
    const offset = block?.OffsetTimeOriginal;
    if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? undefined : raw.toISOString();
    if (typeof raw !== "string") return undefined;
    const m = EXIF_DATE.exec(raw);
    if (!m) return undefined;
    const [, y, mo, d, h, mi, s] = m;
    const off = typeof offset === "string" && /^[+-]\d{2}:\d{2}$/.test(offset) ? offset : "Z";
    const date = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}${off}`);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  } catch {
    return undefined;
  }
}

// exif-reader é CommonJS sem tipos: import dinâmico preguiçoso via require.
let exifReaderFn: ((buf: Buffer) => unknown) | null = null;
function exifReader(buf: Buffer): unknown {
  if (!exifReaderFn) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("exif-reader") as ((b: Buffer) => unknown) | { default: (b: Buffer) => unknown };
    exifReaderFn = typeof mod === "function" ? mod : mod.default;
  }
  return exifReaderFn(buf);
}

export function thumbPathFor(photo: Pick<PhotoRow, "school_id" | "event_id" | "id">): string {
  return `${photo.school_id}/${photo.event_id}/${photo.id}.webp`;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error("job cancelado por timeout");
}

export async function processPhoto(
  storage: StorageApi,
  photo: PhotoRow,
  opts: ProcessOptions,
): Promise<ProcessOutcome> {
  const started = performance.now();
  throwIfAborted(opts.signal);
  const input = await storage.download(EVENT_PHOTOS_BUCKET, photo.storage_path);
  throwIfAborted(opts.signal);

  const image = sharp(input, { failOn: "none", limitInputPixels: MAX_INPUT_PIXELS });
  const meta = await image.metadata();
  if (!meta.width || !meta.height) throw new Error("imagem sem dimensões legíveis");
  const { width, height } = orientedDimensions(meta);
  const takenAt = photo.taken_at ? undefined : readExifTakenAt(meta.exif);

  const thumb = await image
    .rotate()
    .resize({ width: opts.thumbSize, height: opts.thumbSize, fit: "inside", withoutEnlargement: true })
    .webp({ quality: opts.thumbQuality })
    .toBuffer();
  throwIfAborted(opts.signal);

  const thumbPath = thumbPathFor(photo);
  await storage.upload(EVENT_THUMBS_BUCKET, thumbPath, thumb, "image/webp");

  return { width, height, thumbPath, takenAt, durationMs: Math.round(performance.now() - started) };
}
