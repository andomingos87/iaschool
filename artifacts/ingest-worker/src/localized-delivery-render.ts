import { createHash } from "node:crypto";
import sharp from "sharp";
import type { RenderOptions, RenderOutcome } from "./delivery-render";

export interface PersonRegion {
  kind: "protected_unknown" | "other_child" | "own_child" | "adult_or_staff";
  studentId: string | null;
  faceId: string | null;
  shape: "rect" | "polygon";
  points: unknown;
  reviewedBy: string | null;
  reviewedAt: string | null;
}

/** Snapshot de revisão humana da foto completa; a tabela de regiões sozinha
 * não prova que pessoas não detectadas foram conferidas. O chamador deve obter
 * esta atestação de uma revisão persistida e revalidar a versão ao concluir.
 * Conectado à fila por delivery_render_context; conclusão compara a versão no banco.
 */
export interface LocalizedReview {
  regionsVersion: number;
  reviewedVersion: number;
  allPeopleReviewed: boolean;
  width: number;
  height: number;
  detectedFaceIds: readonly string[];
  /** Filhos/irmãos confirmados e aptos ao escopo para ESTE destinatário. */
  authorizedStudentIds: readonly string[];
  regions: readonly PersonRegion[];
}

export class DeliveryReviewPendingError extends Error {
  constructor() { super("foto pendente: proteção da pessoa inteira requer revisão válida"); }
}

export class DeliveryImageInvalidError extends Error {
  constructor() { super("imagem de entrega inválida"); }
}

function pending(): never {
  throw new DeliveryReviewPendingError();
}

/** A atestação pode ser recusada antes de baixar qualquer byte da foto. */
export function assertDeliveryReviewReady(review: LocalizedReview): void {
  if (review.allPeopleReviewed !== true || !Number.isSafeInteger(review.regionsVersion) ||
      review.regionsVersion < 1 || review.reviewedVersion !== review.regionsVersion ||
      !Number.isSafeInteger(review.width) || review.width < 1 ||
      !Number.isSafeInteger(review.height) || review.height < 1 ||
      !Array.isArray(review.regions) || review.regions.length === 0 || review.regions.length > 1000) pending();
}

async function normalizeDeliveryInput(input: Buffer) {
  try {
    return await sharp(input, { failOn: "error", limitInputPixels: 50_000_000 })
      .autoOrient().png().toBuffer({ resolveWithObject: true });
  } catch {
    throw new DeliveryImageInvalidError();
  }
}

type Point = [number, number];
function cross(a: Point, b: Point, c: Point): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

/** Rejeita polígonos que cruzam/tocam suas próprias arestas. */
function simplePolygon(points: Point[]): boolean {
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    if (a[0] === b[0] && a[1] === b[1]) return false;
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      const c = points[j]!;
      const d = points[(j + 1) % points.length]!;
      const overlap = Math.max(Math.min(a[0], b[0]), Math.min(c[0], d[0])) <=
          Math.min(Math.max(a[0], b[0]), Math.max(c[0], d[0])) &&
        Math.max(Math.min(a[1], b[1]), Math.min(c[1], d[1])) <=
          Math.min(Math.max(a[1], b[1]), Math.max(c[1], d[1]));
      if (overlap && cross(a, b, c) * cross(a, b, d) <= 0 &&
          cross(c, d, a) * cross(c, d, b) <= 0) return false;
    }
  }
  return Math.abs(points.reduce((area, a, i) => {
    const b = points[(i + 1) % points.length]!;
    return area + a[0] * b[1] - a[1] * b[0];
  }, 0)) >= 2;
}

function regionSvg(region: PersonRegion, width: number, height: number): string {
  const raw = region.points;
  if (!Array.isArray(raw)) return pending();
  if (region.shape === "rect") {
    if (raw.length !== 4 || !raw.every(v => typeof v === "number" && Number.isFinite(v))) return pending();
    const [x, y, w, h] = raw as [number, number, number, number];
    if (x < 0 || y < 0 || w < 1 || h < 1 || x + w > width || y + h > height) return pending();
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="white"/>`;
  }
  if (region.shape !== "polygon" || raw.length < 3 || raw.length > 256) return pending();
  if (!raw.every(p => Array.isArray(p) && p.length === 2 &&
    p.every(v => typeof v === "number" && Number.isFinite(v)) &&
    p[0] >= 0 && p[0] <= width && p[1] >= 0 && p[1] <= height)) return pending();
  const points = raw as Point[];
  if (!simplePolygon(points)) return pending();
  return `<polygon points="${points.map(p => p.join(",")).join(" ")}" fill="white"/>`;
}

/** Cena nítida, proteção aplicada nos pixels; sobreposição protegida prevalece.
 * Não aceita caixa de rosto como substituto da revisão da pessoa inteira.
 */
export async function renderLocalizedDeliveryAsset(
  input: Buffer,
  review: LocalizedReview,
  opts: RenderOptions,
): Promise<RenderOutcome> {
  assertDeliveryReviewReady(review);
  // O erro nativo de sharp pode conter dados da entrada; só sai um tipo seguro.
  const normalized = await normalizeDeliveryInput(input);
  const { width, height } = normalized.info;
  if (review.width !== width || review.height !== height) pending();
  const children = new Set(review.authorizedStudentIds);
  const coveredFaces = new Set<string>();
  const shapes: string[] = [];
  for (const region of review.regions) {
    if (!region.reviewedBy || !region.reviewedAt || !Number.isFinite(Date.parse(region.reviewedAt))) pending();
    if (!["own_child", "adult_or_staff", "other_child", "protected_unknown"].includes(region.kind)) pending();
    const svg = regionSvg(region, width, height);
    if (region.faceId) coveredFaces.add(region.faceId);
    const clear = region.kind === "adult_or_staff" ||
      (region.kind === "own_child" && region.studentId !== null && children.has(region.studentId));
    if (!clear) shapes.push(svg);
  }
  if (review.detectedFaceIds.some(id => !coveredFaces.has(id))) pending();
  let protectedBase = normalized.data;
  if (shapes.length > 0) {
    const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${shapes.join("")}</svg>`);
    const blurred = await sharp(normalized.data).blur(opts.blurSigma).ensureAlpha()
      .composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
    protectedBase = await sharp(normalized.data).composite([{ input: blurred }]).png().toBuffer();
  }
  const asset = await sharp(protectedBase).jpeg({ quality: opts.jpegQuality }).toBuffer();
  const thumb = await sharp(asset).resize({ width: opts.thumbSize, height: opts.thumbSize,
    fit: "inside", withoutEnlargement: true }).webp({ quality: opts.thumbQuality }).toBuffer();
  return { asset, thumb, width, height, assetHash: createHash("sha256").update(asset).digest("hex") };
}
