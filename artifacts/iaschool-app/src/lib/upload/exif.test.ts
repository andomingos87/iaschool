import { describe, expect, it } from "vitest";
import { exifDateToIso, readTakenAtFrom } from "./exif";

/**
 * Monta um JPEG mínimo com um segmento APP1/EXIF (TIFF little-endian, IFD0 →
 * ExifIFD com DateTimeOriginal e, opcionalmente, OffsetTimeOriginal). Sem
 * pixels de verdade: o exifr só precisa dos marcadores e do TIFF.
 */
function buildJpegWithExif(opts: { dateTimeOriginal: string; offsetTimeOriginal?: string }): Uint8Array {
  const entries: Array<{ tag: number; value: string }> = [
    { tag: 0x9003, value: opts.dateTimeOriginal },
  ];
  if (opts.offsetTimeOriginal) entries.push({ tag: 0x9011, value: opts.offsetTimeOriginal });

  // Layout do TIFF (offsets relativos ao início do TIFF):
  //   0  cabeçalho (8)
  //   8  IFD0: count(2) + 1 entrada (12) + next(4) = 18
  //  26  ExifIFD: count(2) + n*12 + next(4)
  //  ... dados das strings
  const ifd0Off = 8;
  const exifIfdOff = ifd0Off + 2 + 12 + 4;
  const dataOff = exifIfdOff + 2 + entries.length * 12 + 4;
  const strings = entries.map((e) => new TextEncoder().encode(e.value + "\0"));
  const tiffLen = dataOff + strings.reduce((n, s) => n + s.length, 0);
  const tiff = new Uint8Array(tiffLen);
  const dv = new DataView(tiff.buffer);
  tiff.set([0x49, 0x49, 0x2a, 0x00], 0); // "II" + 42
  dv.setUint32(4, ifd0Off, true);
  // IFD0: uma entrada apontando o ExifIFD (0x8769, LONG, 1)
  dv.setUint16(ifd0Off, 1, true);
  dv.setUint16(ifd0Off + 2, 0x8769, true);
  dv.setUint16(ifd0Off + 4, 4, true);
  dv.setUint32(ifd0Off + 6, 1, true);
  dv.setUint32(ifd0Off + 10, exifIfdOff, true);
  dv.setUint32(ifd0Off + 14, 0, true);
  // ExifIFD
  dv.setUint16(exifIfdOff, entries.length, true);
  let cursor = dataOff;
  entries.forEach((e, i) => {
    const base = exifIfdOff + 2 + i * 12;
    dv.setUint16(base, e.tag, true);
    dv.setUint16(base + 2, 2, true); // ASCII
    dv.setUint32(base + 4, strings[i]!.length, true);
    dv.setUint32(base + 8, cursor, true);
    tiff.set(strings[i]!, cursor);
    cursor += strings[i]!.length;
  });
  dv.setUint32(exifIfdOff + 2 + entries.length * 12, 0, true);

  const exifHeader = new TextEncoder().encode("Exif\0\0");
  const app1Len = 2 + exifHeader.length + tiff.length;
  const out = new Uint8Array(2 + 2 + app1Len + 2);
  let o = 0;
  out.set([0xff, 0xd8], o); o += 2; // SOI
  out.set([0xff, 0xe1], o); o += 2; // APP1
  out[o++] = (app1Len >> 8) & 0xff;
  out[o++] = app1Len & 0xff;
  out.set(exifHeader, o); o += exifHeader.length;
  out.set(tiff, o); o += tiff.length;
  out.set([0xff, 0xd9], o); // EOI
  return out;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

describe("exifDateToIso", () => {
  it("usa o offset quando a câmera gravou OffsetTimeOriginal", () => {
    expect(exifDateToIso("2026:03:14 15:09:26", "-03:00")).toBe("2026-03-14T18:09:26.000Z");
    expect(exifDateToIso("2026:03:14 15:09:26", "+02:00")).toBe("2026-03-14T13:09:26.000Z");
  });

  it("sem offset interpreta no fuso local (o de quem envia)", () => {
    const expected = new Date(2026, 2, 14, 15, 9, 26).toISOString();
    expect(exifDateToIso("2026:03:14 15:09:26")).toBe(expected);
  });

  it("rejeita data zerada, lixo e tipos errados", () => {
    expect(exifDateToIso("0000:00:00 00:00:00")).toBeUndefined();
    expect(exifDateToIso("ontem")).toBeUndefined();
    expect(exifDateToIso(undefined)).toBeUndefined();
    expect(exifDateToIso(12345)).toBeUndefined();
    expect(exifDateToIso("2026:13:40 99:99:99")).toBeUndefined();
  });
});

describe("readTakenAtFrom", () => {
  it("lê DateTimeOriginal + OffsetTimeOriginal de um JPEG com EXIF", async () => {
    const jpeg = buildJpegWithExif({ dateTimeOriginal: "2026:03:14 15:09:26", offsetTimeOriginal: "-03:00" });
    await expect(readTakenAtFrom(toArrayBuffer(jpeg))).resolves.toBe("2026-03-14T18:09:26.000Z");
  });

  it("sem offset cai no fuso local", async () => {
    const jpeg = buildJpegWithExif({ dateTimeOriginal: "2026:03:14 15:09:26" });
    const expected = new Date(2026, 2, 14, 15, 9, 26).toISOString();
    await expect(readTakenAtFrom(toArrayBuffer(jpeg))).resolves.toBe(expected);
  });

  it("JPEG sem APP1 e bytes aleatórios devolvem undefined sem lançar", async () => {
    const bare = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    await expect(readTakenAtFrom(toArrayBuffer(bare))).resolves.toBeUndefined();
    const junk = new Uint8Array(4096);
    for (let i = 0; i < junk.length; i++) junk[i] = (i * 7919) % 251;
    await expect(readTakenAtFrom(toArrayBuffer(junk))).resolves.toBeUndefined();
    await expect(readTakenAtFrom(new ArrayBuffer(0))).resolves.toBeUndefined();
  });
});
