// O pacote `exifr` só declara tipos para o build completo; o build lite
// (JPEG/PNG/HEIC, 48 KB) expõe a mesma API.
declare module "exifr/dist/lite.esm.mjs" {
  export * from "exifr";
}
