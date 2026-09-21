import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDataLayer } from "@/lib/data";
import type { SchoolEventInput, SchoolEventPatch } from "@/lib/data";
import { qk } from "@/lib/query-keys";
import { useAuth } from "@/hooks/use-auth";

/** Eventos da escola ativa. Sem escola a consulta não roda (estado vazio). */
export function useEvents() {
  const data = getDataLayer();
  const { session } = useAuth();
  const schoolId = session?.activeSchoolId;
  return useQuery({
    queryKey: qk.events(schoolId),
    queryFn: () => data.events.list(schoolId),
    enabled: Boolean(schoolId),
  });
}

export function useEvent(id: string | null) {
  const data = getDataLayer();
  return useQuery({
    queryKey: qk.event(id ?? ""),
    queryFn: () => data.events.get(id!),
    enabled: Boolean(id),
  });
}

/** `event_id` → fotos ativas, para a lista de eventos. */
export function useEventPhotoCounts() {
  const data = getDataLayer();
  const { session } = useAuth();
  const schoolId = session?.activeSchoolId;
  return useQuery({
    queryKey: qk.eventPhotoCounts(schoolId),
    queryFn: () => data.events.photoCounts(schoolId!),
    enabled: Boolean(schoolId),
  });
}

function useInvalidateEvents() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["events"] });
  };
}

export function useCreateEvent() {
  const data = getDataLayer();
  const invalidate = useInvalidateEvents();
  return useMutation({
    mutationFn: (input: SchoolEventInput) => data.events.create(input),
    onSuccess: invalidate,
  });
}

export function useUpdateEvent() {
  const data = getDataLayer();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: SchoolEventPatch }) =>
      data.events.update(id, patch),
    onSuccess: (updated) => {
      qc.setQueryData(qk.event(updated.id), updated);
      void qc.invalidateQueries({ queryKey: ["events"] });
    },
  });
}

/** Registra a declaração de direito de imagem (spec §9.2) e libera o upload. */
export function useDeclareImageRights() {
  const data = getDataLayer();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => data.events.declareImageRights(id),
    onSuccess: (updated) => {
      qc.setQueryData(qk.event(updated.id), updated);
      void qc.invalidateQueries({ queryKey: ["events"] });
    },
  });
}

export function useMoveEventToTrash() {
  const data = getDataLayer();
  const invalidate = useInvalidateEvents();
  return useMutation({
    mutationFn: (id: string) => data.events.moveToTrash(id),
    onSuccess: invalidate,
  });
}
