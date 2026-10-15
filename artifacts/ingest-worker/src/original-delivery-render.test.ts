import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { renderOriginalDeliveryAsset } from "./original-delivery-render";
import { DeliveryImageInvalidError } from "./localized-delivery-render";

const options = { jpegQuality: 90, thumbSize: 128, thumbQuality: 90 };

async function sharpScene() {
  const width = 96; const height = 64;
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const value = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? 240 : 16;
    for (let c = 0; c < 3; c++) pixels[(y * width + x) * 3 + c] = value;
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

function contrast(data: Buffer, width: number, x: number, y: number) {
  return Math.abs(data[(y * width + x) * 3]! - data[(y * width + x + 4) * 3]!);
}

describe("fotos nítidas da entrega", () => {
  it("preserva detalhes em toda foto e miniatura, incluindo centro e bordas", async () => {
    const input = await sharpScene();
    const out = await renderOriginalDeliveryAsset(input, options);
    expect([out.width, out.height]).toEqual([96, 64]);
    expect(out.assetHash).toMatch(/^[0-9a-f]{64}$/);
    for (const image of [out.asset, out.thumb]) {
      const { data, info } = await sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      for (const [x, y] of [[1, 1], [41, 25], [81, 57]]) {
        expect(contrast(data, info.width, x!, y!)).toBeGreaterThan(180);
      }
    }
    const blurred = await sharp(input).blur(20).removeAlpha().raw().toBuffer();
    expect(contrast(blurred, 96, 41, 25)).toBeLessThan(20);
  });

  it("orienta a foto e remove EXIF sem alterar dimensões por redimensionamento", async () => {
    const input = await sharp(await sharpScene()).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const out = await renderOriginalDeliveryAsset(input, options);
    expect([out.width, out.height]).toEqual([64, 96]);
    for (const image of [out.asset, out.thumb]) {
      const metadata = await sharp(image).metadata();
      expect(metadata.exif).toBeUndefined();
      expect(metadata.orientation).toBeUndefined();
      expect(metadata.xmp).toBeUndefined();
      expect(metadata.icc).toBeUndefined();
    }
  });

  it.each([Buffer.alloc(0), Buffer.from("invalid private image")])("recusa arquivo inválido com erro seguro", async input => {
    await expect(renderOriginalDeliveryAsset(input, options)).rejects.toBeInstanceOf(DeliveryImageInvalidError);
  });
});
