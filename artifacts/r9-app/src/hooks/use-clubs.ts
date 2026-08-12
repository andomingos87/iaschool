import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDataLayer } from "@/lib/data";
import type { Club } from "@/lib/data";
import { qk } from "@/lib/query-keys";

export function useClubs() {
  const data = getDataLayer();
  return useQuery({ queryKey: qk.clubs, queryFn: () => data.clubs.list() });
}

export function useCreateClub() {
  const data = getDataLayer();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<Club, "id" | "createdAt" | "updatedAt">) =>
      data.clubs.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.clubs }),
  });
}

export function useUpdateClub() {
  const data = getDataLayer();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Omit<Club, "id">> }) =>
      data.clubs.update(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.clubs }),
  });
}

export function useDeleteClub() {
  const data = getDataLayer();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => data.clubs.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.clubs }),
  });
}
