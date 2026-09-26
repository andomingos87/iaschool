import { describe, expect, it } from "vitest";
import { buildZip, crc32, safeZipName, uniqueNames } from "./zip";

const enc = new TextEncoder();

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

function u32(bytes: Uint8Array, at: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(at, true);
}

function u16(bytes: Uint8Array, at: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(at, true);
}

describe("crc32", () => {
  it("bate com o valor conhecido de referência", () => {
    // "123456789" → 0xCBF43926 é o vetor de teste canônico do CRC-32.
    expect(crc32(enc.encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe("buildZip", () => {
  it("escreve a assinatura, o fim do diretório central e a contagem", async () => {
    const zip = await bytesOf(
      buildZip([
        { name: "a.txt", bytes: enc.encode("alfa"), date: new Date("2026-09-21T10:00:00Z") },
        { name: "b.txt", bytes: enc.encode("beta"), date: new Date("2026-09-21T10:00:00Z") },
      ]),
    );
    expect(u32(zip, 0)).toBe(0x04034b50);
    const eocd = zip.length - 22;
    expect(u32(zip, eocd)).toBe(0x06054b50);
    expect(u16(zip, eocd + 8)).toBe(2);
    expect(u16(zip, eocd + 10)).toBe(2);
  });

  it("guarda sem comprimir: tamanho e conteúdo intactos", async () => {
    const content = enc.encode("conteúdo de teste");
    const zip = await bytesOf(buildZip([{ name: "a.txt", bytes: content }]));
    expect(u16(zip, 8)).toBe(0); // método 0 = store
    expect(u32(zip, 18)).toBe(content.length); // tamanho comprimido
    expect(u32(zip, 22)).toBe(content.length); // tamanho original
    expect(u32(zip, 14)).toBe(crc32(content));
    const nameLen = u16(zip, 26);
    const stored = zip.slice(30 + nameLen, 30 + nameLen + content.length);
    expect(new TextDecoder().decode(stored)).toBe("conteúdo de teste");
  });

  it("marca o nome como UTF-8 (bit 11)", async () => {
    const zip = await bytesOf(buildZip([{ name: "acentuação.jpg", bytes: enc.encode("x") }]));
    expect(u16(zip, 6) & 0x0800).toBe(0x0800);
  });

  it("aceita lista vazia", async () => {
    const zip = await bytesOf(buildZip([]));
    expect(zip.length).toBe(22);
    expect(u32(zip, 0)).toBe(0x06054b50);
  });
});

describe("uniqueNames", () => {
  it("desambigua repetidos preservando a extensão", () => {
    expect(uniqueNames(["foto.jpg", "foto.jpg", "outra.jpg", "foto.jpg"])).toEqual([
      "foto.jpg",
      "foto (2).jpg",
      "outra.jpg",
      "foto (3).jpg",
    ]);
  });

  it("sem extensão, o sufixo vai no fim", () => {
    expect(uniqueNames(["foto", "foto"])).toEqual(["foto", "foto (2)"]);
  });
});

describe("safeZipName", () => {
  it("tira separador de caminho e caractere de controle", () => {
    expect(safeZipName("a/b\\c.jpg", "foto.jpg")).toBe("a-b-c.jpg");
    expect(safeZipName("../../etc/passwd", "foto.jpg")).toBe("-..-etc-passwd");
  });

  it("nome vazio cai no padrão", () => {
    expect(safeZipName("   ", "foto.jpg")).toBe("foto.jpg");
    expect(safeZipName("...", "foto.jpg")).toBe("foto.jpg");
  });
});
