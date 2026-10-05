import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { clampBox, parseBoxes, renderDeliveryAsset } from "./delivery-render";

const W = 480;
const H = 360;

/**
 * Cena determinística: fundo liso com gradiente suave e um "rosto" texturizado
 * (tabuleiro fino) entre (60,60) e (220,220). O tabuleiro dá variância alta no
 * nítido e a ausência dele denuncia o desfoque.
 */
async function scene(): Promise<Buffer> {
  const raw = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      const inFace = x >= 60 && x < 220 && y >= 60 && y < 220;
      if (inFace) {
        const v = ((x >> 2) + (y >> 2)) % 2 === 0 ? 30 : 225;
        raw[i] = v;
        raw[i + 1] = v;
        raw[i + 2] = v;
      } else {
        const v = 120 + Math.round(((x + y) / (W + H)) * 40);
        raw[i] = v;
        raw[i + 1] = v;
        raw[i + 2] = v;
      }
    }
  }
  return sharp(raw, { raw: { width: W, height: H, channels: 3 } })
    .jpeg({ quality: 95 })
    .toBuffer();
}

async function lumaVariance(
  jpeg: Buffer,
  region: { left: number; top: number; width: number; height: number },
): Promise<number> {
  const { data, info } = await sharp(jpeg)
    .extract(region)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const n = info.width * info.height;
  let mean = 0;
  for (const v of data) mean += v;
  mean /= n;
  let sum = 0;
  for (const v of data) sum += (v - mean) ** 2;
  return sum / n;
}

const OPTIONS = { blurSigma: 25, jpegQuality: 85, thumbSize: 240, thumbQuality: 80 };
const FACE = { x: 60, y: 60, w: 160, h: 160 };
const INSIDE = { left: 90, top: 90, width: 100, height: 100 };
const OUTSIDE = { left: 330, top: 240, width: 100, height: 100 };

describe("renderDeliveryAsset", () => {
  it("mantém nítido o rosto do filho e desfoca o resto nos pixels", async () => {
    const out = await renderDeliveryAsset(await scene(), [FACE], OPTIONS);
    const inside = await lumaVariance(out.asset, INSIDE);
    const outside = await lumaVariance(out.asset, OUTSIDE);
    expect(inside).toBeGreaterThan(outside * 4);
    expect(outside).toBeLessThan(60);
    expect(out.width).toBe(W);
    expect(out.height).toBe(H);
  });

  it("sem rosto nítido, desfoca a imagem inteira", async () => {
    const out = await renderDeliveryAsset(await scene(), [], OPTIONS);
    const inside = await lumaVariance(out.asset, INSIDE);
    expect(inside).toBeLessThan(60);
  });

  it("sai sem EXIF e com a orientação já aplicada", async () => {
    const out = await renderDeliveryAsset(await scene(), [FACE], OPTIONS);
    const meta = await sharp(out.asset).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    expect(meta.format).toBe("jpeg");
  });

  it("é determinístico: mesmo insumo, mesmo hash", async () => {
    const input = await scene();
    const a = await renderDeliveryAsset(input, [FACE], OPTIONS);
    const b = await renderDeliveryAsset(input, [FACE], OPTIONS);
    expect(a.assetHash).toBe(b.assetHash);
    expect(a.assetHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("a miniatura é WebP dentro do limite pedido", async () => {
    const out = await renderDeliveryAsset(await scene(), [FACE], OPTIONS);
    const meta = await sharp(out.thumb).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width ?? 0).toBeLessThanOrEqual(OPTIONS.thumbSize);
  });
});

describe("caixas do rosto", () => {
  it("clampBox expande com margem e prende dentro da imagem", () => {
    expect(clampBox({ x: 10, y: 10, w: 100, h: 100 }, 480, 360)).toEqual({
      x: 2,
      y: 2,
      w: 116,
      h: 116,
    });
    expect(clampBox({ x: 400, y: 300, w: 200, h: 200 }, 480, 360)).toEqual({
      x: 384,
      y: 284,
      w: 96,
      h: 76,
    });
  });

  it("parseBoxes ignora lixo e caixas minúsculas", () => {
    expect(
      parseBoxes([
        { x: 1, y: 2, w: 30, h: 40 },
        { x: "a", y: 0, w: 10, h: 10 },
        { x: 0, y: 0, w: 1, h: 1 },
        null,
      ]),
    ).toEqual([{ x: 1, y: 2, w: 30, h: 40 }]);
  });
});
