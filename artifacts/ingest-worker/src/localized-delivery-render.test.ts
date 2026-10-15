import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { renderLocalizedDeliveryAsset, type LocalizedReview, type PersonRegion } from "./localized-delivery-render";

const W = 320;
const H = 200;
const opts = { blurSigma: 20, jpegQuality: 95, thumbSize: 160, thumbQuality: 95 };
const region = (kind: PersonRegion["kind"], x: number, studentId: string | null = null): PersonRegion => ({
  kind, studentId, faceId: `face-${x}`, shape: "rect", points: [x, 0, 80, H],
  reviewedBy: "escola", reviewedAt: "2026-10-12T12:00:00Z",
});
const review = (): LocalizedReview => ({
  regionsVersion: 4, reviewedVersion: 4, allPeopleReviewed: true, width: W, height: H,
  detectedFaceIds: ["face-0", "face-80", "face-160", "face-240"],
  authorizedStudentIds: ["aluno", "irmao"],
  regions: [region("own_child", 0, "aluno"), region("own_child", 80, "irmao"),
    region("other_child", 160, "outro"), region("adult_or_staff", 240)],
});
async function scene(): Promise<Buffer> {
  const data = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const value = ((x >> 2) + (y >> 2)) % 2 ? 240 : 10;
    data.fill(value, (y * W + x) * 3, (y * W + x) * 3 + 3);
  }
  return sharp(data, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
}
async function variance(input: Buffer, left: number, top = 50, size = 30): Promise<number> {
  const data = await sharp(input).extract({ left, top, width: size, height: size }).greyscale().raw().toBuffer();
  const mean = data.reduce((a, b) => a + b, 0) / data.length;
  return data.reduce((a, b) => a + (b - mean) ** 2, 0) / data.length;
}

describe("proteção localizada preparada (sem ativação na fila)", () => {
  it("protege outra criança inteira e mantém aluno, irmão e adulto nítidos", async () => {
    const out = await renderLocalizedDeliveryAsset(await scene(), review(), opts);
    for (const x of [20, 100, 260]) expect(await variance(out.asset, x)).toBeGreaterThan(6000);
    expect(await variance(out.asset, 180)).toBeLessThan(20);
    // Parte inferior do corpo, não só a caixa do rosto.
    expect(await variance(out.asset, 180, 150)).toBeLessThan(20);
    expect(await variance(out.thumb, 90, 60, 20)).toBeLessThan(20);
    const meta = await sharp(out.asset).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
  });

  it("protege own_child de outra família e desconhecido manual sem rosto", async () => {
    const snapshot = review();
    snapshot.regions = [region("own_child", 0, "outro"), { ...region("protected_unknown", 80), faceId: null }];
    snapshot.detectedFaceIds = ["face-0"];
    const out = await renderLocalizedDeliveryAsset(await scene(), snapshot, opts);
    expect(await variance(out.asset, 20)).toBeLessThan(20);
    expect(await variance(out.asset, 100)).toBeLessThan(20);
    expect(await variance(out.asset, 260)).toBeGreaterThan(6000);
  });

  it("região protegida prevalece na sobreposição com pessoa liberada", async () => {
    const snapshot = review();
    snapshot.regions = [...snapshot.regions, { ...region("protected_unknown", 0), points: [0, 100, 80, 100], faceId: null }];
    const out = await renderLocalizedDeliveryAsset(await scene(), snapshot, opts);
    expect(await variance(out.asset, 20, 30)).toBeGreaterThan(6000);
    expect(await variance(out.asset, 20, 140)).toBeLessThan(20);
  });

  it("orienta antes de aplicar polígono revisado na borda", async () => {
    const input = await sharp(await scene()).rotate(90).jpeg().withMetadata({ orientation: 8 }).toBuffer();
    const snapshot = review();
    snapshot.regions = snapshot.regions.map(r => r.faceId === "face-160" ? {
      ...r, shape: "polygon", points: [[160, 0], [240, 0], [240, H], [160, H]],
    } : r);
    const out = await renderLocalizedDeliveryAsset(input, snapshot, opts);
    expect(out.width).toBe(W);
    expect(out.height).toBe(H);
    expect(await variance(out.asset, 180, 150)).toBeLessThan(20);
  });

  it.each([
    { allPeopleReviewed: false }, { reviewedVersion: 3 }, { regionsVersion: 0 },
    { regions: [] }, { width: 321 }, { detectedFaceIds: ["rosto-sem-região"] },
  ])("não produz derivado sem revisão completa ou versão/dimensões coerentes: %j", async patch => {
    await expect(renderLocalizedDeliveryAsset(await scene(), { ...review(), ...patch }, opts)).rejects.toThrow("foto pendente");
  });

  it.each([
    { reviewedBy: null }, { reviewedAt: null }, { reviewedAt: "inválido" },
    { points: [160, 0, 200, H] }, { points: ["160", 0, 80, H] },
    { shape: "polygon" as const, points: [[160, 0], [240, 200], [160, 200], [240, 0]] },
    { shape: "polygon" as const, points: [[160, 0], [180, 0], [240, 0]] },
  ])("recusa região malformada ou sem autoria, mesmo da pessoa liberada: %j", async patch => {
    const snapshot = review();
    snapshot.regions = [{ ...snapshot.regions[0]!, ...patch }, ...snapshot.regions.slice(1)];
    await expect(renderLocalizedDeliveryAsset(await scene(), snapshot, opts)).rejects.toThrow("foto pendente");
  });

  it("é determinístico e miniatura vem do mesmo arquivo protegido", async () => {
    const input = await scene();
    const a = await renderLocalizedDeliveryAsset(input, review(), opts);
    const b = await renderLocalizedDeliveryAsset(input, review(), opts);
    expect(a.assetHash).toBe(b.assetHash);
    const thumb = await sharp(a.asset).resize({ width: opts.thumbSize, height: opts.thumbSize,
      fit: "inside", withoutEnlargement: true }).webp({ quality: opts.thumbQuality }).toBuffer();
    expect(a.thumb).toEqual(thumb);
  });
});
