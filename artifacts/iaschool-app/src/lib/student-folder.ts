// Pasta do aluno por evento e o conjunto que entra no ZIP (S03).
// A grade, a contagem e o pacote usam a mesma seleção. O ZIP não é gravado.

import { isoToBrDate } from "./format";
import { buildZip, safeZipName, uniqueNames, type ZipEntry } from "./zip";

export const ALL_EVENTS = "todos";
export const UNIDENTIFIED_EVENT_ID = "evento-nao-identificado";
export const UNIDENTIFIED_EVENT_LABEL = "Evento não identificado";
export const DOWNLOAD_ALL_LABEL = "Baixar todos os eventos";
export const DOWNLOAD_EVENT_LABEL = "Baixar fotos deste evento";
/** A URL do blob só é revogada depois que o navegador já leu o arquivo. */
export const DOWNLOAD_URL_RELEASE_MS = 60_000;

export interface FolderEventRef {
  id: string;
  name: string;
  /** ISO aaaa-mm-dd. */
  eventDate: string;
  schoolId: string;
}

export interface FolderPhotoRef {
  id: string;
  eventId?: string | null;
  storagePath: string;
  thumbPath?: string;
  takenAt?: string;
  createdAt: string;
  /** Ausente conta como confirmada. `false` é sugestão e fica de fora. */
  confirmed?: boolean;
  /** Escola da foto, quando a camada de dados souber. Outra escola fica de fora. */
  schoolId?: string;
}

export interface PhotoGroup {
  id: string;
  name: string;
  eventDate: string | null;
  photos: FolderPhotoRef[];
}

export interface ZipPlanItem {
  id: string;
  storagePath: string;
  name: string;
  date: string;
}

export type ZipFetchResult = {
  ok: boolean;
  status: number;
  bytes: Uint8Array;
};

export type ZipPackage = {
  blob: Blob;
  included: number;
  missing: number;
  processed: number;
  names: string[];
};

export type ZipRunResult =
  | { status: "busy" }
  | { status: "disabled" }
  | { status: "error"; included: 0; missing: number; processed: number }
  | ({ status: "partial" } & ZipPackage)
  | ({ status: "complete" } & ZipPackage);

function confirmed(photo: FolderPhotoRef): boolean {
  return photo.confirmed !== false;
}

function eventKey(photo: FolderPhotoRef): string {
  const id = photo.eventId?.trim() ?? "";
  return id;
}

/**
 * Agrupa fotos confirmadas pelo id do evento da escola da sessão.
 * Nome e data iguais não juntam eventos. Evento desta escola sem foto
 * confirmada permanece na seleção, com a lista vazia. Vínculo sem evento
 * desta escola cai em "Evento não identificado". Foto de outra escola ou
 * rosto não confirmado não entra. Evento de outra escola não entra.
 */
export function groupConfirmedPhotos(input: {
  photos: readonly FolderPhotoRef[];
  events: readonly FolderEventRef[];
  schoolId: string;
}): PhotoGroup[] {
  const ownEvents = input.events.filter((event) => event.schoolId === input.schoolId);
  const byId = new Map(ownEvents.map((event) => [event.id, event]));
  const foreignIds = new Set(
    input.events.filter((event) => event.schoolId !== input.schoolId).map((event) => event.id),
  );
  const groups = new Map<string, PhotoGroup>();
  const seen = new Set<string>();

  for (const photo of input.photos) {
    if (!confirmed(photo)) continue;
    if (photo.schoolId && photo.schoolId !== input.schoolId) continue;
    if (seen.has(photo.id)) continue;
    const key = eventKey(photo);
    if (key && foreignIds.has(key)) continue;
    seen.add(photo.id);
    const event = key ? byId.get(key) : undefined;
    const groupId = event ? event.id : UNIDENTIFIED_EVENT_ID;
    let group = groups.get(groupId);
    if (!group) {
      group = {
        id: groupId,
        name: event ? event.name : UNIDENTIFIED_EVENT_LABEL,
        eventDate: event ? event.eventDate : null,
        photos: [],
      };
      groups.set(groupId, group);
    }
    group.photos.push(photo);
  }

  for (const event of ownEvents) {
    if (groups.has(event.id)) continue;
    groups.set(event.id, {
      id: event.id,
      name: event.name,
      eventDate: event.eventDate,
      photos: [],
    });
  }

  return [...groups.values()].sort((a, b) => {
    if (a.id === UNIDENTIFIED_EVENT_ID) return 1;
    if (b.id === UNIDENTIFIED_EVENT_ID) return -1;
    const byDate = (b.eventDate ?? "").localeCompare(a.eventDate ?? "");
    if (byDate !== 0) return byDate;
    const byName = a.name.localeCompare(b.name, "pt-BR");
    if (byName !== 0) return byName;
    return a.id.localeCompare(b.id);
  });
}

export function photosForFilter(groups: readonly PhotoGroup[], filterId: string): FolderPhotoRef[] {
  if (filterId === ALL_EVENTS) return groups.flatMap((group) => group.photos);
  return groups.find((group) => group.id === filterId)?.photos ?? [];
}

