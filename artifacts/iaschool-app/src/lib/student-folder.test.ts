import { describe, expect, it } from "vitest";
import {
  ALL_EVENTS,
  DOWNLOAD_ALL_LABEL,
  DOWNLOAD_EVENT_LABEL,
  DOWNLOAD_URL_RELEASE_MS,
  UNIDENTIFIED_EVENT_ID,
  UNIDENTIFIED_EVENT_LABEL,
  downloadLabel,
  groupConfirmedPhotos,
  isImageBytes,
  photosForFilter,
  planZipNames,
  runStudentZipDownload,
  startBlobDownload,
  type FolderEventRef,
  type FolderPhotoRef,
} from "./student-folder";

const SCHOOL = "school-1";
const OTHER = "school-2";

function event(id: string, name: string, eventDate: string, schoolId = SCHOOL): FolderEventRef {
  return { id, name, eventDate, schoolId };
}

function photo(partial: Partial<FolderPhotoRef> & Pick<FolderPhotoRef, "id" | "eventId">): FolderPhotoRef {
  return {
    storagePath: `orig/${partial.id}.jpg`,
    createdAt: "2026-10-11T12:00:00.000Z",
    confirmed: true,
    schoolId: SCHOOL,
    ...partial,
  };
}

function jpeg(size = 32): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[2] = 0xff;
  bytes[3] = 0xd9;
  return bytes;
}

function html(): Uint8Array {
  return new TextEncoder().encode("<!DOCTYPE html><html><body>expirado</body></html>");
}

function u16(bytes: Uint8Array, at: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(at, true);
}

function u32(bytes: Uint8Array, at: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(at, true);
}

function zipNames(blob: Blob): Promise<string[]> {
  return blob.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    const names: string[] = [];
    let offset = 0;
    while (offset + 30 <= bytes.length) {
      if (u32(bytes, offset) !== 0x04034b50) break;
      const nameLen = u16(bytes, offset + 26);
      const extraLen = u16(bytes, offset + 28);
      const size = u32(bytes, offset + 18);
      names.push(new TextDecoder().decode(bytes.slice(offset + 30, offset + 30 + nameLen)));
      offset += 30 + nameLen + extraLen + size;
    }
    return names;
  });
}

const festaA = event("evt-a", "Festa Junina", "2026-10-11");
const festaB = event("evt-b", "Festa Junina", "2026-10-11");
const passeio = event("evt-c", "Passeio", "2026-09-01");

describe("groupConfirmedPhotos", () => {
  it("separa eventos de mesmo nome e mesma data pelo id e não usa a data da foto", () => {
    const groups = groupConfirmedPhotos({
      schoolId: SCHOOL,
      events: [festaA, festaB, passeio],
      photos: [
        photo({ id: "p1", eventId: "evt-b", takenAt: "2026-09-01T08:00:00.000Z" }),
        photo({ id: "p2", eventId: "evt-a", takenAt: "2026-09-01T08:00:00.000Z" }),
        photo({ id: "p3", eventId: "evt-a", takenAt: "2026-01-01T08:00:00.000Z" }),
        photo({ id: "p1", eventId: "evt-a" }),
      ],
    });
    expect(groups.map((group) => group.id)).toEqual(["evt-a", "evt-b", "evt-c"]);
    expect(groups[0]!.photos.map((item) => item.id)).toEqual(["p2", "p3"]);
    expect(groups[1]!.photos.map((item) => item.id)).toEqual(["p1"]);
    expect(groups[2]).toMatchObject({ name: "Passeio", eventDate: "2026-09-01", photos: [] });
    expect(groups[0]!.name).toBe("Festa Junina");
    expect(groups[1]!.name).toBe("Festa Junina");
    expect(groups[0]!.eventDate).toBe("2026-10-11");

    const all = photosForFilter(groups, ALL_EVENTS);
    expect(all).toHaveLength(3);
    expect(photosForFilter(groups, "evt-b").map((item) => item.id)).toEqual(["p1"]);
    expect(photosForFilter(groups, "evt-c")).toEqual([]);
    expect(downloadLabel(ALL_EVENTS)).toBe(DOWNLOAD_ALL_LABEL);
    expect(downloadLabel("evt-a")).toBe(DOWNLOAD_EVENT_LABEL);
  });

  it("mantém o evento da escola sem foto confirmada na seleção e exclui o de outra escola", () => {
    const groups = groupConfirmedPhotos({
      schoolId: SCHOOL,
      events: [festaA, passeio, event("evt-x", "Outra escola", "2026-08-01", OTHER)],
      photos: [photo({ id: "p1", eventId: "evt-a" })],
    });
    expect(groups.map((group) => group.id)).toEqual(["evt-a", "evt-c"]);
    expect(groups.find((group) => group.id === "evt-c")).toEqual({
      id: "evt-c",
      name: "Passeio",
      eventDate: "2026-09-01",
      photos: [],
    });
    expect(groups.some((group) => group.id === "evt-x")).toBe(false);
    expect(photosForFilter(groups, "evt-c")).toEqual([]);
    expect(photosForFilter(groups, ALL_EVENTS).map((item) => item.id)).toEqual(["p1"]);
  });

  it("manda vínculo inutilizável para evento não identificado e exclui outro contexto e sugestão", () => {
    const groups = groupConfirmedPhotos({
      schoolId: SCHOOL,
      events: [festaA, event("evt-x", "Outra escola", "2026-10-11", OTHER)],
      photos: [
        photo({ id: "ok", eventId: "evt-a" }),
        photo({ id: "sem-evento", eventId: null }),
        photo({ id: "vazio", eventId: "  " }),
        photo({ id: "sumiu", eventId: "evt-apagado" }),
        photo({ id: "outra-escola", eventId: "evt-a", schoolId: OTHER }),
        photo({ id: "evento-alheio", eventId: "evt-x", schoolId: SCHOOL }),
        photo({ id: "sugestao", eventId: "evt-a", confirmed: false }),
      ],
    });
    expect(groups.map((group) => group.id)).toEqual(["evt-a", UNIDENTIFIED_EVENT_ID]);
    expect(groups.find((group) => group.id === "evt-a")!.photos.map((item) => item.id)).toEqual(["ok"]);
    const lost = groups.find((group) => group.id === UNIDENTIFIED_EVENT_ID)!;
    expect(lost.name).toBe(UNIDENTIFIED_EVENT_LABEL);
    expect(lost.eventDate).toBeNull();
    expect(lost.photos.map((item) => item.id)).toEqual(["sem-evento", "vazio", "sumiu"]);
    expect(groups.some((group) => group.photos.some((item) => item.id === "sugestao"))).toBe(false);
    expect(groups.some((group) => group.photos.some((item) => item.schoolId === OTHER))).toBe(false);
  });
});

