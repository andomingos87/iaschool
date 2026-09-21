import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getDataLayer } from "@/lib/data";
import type { Photo, SchoolEvent } from "@/lib/data";
import { qk } from "@/lib/query-keys";
import {
  createEventUploader,
  createHashPool,
  createIndexedDbQueueStore,
  createMemoryQueueStore,
  prepareForUpload,
  readTakenAt,
  type EventUploader,
  type UploadSnapshot,
} from "@/lib/upload";

/** Fotos recém-enviadas entram na galeria em lotes de 1 s, sem refazer a listagem. */
const APPEND_FLUSH_MS = 1_000;

/**
 * Um uploader por evento, vivo enquanto a tela estiver montada. Sair da tela
 * cancela o que ainda não começou; o que ficou pendente volta pela fila do
 * IndexedDB quando a pessoa arrastar a pasta de novo.
 */
export function useEventUpload(event: SchoolEvent | null | undefined) {
  const qc = useQueryClient();
  const eventId = event?.id ?? null;
  const schoolId = event?.schoolId ?? null;

  // A flag pode mudar com a tela aberta; o uploader lê pelo getter.
  const keepOriginalsRef = useRef(false);
  keepOriginalsRef.current = event?.keepOriginals ?? false;

  const uploaderRef = useRef<{ key: string; uploader: EventUploader; dispose: () => void } | null>(
    null,
  );

  const uploader = useMemo<EventUploader | null>(() => {
    if (!eventId || !schoolId) return null;
    const key = `${eventId}|${schoolId}`;
    if (uploaderRef.current?.key === key) return uploaderRef.current.uploader;
    uploaderRef.current?.dispose();
    const hash = createHashPool();
    const store = createIndexedDbQueueStore() ?? createMemoryQueueStore();

    // Fotos enviadas entram na lista já carregada, agrupadas por 1 s.
    let buffer: Photo[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const flushAppend = () => {
      flushTimer = null;
      if (buffer.length === 0) return;
      const add = buffer;
      buffer = [];
      qc.setQueryData<Photo[]>(qk.photos(eventId), (old) => {
        if (!old) return old;
        const known = new Set(old.map((p) => p.id));
        return [...old, ...add.filter((p) => !known.has(p.id))];
      });
    };

    const created = createEventUploader({
      eventId,
      schoolId,
      hash,
      prepare: prepareForUpload,
      readTakenAt,
      keepOriginals: () => keepOriginalsRef.current,
      onUploaded: (photo) => {
        buffer.push(photo);
        flushTimer ??= setTimeout(flushAppend, APPEND_FLUSH_MS);
      },
      repo: getDataLayer().photos,
      store,
    });
    uploaderRef.current = {
      key,
      uploader: created,
      dispose: () => {
        if (flushTimer) clearTimeout(flushTimer);
        created.dispose();
        hash.dispose();
      },
    };
    return created;
  }, [eventId, schoolId, qc]);

  useEffect(
    () => () => {
      uploaderRef.current?.dispose();
      uploaderRef.current = null;
    },
    [],
  );

  const snapshot = useSyncExternalStore<UploadSnapshot | null>(
    (cb) => (uploader ? uploader.subscribe(cb) : () => {}),
    () => (uploader ? uploader.getSnapshot() : null),
    () => null,
  );

  // Quando o envio termina, galeria, lote e contagem da lista precisam refletir.
  const wasRunning = useRef(false);
  useEffect(() => {
    const running = snapshot?.running ?? false;
    if (wasRunning.current && !running && eventId) {
      void qc.invalidateQueries({ queryKey: qk.photos(eventId) });
      void qc.invalidateQueries({ queryKey: qk.batch(eventId) });
      void qc.invalidateQueries({ queryKey: ["events"] });
    }
    wasRunning.current = running;
  }, [snapshot?.running, eventId, qc]);

  return { uploader, snapshot };
}