export function downloadLabel(filterId: string): string {
  return filterId === ALL_EVENTS ? DOWNLOAD_ALL_LABEL : DOWNLOAD_EVENT_LABEL;
}

export function folderAccess(studentSchoolId: string, sessionSchoolId: string | null | undefined): "ok" | "denied" {
  if (!sessionSchoolId || studentSchoolId !== sessionSchoolId) return "denied";
  return "ok";
}

function folderLabel(group: PhotoGroup): string {
  if (group.id === UNIDENTIFIED_EVENT_ID) return UNIDENTIFIED_EVENT_LABEL;
  const date = group.eventDate ? isoToBrDate(group.eventDate) : "";
  const raw = date ? `${group.name} ${date}` : group.name;
  return safeZipName(raw, "evento");
}

/** Pastas por evento e nomes de arquivo únicos dentro de cada pasta. */
export function planZipNames(groups: readonly PhotoGroup[], photos: readonly FolderPhotoRef[]): ZipPlanItem[] {
  const selected = new Set(photos.map((photo) => photo.id));
  const usedGroups = groups.filter((group) => group.photos.some((photo) => selected.has(photo.id)));
  const folderNames = uniqueNames(usedGroups.map(folderLabel));
  const folderById = new Map(usedGroups.map((group, index) => [group.id, folderNames[index]!]));
  const byGroup = new Map<string, FolderPhotoRef[]>();
  for (const photo of photos) {
    const group = usedGroups.find((item) => item.photos.some((candidate) => candidate.id === photo.id));
    const groupId = group?.id ?? UNIDENTIFIED_EVENT_ID;
    const list = byGroup.get(groupId) ?? [];
    list.push(photo);
    byGroup.set(groupId, list);
  }
  const items: ZipPlanItem[] = [];
  for (const [groupId, list] of byGroup) {
    const folder = folderById.get(groupId) ?? safeZipName(UNIDENTIFIED_EVENT_LABEL, "evento");
    const fileNames = uniqueNames(
      list.map((photo) => {
        const when = (photo.takenAt ?? photo.createdAt).slice(0, 10);
        return safeZipName(`${when}_${photo.id.slice(0, 8)}.jpg`, `${photo.id}.jpg`);
      }),
    );
    list.forEach((photo, index) => {
      items.push({
        id: photo.id,
        storagePath: photo.storagePath,
        name: `${folder}/${fileNames[index]!}`,
        date: photo.takenAt ?? photo.createdAt,
      });
    });
  }
  return items;
}

/** JPEG, PNG, GIF ou WebP. HTML e corpo vazio não passam. */
export function isImageBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return true;
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return true;
  return (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

export function startBlobDownload(options: {
  blob: Blob;
  filename: string;
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
  click: (url: string, filename: string) => void;
  schedule: (fn: () => void, ms: number) => void;
}): void {
  const url = options.createObjectURL(options.blob);
  options.click(url, options.filename);
  options.schedule(() => options.revokeObjectURL(url), DOWNLOAD_URL_RELEASE_MS);
}

/**
 * Monta o ZIP do filtro. Um segundo chamado enquanto `running.current`
 * está ligado devolve `busy` sem buscar de novo. Zero foto válida não
 * gera arquivo.
 */
export async function runStudentZipDownload(args: {
  running: { current: boolean };
  photos: readonly FolderPhotoRef[];
  events: readonly FolderEventRef[];
  schoolId: string;
  filterId: string;
  signUrls: (paths: readonly string[]) => Promise<ReadonlyMap<string, string>>;
  fetchResponse: (url: string) => Promise<ZipFetchResult>;
  onProgress?: (processed: number, total: number) => void;
}): Promise<ZipRunResult> {
  if (args.running.current) return { status: "busy" };
  const groups = groupConfirmedPhotos({
    photos: args.photos,
    events: args.events,
    schoolId: args.schoolId,
  });
  const selected = photosForFilter(groups, args.filterId);
  if (selected.length === 0) return { status: "disabled" };

  args.running.current = true;
  try {
    const plan = planZipNames(groups, selected);
    const urls = await args.signUrls(plan.map((item) => item.storagePath));
    const entries: ZipEntry[] = [];
    const names: string[] = [];
    let processed = 0;
    for (const item of plan) {
      const url = urls.get(item.storagePath);
      if (url) {
        try {
          const response = await args.fetchResponse(url);
          if (response.ok && isImageBytes(response.bytes)) {
            entries.push({
              name: item.name,
              bytes: response.bytes,
              date: new Date(item.date),
            });
            names.push(item.name);
          }
        } catch {
          // Falha de rede: a foto entra na conta de faltantes, não no ZIP.
        }
      }
      processed += 1;
      args.onProgress?.(processed, plan.length);
    }
    const missing = plan.length - entries.length;
    if (entries.length === 0) {
      return { status: "error", included: 0, missing, processed };
    }
    const packed: ZipPackage = {
      blob: buildZip(entries),
      included: entries.length,
      missing,
      processed,
      names,
    };
    if (missing === 0) return { status: "complete", ...packed };
    return { status: "partial", ...packed };
  } finally {
    args.running.current = false;
  }
}