describe("runStudentZipDownload", () => {
  const events = [festaA, festaB];
  const photos = [
    photo({ id: "aaaaaaaa-1", eventId: "evt-a" }),
    photo({ id: "aaaaaaaa-2", eventId: "evt-a" }),
    photo({ id: "bbbbbbbb-1", eventId: "evt-b" }),
  ];

  function urlsFor(list: readonly FolderPhotoRef[]) {
    return new Map(list.map((item) => [item.storagePath, `https://files.test/${item.id}`]));
  }

  it("o filtro vira o pacote, com pastas desambiguadas e só bytes de imagem", async () => {
    const running = { current: false };
    const result = await runStudentZipDownload({
      running,
      photos,
      events,
      schoolId: SCHOOL,
      filterId: "evt-a",
      signUrls: async (paths) => {
        expect([...paths]).toEqual(["orig/aaaaaaaa-1.jpg", "orig/aaaaaaaa-2.jpg"]);
        return urlsFor(photos);
      },
      fetchResponse: async () => ({ ok: true, status: 200, bytes: jpeg() }),
    });
    expect(result.status).toBe("complete");
    if (result.status !== "complete") return;
    expect(result.included).toBe(2);
    expect(result.missing).toBe(0);
    expect(result.names.every((name) => name.startsWith("Festa Junina 11-10-2026/"))).toBe(true);
    expect(await zipNames(result.blob)).toEqual(result.names);
    expect(running.current).toBe(false);
  });

  it("nomes iguais de eventos diferentes não colidem e o ZIP de todos traz os dois", async () => {
    const running = { current: false };
    const result = await runStudentZipDownload({
      running,
      photos,
      events,
      schoolId: SCHOOL,
      filterId: ALL_EVENTS,
      signUrls: async () => urlsFor(photos),
      fetchResponse: async () => ({ ok: true, status: 200, bytes: jpeg() }),
    });
    expect(result.status).toBe("complete");
    if (result.status !== "complete") return;
    expect(result.included).toBe(3);
    const folders = new Set(result.names.map((name) => name.split("/")[0]));
    expect(folders).toEqual(new Set(["Festa Junina 11-10-2026", "Festa Junina 11-10-2026 (2)"]));
    expect(new Set(result.names).size).toBe(result.names.length);
  });

  it("HTML 200, erro HTTP e falha de rede não viram imagem; parcial não se diz completo", async () => {
    const running = { current: false };
    const progress: number[] = [];
    const result = await runStudentZipDownload({
      running,
      photos,
      events,
      schoolId: SCHOOL,
      filterId: ALL_EVENTS,
      signUrls: async () => urlsFor(photos),
      fetchResponse: async (url) => {
        if (url.endsWith("aaaaaaaa-1")) return { ok: true, status: 200, bytes: html() };
        if (url.endsWith("aaaaaaaa-2")) return { ok: false, status: 403, bytes: jpeg() };
        throw new Error("rede");
      },
      onProgress: (processed) => progress.push(processed),
    });
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.included).toBe(0);
    expect(result.missing).toBe(3);
    expect(progress).toEqual([1, 2, 3]);
    expect("blob" in result).toBe(false);
  });

  it("pacote parcial informa faltantes e um segundo clique não baixa de novo", async () => {
    const running = { current: false };
    let fetches = 0;
    let release!: (value: ReadonlyMap<string, string>) => void;
    const gate = new Promise<ReadonlyMap<string, string>>((resolve) => {
      release = resolve;
    });
    const first = runStudentZipDownload({
      running,
      photos: photos.slice(0, 2),
      events,
      schoolId: SCHOOL,
      filterId: "evt-a",
      signUrls: () => gate,
      fetchResponse: async (url) => {
        fetches += 1;
        if (url.endsWith("aaaaaaaa-2")) return { ok: false, status: 500, bytes: new Uint8Array() };
        return { ok: true, status: 200, bytes: jpeg() };
      },
    });
    const second = await runStudentZipDownload({
      running,
      photos,
      events,
      schoolId: SCHOOL,
      filterId: ALL_EVENTS,
      signUrls: async () => urlsFor(photos),
      fetchResponse: async () => ({ ok: true, status: 200, bytes: jpeg() }),
    });
    expect(second.status).toBe("busy");
    expect(fetches).toBe(0);
    release(urlsFor(photos));
    const done = await first;
    expect(done.status).toBe("partial");
    if (done.status !== "partial") return;
    expect(done.included).toBe(1);
    expect(done.missing).toBe(1);
    expect(fetches).toBe(2);
    expect(running.current).toBe(false);
  });

  it("zero fotos não gera ZIP e cinquenta imagens sintéticas cabem no mesmo caminho", async () => {
    const idle = { current: false };
    const empty = await runStudentZipDownload({
      running: idle,
      photos: [photo({ id: "sugestao", eventId: "evt-a", confirmed: false })],
      events,
      schoolId: SCHOOL,
      filterId: ALL_EVENTS,
      signUrls: async () => { throw new Error("não devia assinar"); },
      fetchResponse: async () => { throw new Error("não devia baixar"); },
    });
    expect(empty.status).toBe("disabled");

    const many = Array.from({ length: 50 }, (_, index) =>
      photo({ id: `foto-${index.toString().padStart(4, "0")}`, eventId: index < 25 ? "evt-a" : "evt-b" }),
    );
    const started = performance.now();
    const result = await runStudentZipDownload({
      running: { current: false },
      photos: many,
      events,
      schoolId: SCHOOL,
      filterId: ALL_EVENTS,
      signUrls: async () => urlsFor(many),
      fetchResponse: async () => ({ ok: true, status: 200, bytes: jpeg(64) }),
    });
    const elapsed = performance.now() - started;
    expect(result.status).toBe("complete");
    if (result.status !== "complete") return;
    expect(result.included).toBe(50);
    expect(result.names).toHaveLength(50);
    expect(new Set(result.names).size).toBe(50);
    expect(elapsed).toBeLessThan(5_000);
    expect(isImageBytes(html())).toBe(false);
    expect(isImageBytes(jpeg())).toBe(true);
    expect(isImageBytes(new Uint8Array())).toBe(false);
  });
});

