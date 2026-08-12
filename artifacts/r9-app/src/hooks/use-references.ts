import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDataLayer } from "@/lib/data";
import type { ReferencePost } from "@/lib/data";
import { qk } from "@/lib/query-keys";

export function useReferences() {
  const data = getDataLayer();
  return useQuery({ queryKey: qk.references, queryFn: () => data.references.list() });
}

export function useCreateReference() {
  const data = getDataLayer();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<ReferencePost, "id" | "createdAt">) =>
      data.references.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.references }),
  });
}

export function useDeleteReference() {
  const data = getDataLayer();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => data.references.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.references }),
  });
}
