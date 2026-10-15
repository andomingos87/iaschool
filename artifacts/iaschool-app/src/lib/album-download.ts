import { buildZip, safeZipName, uniqueNames } from "./zip";
import { isImageBytes } from "./student-folder";
import type { AlbumDownload, AlbumPhoto } from "./delivery-service";

/** Assina novamente em cada download: um link vencido da grade não é reutilizado. */
export async function getAlbumPhotoBytes(itemId: string, sign: (id: string) => Promise<AlbumDownload>, transport: typeof fetch = fetch) {
  const file = await sign(itemId);
  const url = new URL(file.url);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))
    throw new Error("O arquivo está indisponível. Procure a escola.");
  const response = await transport(file.url, { cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", redirect: "error" });
  if (!response.ok) throw new Error("O arquivo venceu ou está indisponível. Atualize o álbum para tentar novamente.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!isImageBytes(bytes)) throw new Error("O arquivo recebido não é uma foto válida.");
  return { bytes, filename: safeZipName(file.filename, "foto.jpg") };
}
export async function buildGuardianAlbumZip(input: {
  items: readonly AlbumPhoto[]; sign: (id: string) => Promise<AlbumDownload>;
  transport?: typeof fetch; audit: (ids: string[]) => Promise<{ ok: boolean }>; onProgress?: (done: number, total: number) => void;
}) {
  const selected: AlbumPhoto[] = [];
  const seen = new Set<string>();
  for (const item of input.items) { if (!seen.has(item.photoId)) { seen.add(item.photoId); selected.push(item); } }
  if (selected.length === 0) throw new Error("Nenhuma foto disponível para baixar.");
  const entries: { name: string; bytes: Uint8Array }[] = [];
  const downloaded: string[] = [];
  let count = 0;
  for (const item of selected) {
    try {
      const photo = await getAlbumPhotoBytes(item.id, input.sign, input.transport);
      entries.push({ name: `${String(entries.length + 1).padStart(3, "0")}-${photo.filename}`, bytes: photo.bytes });
      downloaded.push(item.id);
    } catch (error) {
      // Revogação/expiração de sessão interrompe o pacote, sem esconder o motivo.
      if (error instanceof Error && "status" in error && [401, 403, 410].includes(Number(error.status))) throw error;
    }
    count += 1; input.onProgress?.(count, selected.length);
  }
  if (entries.length === 0) throw new Error("Nenhuma foto pôde ser baixada. Atualize o álbum ou procure a escola.");
  // Auditoria revalida a sessão e o conjunto antes de liberar o pacote montado.
  const audit = await input.audit(downloaded);
  if (audit?.ok !== true) throw new Error("Não foi possível revalidar o conjunto. Atualize o álbum ou procure a escola.");
  const names = uniqueNames(entries.map(entry => entry.name));
  return { blob: buildZip(entries.map((entry, index) => ({ ...entry, name: names[index]! }))), included: entries.length,
    missing: selected.length - entries.length };
}