describe("planZipNames", () => {
  it("desambigua arquivo repetido dentro da pasta", () => {
    const groups = groupConfirmedPhotos({
      schoolId: SCHOOL,
      events: [festaA],
      photos: [
        photo({ id: "abcd1234-1", eventId: "evt-a", takenAt: "2026-10-11T01:00:00.000Z" }),
        photo({ id: "abcd1234-2", eventId: "evt-a", takenAt: "2026-10-11T02:00:00.000Z" }),
      ],
    });
    const names = planZipNames(groups, groups[0]!.photos).map((item) => item.name);
    expect(names[0]).not.toBe(names[1]);
    expect(names[1]).toContain("(2)");
  });
});

describe("startBlobDownload", () => {
  it("revoga a URL só depois do clique, no prazo que não corta a transferência", () => {
    const order: string[] = [];
    let scheduled: (() => void) | null = null;
    startBlobDownload({
      blob: new Blob(["zip"]),
      filename: "aluno - fotos.zip",
      createObjectURL: () => "blob:foto",
      revokeObjectURL: (url) => order.push(`revoke:${url}`),
      click: (url, filename) => order.push(`click:${url}:${filename}`),
      schedule: (fn, ms) => {
        expect(ms).toBe(DOWNLOAD_URL_RELEASE_MS);
        scheduled = fn;
      },
    });
    expect(order).toEqual(["click:blob:foto:aluno - fotos.zip"]);
    scheduled!();
    expect(order).toEqual(["click:blob:foto:aluno - fotos.zip", "revoke:blob:foto"]);
  });
});
