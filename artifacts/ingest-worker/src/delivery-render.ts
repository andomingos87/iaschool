// Derivado protegido por destinatário (spec §6.4 e §15.3).
//
// Regra do desfoque, aplicada nos PIXELS do arquivo:
//   - fica nítido o que o destinatário pode ver: o aluno filho dele
//     (`confirmed`) e adulto/equipe (`adult_or_staff`), ambos confirmados por
//     pessoa na revisão;
//   - todo o resto (outras crianças, `suggested`, `unassigned`,
//     `not_a_student`) fica desfocado, mesmo que tenha autorização própria —
//     `delivery_whatsapp` não expõe uma criança a outras famílias.
//
// O derivado sai sem EXIF (o `.rotate()` normaliza a orientação e o sharp não
// copia metadados por padrão) e o hash SHA-256 do JPEG é estável para o mesmo
// insumo, o que permite reprocessar sem deixar lixo.

import { createHash } from "node:crypto";
import sharp from "sharp";

export interface RenderBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RenderOptions {
  /** Sigma do desfoque gaussiano do sharp (spec: "desfocado na prévia"). */
  blurSigma: number;
  jpegQuality: number;
  thumbSize: number;
  thumbQuality: number;
}

export interface RenderOutcome {
  asset: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
  assetHash: string;
}

/** Fotos maiores que isto (50 MP) são recusadas pelo sharp em vez de estourar a memória. */
const MAX_INPUT_PIXELS = 50_000_000;

/** Margem em volta do rosto nítido para a emenda do recorte não cortar o cabelo. */
const BOX_PADDING_RATIO = 0.08;

/** Expande a caixa do rosto e prende dentro da imagem. */
export function clampBox(box: RenderBox, width: number, height: number): RenderBox {
  const padX = Math.round(box.w * BOX_PADDING_RATIO);
  const padY = Math.round(box.h * BOX_PADDING_RATIO);
  const x = Math.max(0, Math.min(width - 1, Math.round(box.x - padX)));
  const y = Math.max(0, Math.min(height - 1, Math.round(box.y - padY)));
  const right = Math.max(0, Math.min(width, Math.round(box.x + box.w + padX)));
  const bottom = Math.max(0, Math.min(height, Math.round(box.y + box.h + padY)));
  return { x, y, w: Math.max(0, right - x), h: Math.max(0, bottom - y) };
}

/** Normaliza as caixas vindas do banco (`{x,y,w,h}` em px da imagem orientada). */
export function parseBoxes(raw: unknown): RenderBox[] {
  if (!Array.isArray(raw)) return [];
  const out: RenderBox[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const box = item as Record<string, unknown>;
    const x = Number(box["x"]);
    const y = Number(box["y"]);
    const w = Number(box["w"]);
    const h = Number(box["h"]);
    if (![x, y, w, h].every(Number.isFinite)) continue;
    if (w < 2 || h < 2) continue;
    out.push({ x, y, w, h });
  }
  return out;
}

/** Recorte nítido composto sobre a base desfocada (estrutural para o sharp). */
interface CompositeOverlay {
  input: Buffer;
  left: number;
  top: number;
}

export async function renderDeliveryAsset(
  input: Buffer,
  sharpBoxes: RenderBox[],
  opts: RenderOptions,
): Promise<RenderOutcome> {
  // Primeiro passo: orienta e re-encoda uma vez (sem metadados). Todo o resto
  // trabalha nesse buffer normalizado, que é a mesma referência dos bboxes.
  const normalized = await sharp(input, {
    failOn: "none",
    limitInputPixels: MAX_INPUT_PIXELS,
  })
    .rotate()
    .jpeg({ quality: 92 })
    .toBuffer({ resolveWithObject: true });
  const width = normalized.info.width;
  const height = normalized.info.height;
  const base = normalized.data;

  if (!width || !height) throw new Error("imagem sem dimensões legíveis");

  const blurred = await sharp(base).blur(opts.blurSigma).toBuffer();

  const composites: CompositeOverlay[] = [];
  for (const raw of sharpBoxes) {
    const box = clampBox(raw, width, height);
    if (box.w < 2 || box.h < 2) continue;
    const region = await sharp(base)
      .extract({ left: box.x, top: box.y, width: box.w, height: box.h })
      .toBuffer();
    composites.push({ input: region, left: box.x, top: box.y });
  }

  const asset = await sharp(blurred)
    .composite(composites)
    .jpeg({ quality: opts.jpegQuality })
    .toBuffer();

  const thumb = await sharp(asset)
    .resize({
      width: opts.thumbSize,
      height: opts.thumbSize,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: opts.thumbQuality })
    .toBuffer();

  const assetHash = createHash("sha256").update(asset).digest("hex");
  return { asset, thumb, width, height, assetHash };
}
