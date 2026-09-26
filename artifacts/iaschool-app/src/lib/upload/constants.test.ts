import { describe, expect, it } from "vitest";
import { isAcceptedImage, isHeicLike, isImageLike, mimeFromName } from "./constants";

describe("isAcceptedImage", () => {
  it("aceita JPEG, PNG e HEIC pelo MIME", () => {
    expect(isAcceptedImage({ name: "a.jpg", type: "image/jpeg" })).toBe(true);
    expect(isAcceptedImage({ name: "a.png", type: "image/png" })).toBe(true);
    expect(isAcceptedImage({ name: "a.heic", type: "image/heic" })).toBe(true);
    expect(isAcceptedImage({ name: "a.HEIF", type: "image/heif" })).toBe(true);
  });

  it("aceita os outros formatos que o navegador lê e o cliente converte para JPEG", () => {
    expect(isAcceptedImage({ name: "a.webp", type: "image/webp" })).toBe(true);
    expect(isAcceptedImage({ name: "a.avif", type: "image/avif" })).toBe(true);
    expect(isAcceptedImage({ name: "a.gif", type: "image/gif" })).toBe(true);
    expect(isAcceptedImage({ name: "a.bmp", type: "image/bmp" })).toBe(true);
    expect(isAcceptedImage({ name: "a.JPG", type: "image/JPEG" })).toBe(true);
  });

  it("MIME genérico (arquivo vindo de nuvem) também decide pela extensão", () => {
    expect(isAcceptedImage({ name: "IMG_7543.HEIC", type: "application/octet-stream" })).toBe(true);
    expect(isAcceptedImage({ name: "planilha.xlsx", type: "application/octet-stream" })).toBe(false);
  });

  it("sem MIME (HEIC no Windows) decide pela extensão", () => {
    expect(isAcceptedImage({ name: "IMG_0001.HEIC", type: "" })).toBe(true);
    expect(isAcceptedImage({ name: "foto.jpeg", type: "" })).toBe(true);
    expect(isAcceptedImage({ name: "notas.txt", type: "" })).toBe(false);
    expect(isAcceptedImage({ name: "semextensao", type: "" })).toBe(false);
  });

  it("recusa TIFF, SVG e arquivos que não são imagem", () => {
    // O Chrome não decodifica TIFF; SVG não é foto.
    expect(isAcceptedImage({ name: "a.tif", type: "image/tiff" })).toBe(false);
    expect(isAcceptedImage({ name: "a.svg", type: "image/svg+xml" })).toBe(false);
    expect(isAcceptedImage({ name: "a.mov", type: "video/quicktime" })).toBe(false);
    expect(isAcceptedImage({ name: "a.pdf", type: "application/pdf" })).toBe(false);
  });
});

describe("isImageLike (upload avulso)", () => {
  it("tenta qualquer image/* além dos formatos do lote", () => {
    expect(isImageLike({ name: "logo.svg", type: "image/svg+xml" })).toBe(true);
    expect(isImageLike({ name: "a.tif", type: "image/tiff" })).toBe(true);
    expect(isImageLike({ name: "IMG_7543.HEIC", type: "" })).toBe(true);
    expect(isImageLike({ name: "a.pdf", type: "application/pdf" })).toBe(false);
  });
});

describe("mimeFromName", () => {
  it("infere o MIME pela extensão, sem diferenciar maiúsculas", () => {
    expect(mimeFromName("IMG_7543.HEIC")).toBe("image/heic");
    expect(mimeFromName("foto.JPG")).toBe("image/jpeg");
    expect(mimeFromName("notas.txt")).toBe("");
  });
});

describe("isHeicLike", () => {
  it("reconhece HEIC pelo MIME ou pela extensão", () => {
    expect(isHeicLike({ name: "a.jpg", type: "image/heic" })).toBe(true);
    expect(isHeicLike({ name: "a.heif", type: "" })).toBe(true);
    expect(isHeicLike({ name: "a.jpg", type: "image/jpeg" })).toBe(false);
  });
});
