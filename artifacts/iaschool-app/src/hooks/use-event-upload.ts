import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getDataLayer } from "@/lib/data";
import type { SchoolEvent } from "@/lib/data";
import { qk } from "@/lib/query-keys";
import {
  createEventUploader,
  createHashPool,
  createIndexedDbQueueStore,
  createMemoryQueueStore,
  prepareForUpload,
  type EventUploader,
  type UploadSnapshot,
} from "@/lib/upload";

/**
 * Um uploader por evento, vivo enquanto a tela estiver montada. Sair da tela
 * cancela o que ainda não começou; o que ficou pendente volta pela fila do
 * IndexedDB quando a pessoa arrastar a pasta de novo.
 */
export function useEventUpload(event: SchoolEvent | null | undefined) {
  const qc = useQueryClient();
  const eventId = event?.id ?? null;
  const schoolId = event?.schoolId ?? null;

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
    const created = createEventUploader({
      eventId,
      schoolId,
      hash,
      prepare: prepareForUpload,
      repo: getDataLayer().photos,
      store,
    });
    uploaderRef.current = {
      key,
      uploader: created,
      dispose: () => {
        created.dispose();
        hash.dispose();
      },
    };
    return created;
  }, [eventId, schoolId]);

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

  // Quando o lote termina, a galeria e a contagem da lista precisam refletir.
  const wasRunning = useRef(false);
  useEffect(() => {
    const running = snapshot?.running ?? false;
    if (wasRunning.current && !running && eventId) {
      void qc.invalidateQueries({ queryKey: qk.photos(eventId) });
      void qc.invalidateQueries({ queryKey: ["events"] });
    }
    wasRunning.current = running;
  }, [snapshot?.running, eventId, qc]);

  // Enquanto sobe, atualiza a galeria a cada 2 s para mostrar as fotos chegando.
  useEffect(() => {
    if (!snapshot?.running || !eventId) return;
    const t = setInterval(() => {
      void qc.invalidateQueries({ queryKey: qk.photos(eventId) });
    }, 2_000);
    return () => clearInterval(t);
  }, [snapshot?.running, eventId, qc]);

  return { uploader, snapshot };
}
