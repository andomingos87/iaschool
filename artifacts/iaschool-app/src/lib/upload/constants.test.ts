import { describe, expect, it } from "vitest";
import { isAcceptedImage, isHeicLike } from "./constants";

describe("isAcceptedImage", () => {
  it("aceita JPEG, PNG e HEIC pelo MIME", () => {
    expect(isAcceptedImage({ name: "a.jpg", type: "image/jpeg" })).toBe(true);
    expect(isAcceptedImage({ name: "a.png", type: "image/png" })).toBe(true);
    expect(isAcceptedImage({ name: "a.heic", type: "image/heic" })).toBe(true);
    expect(isAcceptedImage({ name: "a.HEIF", type: "image/heif" })).toBe(true);
  });

  it("sem MIME (HEIC no Windows) decide pela extensão", () => {
    expect(isAcceptedImage({ name: "IMG_0001.HEIC", type: "" })).toBe(true);
    expect(isAcceptedImage({ name: "foto.jpeg", type: "" })).toBe(true);
    expect(isAcceptedImage({ name: "notas.txt", type: "" })).toBe(false);
    expect(isAcceptedImage({ name: "semextensao", type: "" })).toBe(false);
  });

  it("recusa outros formatos de imagem e arquivos que não são imagem", () => {
    expect(isAcceptedImage({ name: "a.gif", type: "image/gif" })).toBe(false);
    expect(isAcceptedImage({ name: "a.webp", type: "image/webp" })).toBe(false);
    expect(isAcceptedImage({ name: "a.mov", type: "video/quicktime" })).toBe(false);
    expect(isAcceptedImage({ name: "a.pdf", type: "application/pdf" })).toBe(false);
  });
});

describe("isHeicLike", () => {
  it("reconhece HEIC pelo MIME ou pela extensão", () => {
    expect(isHeicLike({ name: "a.jpg", type: "image/heic" })).toBe(true);
    expect(isHeicLike({ name: "a.heif", type: "" })).toBe(true);
    expect(isHeicLike({ name: "a.jpg", type: "image/jpeg" })).toBe(false);
  });
});
