import { createHash } from "node:crypto";
import sharp from "sharp";
import type { RenderOptions, RenderOutcome } from "./delivery-render";
import { DeliveryImageInvalidError } from "./localized-delivery-render";

/** Foto completa nítida, orientada, sem EXIF/GPS e sem máscaras de pessoas. */
export async function renderOriginalDeliveryAsset(
  input: Buffer,
  opts: Omit<RenderOptions, "blurSigma">,
): Promise<RenderOutcome> {
  try {
    const normalized = await sharp(input, { failOn: "error", limitInputPixels: 50_000_000 })
      .rotate()
      .jpeg({ quality: opts.jpegQuality, chromaSubsampling: "4:4:4" })
      .toBuffer({ resolveWithObject: true });
    const { width, height } = normalized.info;
    if (!width || !height) throw new DeliveryImageInvalidError();
    const asset = normalized.data;
    const thumb = await sharp(asset)
      .resize({ width: opts.thumbSize, height: opts.thumbSize, fit: "inside", withoutEnlargement: true })
      .webp({ quality: opts.thumbQuality })
      .toBuffer();
    return { asset, thumb, width, height, assetHash: createHash("sha256").update(asset).digest("hex") };
  } catch {
    throw new DeliveryImageInvalidError();
  }
}
