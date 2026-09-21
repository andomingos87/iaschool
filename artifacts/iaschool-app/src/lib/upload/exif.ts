// Leitura de `DateTimeOriginal` do arquivo ORIGINAL, antes do
// redimensionamento. O JPEG que sobe não carrega EXIF (nada de GPS nem
// modelo de câmera no Storage de foto de aluno), então a data da foto é o
// único metadado que o cliente preserva, e vai no insert de `photos`.
//
// `exifr` (build lite: JPEG, PNG e HEIC) é carregado sob demanda no primeiro
// arquivo do lote. Aqui só entra o cabeçalho do arquivo, como ArrayBuffer:
// evita o FileReader (inexistente no Node dos testes) e não lê megabytes à toa.

import { isHeicLike } from "./constants";

export type ReadTakenAt = (file: Blob & { name?: string; type?: string }) => Promise<string | undefined>;

/** JPEG/PNG guardam o EXIF nos primeiros KB; no HEIC o box `meta` pode vir depois. */
const HEAD_BYTES_DEFAULT = 256 * 1024;
const HEAD_BYTES_HEIC = 1024 * 1024;

const EXIF_DATE = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/;

/**
 * "2026:03:14 15:09:26" (+ "-03:00" opcional, do `OffsetTimeOriginal`) → ISO
 * com instante. EXIF é hora de parede da câmera, sem fuso: com offset, usa o
 * offset; sem ele, interpreta no fuso do navegador de quem envia (quem sobe
 * está na escola do evento; fixar America/Sao_Paulo erraria Manaus e Rio
 * Branco). Datas zeradas ou fora do padrão voltam `undefined`. Nunca lança.
 */
export function exifDateToIso(raw: unknown, offset?: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const m = EXIF_DATE.exec(raw.trim());
  if (!m) return undefined;
  const [, y, mo, d, h, mi, s] = m.map(Number) as unknown as [string, number, number, number, number, number, number];
  if (y < 1900 || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 60) return undefined;
  const pad = (n: number) => String(n).padStart(2, "0");
  const off = typeof offset === "string" ? /^([+-])(\d{2}):(\d{2})$/.exec(offset.trim()) : null;
  let date: Date;
  if (off) {
    date = new Date(`${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:${pad(s)}${off[1]}${off[2]}:${off[3]}`);
  } else {
    date = new Date(y, mo - 1, d, h, mi, s);
  }
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

interface ExifrLite {
  parse(data: ArrayBuffer, options: Record<string, unknown>): Promise<Record<string, unknown> | undefined>;
}

let exifrPromise: Promise<ExifrLite> | null = null;
function loadExifr(): Promise<ExifrLite> {
  exifrPromise ??= import("exifr/dist/lite.esm.mjs").then((m) => m as unknown as ExifrLite);
  return exifrPromise;
}

/** Extrai o instante da foto a partir do EXIF do cabeçalho do arquivo. */
export async function readTakenAtFrom(head: ArrayBuffer): Promise<string | undefined> {
  let out: Record<string, unknown> | undefined;
  try {
    const exifr = await loadExifr();
    // Filtro por bloco (`exif: [...]`): o `pick` de nível raiz não funciona no
    // build lite. IFD0 fica ligado só porque é onde mora o ponteiro do ExifIFD.
    out = await exifr.parse(head, {
      tiff: true,
      ifd0: true,
      exif: ["DateTimeOriginal", "OffsetTimeOriginal", "CreateDate"],
      gps: false,
      interop: false,
      thumbnail: false,
      xmp: false,
      iptc: false,
      icc: false,
      // Datas ficam como string: a conversão de fuso é nossa.
      reviveValues: false,
      translateKeys: true,
      chunked: false,
    });
  } catch {
    return undefined;
  }
  if (!out) return undefined;
  return exifDateToIso(out["DateTimeOriginal"] ?? out["CreateDate"], out["OffsetTimeOriginal"]);
}

export const readTakenAt: ReadTakenAt = async (file) => {
  try {
    const limit = isHeicLike({ name: file.name ?? "", type: file.type ?? "" })
      ? HEAD_BYTES_HEIC
      : HEAD_BYTES_DEFAULT;
    const head = await file.slice(0, limit).arrayBuffer();
    return await readTakenAtFrom(head);
  } catch {
    return undefined;
  }
};
