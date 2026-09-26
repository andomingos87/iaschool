import { describe, expect, it } from "vitest";
import { sniffHeic } from "./image";

/** Box `ftyp` com a marca principal e as compatíveis, como abre um HEIF/AVIF. */
function ftyp(major: string, compatible: string[]): Blob {
  const size = 16 + compatible.length * 4;
  const bytes = new Uint8Array(size);
  new DataView(bytes.buffer).setUint32(0, size);
  const put = (at: number, s: string) => [...s].forEach((c, i) => (bytes[at + i] = c.charCodeAt(0)));
  put(4, "ftyp");
  put(8, major);
  compatible.forEach((b, i) => put(16 + i * 4, b));
  return new Blob([bytes]);
}

describe("sniffHeic", () => {
  it("reconhece HEIC pela marca principal, mesmo com nome de JPEG", async () => {
    expect(await sniffHeic(new File([ftyp("heic", ["mif1", "heic"])], "IMG_0001.jpg"))).toBe(true);
    expect(await sniffHeic(ftyp("hevc", ["msf1"]))).toBe(true);
  });

  it("marca genérica mif1 só conta como HEIC se tiver HEVC e não tiver AVIF", async () => {
    expect(await sniffHeic(ftyp("mif1", ["mif1", "heic", "miaf"]))).toBe(true);
    expect(await sniffHeic(ftyp("mif1", ["mif1", "avif", "miaf"]))).toBe(false);
    expect(await sniffHeic(ftyp("avif", ["mif1", "avif"]))).toBe(false);
  });

  it("não confunde JPEG, PNG nem arquivo curto", async () => {
    const jpeg = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1])]);
    const png = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82])]);
    expect(await sniffHeic(jpeg)).toBe(false);
    expect(await sniffHeic(png)).toBe(false);
    expect(await sniffHeic(new Blob(["ftyp"]))).toBe(false);
  });
});
