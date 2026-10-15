import sharp from "sharp";
import { PROTECTION_RULE } from "./art-protection";

export const COMPOSITION_VERSION = "original-pixels-v1";
export interface OriginalComposition {
  version: typeof COMPOSITION_VERSION;
  photoId: string;
  points: Array<{ x: number; y: number }>;
  protectedHead: { x: number; y: number; width: number; height: number };
  reviewed: true;
}
const invalid = () => new Error("Confira o contorno e a região completa da cabeça, cabelo, orelhas e pescoço. Ajuste o recorte ou escolha outra foto antes de gerar.");
const unit = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;
export function parseOriginalComposition(value: unknown): OriginalComposition {
  if (!value || typeof value !== "object") throw invalid();
  const c = value as OriginalComposition;
  if (c.version !== COMPOSITION_VERSION || c.reviewed !== true || typeof c.photoId !== "string" || !c.photoId || c.photoId.length > 128 || !Array.isArray(c.points) || c.points.length < 3 || c.points.length > 100) throw invalid();
  if (c.points.some(p => !p || !unit(p.x) || !unit(p.y))) throw invalid();
  const h = c.protectedHead;
  if (!h || !unit(h.x) || !unit(h.y) || !unit(h.width) || !unit(h.height) || h.width <= 0 || h.height <= 0 || h.x + h.width > 1 || h.y + h.height > 1) throw invalid();
  return c;
}
/** Validated before quota/model: no generative operation ever receives original. */
export async function prepareOriginal(original: Buffer, value: unknown): Promise<Buffer> {
  const c = parseOriginalComposition(value);
  const normalized = await sharp(original, { limitInputPixels: 24_000_000 }).rotate().ensureAlpha().png().toBuffer({ resolveWithObject: true });
  const { width, height } = normalized.info;
  const points = c.points.map(p => `${p.x * width},${p.y * height}`).join(" ");
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><polygon points="${points}" fill="white"/></svg>`);
  const mask = await sharp(svg).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const h = c.protectedHead;
  const left = Math.floor(h.x * width), top = Math.floor(h.y * height);
  const right = Math.ceil((h.x + h.width) * width), bottom = Math.ceil((h.y + h.height) * height);
  // Every protected pixel must be fully retained, including concave polygons.
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
    if (mask.data[(y * width + x) * mask.info.channels + 3] !== 255) throw invalid();
  }
  const xs = c.points.map(p => p.x * width), ys = c.points.map(p => p.y * height);
  const cropLeft = Math.floor(Math.min(...xs)), cropTop = Math.floor(Math.min(...ys));
  const cropWidth = Math.min(width, Math.ceil(Math.max(...xs))) - cropLeft;
  const cropHeight = Math.min(height, Math.ceil(Math.max(...ys))) - cropTop;
  if (cropWidth < 8 || cropHeight < 8) throw invalid();
  const cut = await sharp(normalized.data).composite([{ input: svg, blend: "dest-in" }]).png().toBuffer();
  // Extract must follow mask; sharp otherwise extracts input before composite.
  return sharp(cut).extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight }).resize(922, 922, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
}
export async function composeOriginal(background: Buffer, originalCut: Buffer): Promise<Buffer> {
  const meta = await sharp(originalCut).metadata();
  return sharp(background, { limitInputPixels: 24_000_000 }).resize(1024, 1024, { fit: "fill" }).composite([{ input: originalCut, left: Math.floor((1024 - meta.width!) / 2), top: Math.floor((1024 - meta.height!) / 2), blend: "over" }]).png().toBuffer();
}
export function backgroundPrompt(prompt: string): string {
  const elements = prompt.replaceAll(PROTECTION_RULE, "").replace(/Use a foto do aluno enviada como imagem principal da arte\./gi, "Reserve espaço para uma fotografia original no centro.");
  return `Gere somente fundo e elementos gráficos de uma arte escolar 1024x1024. A referência é de estilo: remova toda pessoa, rosto, corpo, roupa e silhueta presentes nela. Não desenhe nenhuma pessoa. Reserve o centro para uma fotografia que será composta pelo servidor por cima de todos os elementos; não coloque textos essenciais no centro. Instruções editáveis abaixo dizem respeito SOMENTE ao fundo e elementos gráficos, nunca à pessoa original (que você não recebe). ${elements}`;
}
