import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { orientedDimensions, processPhoto, readExifTakenAt, thumbPathFor } from "./process-photo";
import type { StorageApi } from "./storage";
import type { PhotoRow } from "./types";

const photo: PhotoRow = {
  id: "11111111-1111-1111-1111-111111111111",
  school_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  event_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  storage_path: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/11111111-1111-1111-1111-111111111111.jpg",
  taken_at: null,
  deleted_at: null,
};

/** Imagem sintética (regra de conformidade: nada de foto real). */
async function syntheticJpeg(width: number, height: number, extra?: { exif?: Record<string, Record<string, string>> }) {
  let img = sharp({ create: { width, height, channels: 3, background: { r: 120, g: 140, b: 160 } } }).jpeg({ quality: 80 });
  if (extra?.exif) img = img.withExif(extra.exif);
  return img.toBuffer();
}

function fakeStorage(input: Buffer): StorageApi & { uploads: Array<{ bucket: string; path: string; body: Buffer; contentType: string }> } {
  const s = {
    uploads: [] as Array<{ bucket: string; path: string; body: Buffer; contentType: string }>,
    async download(bucket: string, path: string) {
      expect(bucket).toBe("event-photos");
      expect(path).toBe(photo.storage_path);
      return input;
    },
    async upload(bucket: string, path: string, body: Buffer, contentType: string) {
      s.uploads.push({ bucket, path, body, contentType });
    },
  };
  return s;
}

describe("processPhoto", () => {
  it("lê dimensões, gera WebP com lado maior 320 e sobe em event-thumbs", async () => {
    const storage = fakeStorage(await syntheticJpeg(1600, 1200));
    const out = await processPhoto(storage, photo, { thumbSize: 320, thumbQuality: 80 });
    expect(out.width).toBe(1600);
    expect(out.height).toBe(1200);
    expect(out.thumbPath).toBe(thumbPathFor(photo));
    expect(out.thumbPath).toBe(`${photo.school_id}/${photo.event_id}/${photo.id}.webp`);
    expect(out.durationMs).toBeGreaterThanOrEqual(0);

    expect(storage.uploads).toHaveLength(1);
    const up = storage.uploads[0]!;
    expect(up.bucket).toBe("event-thumbs");
    expect(up.contentType).toBe("image/webp");
    const meta = await sharp(up.body).metadata();
    expect(meta.format).toBe("webp");
    expect(Math.max(meta.width!, meta.height!)).toBe(320);
    expect(meta.width).toBe(320);
    expect(meta.height).toBe(240);
    // Bucket event-thumbs aceita até 2 MB; uma miniatura fica muito abaixo.
    expect(up.body.length).toBeLessThan(200_000);
  });

  it("retrato fica retrato e imagem menor que 320 não é ampliada", async () => {
    const tall = fakeStorage(await syntheticJpeg(600, 900));
    const outTall = await processPhoto(tall, photo, { thumbSize: 320, thumbQuality: 80 });
    expect(outTall.width).toBe(600);
    const metaTall = await sharp(tall.uploads[0]!.body).metadata();
    expect(metaTall.height).toBe(320);
    expect(metaTall.width).toBe(213);

    const small = fakeStorage(await syntheticJpeg(200, 100));
    await processPhoto(small, photo, { thumbSize: 320, thumbQuality: 80 });
    const metaSmall = await sharp(small.uploads[0]!.body).metadata();
    expect(metaSmall.width).toBe(200);
  });

  it("usa o EXIF só como reserva: com taken_at no banco, não devolve takenAt", async () => {
    const withExif = await syntheticJpeg(400, 300, {
      exif: { IFD0: { Orientation: "1" }, IFD2: { DateTimeOriginal: "2026:03:14 15:09:26" } },
    });
    const a = fakeStorage(withExif);
    const outA = await processPhoto(a, photo, { thumbSize: 320, thumbQuality: 80 });
    expect(outA.takenAt).toBe("2026-03-14T15:09:26.000Z");

    const b = fakeStorage(withExif);
    const outB = await processPhoto(b, { ...photo, taken_at: "2026-01-01T00:00:00Z" }, { thumbSize: 320, thumbQuality: 80 });
    expect(outB.takenAt).toBeUndefined();
  });

  it("buffer corrompido rejeita (vira falha do job) sem subir nada", async () => {
    const storage = fakeStorage(Buffer.from("isto não é uma imagem"));
    await expect(processPhoto(storage, photo, { thumbSize: 320, thumbQuality: 80 })).rejects.toThrow();
    expect(storage.uploads).toHaveLength(0);
  });

  it("signal já abortado interrompe antes de baixar", async () => {
    const ac = new AbortController();
    ac.abort();
    const storage = fakeStorage(await syntheticJpeg(100, 100));
    await expect(processPhoto(storage, photo, { thumbSize: 320, thumbQuality: 80, signal: ac.signal })).rejects.toThrow(/cancelado/);
  });
});

describe("helpers", () => {
  it("orientedDimensions troca largura e altura nas orientações 5–8", () => {
    expect(orientedDimensions({ width: 1600, height: 1200, orientation: 1 })).toEqual({ width: 1600, height: 1200 });
    expect(orientedDimensions({ width: 1600, height: 1200, orientation: 6 })).toEqual({ width: 1200, height: 1600 });
    expect(orientedDimensions({ width: 1600, height: 1200 })).toEqual({ width: 1600, height: 1200 });
  });

  it("readExifTakenAt tolera ausência e lixo", () => {
    expect(readExifTakenAt(undefined)).toBeUndefined();
    expect(readExifTakenAt(Buffer.from("xx"))).toBeUndefined();
    expect(readExifTakenAt(Buffer.alloc(64))).toBeUndefined();
  });
});
