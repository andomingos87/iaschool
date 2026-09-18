import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDataLayer } from "@/lib/data";
import type { SchoolBrand } from "@/lib/data";
import { qk } from "@/lib/query-keys";

export function useSchoolBrands() {
  const data = getDataLayer();
  return useQuery({ queryKey: qk.schoolBrands, queryFn: () => data.schoolBrands.list() });
}

export function useCreateSchoolBrand() {
  const data = getDataLayer();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<SchoolBrand, "id" | "createdAt" | "updatedAt">) =>
      data.schoolBrands.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.schoolBrands }),
  });
}

export function useUpdateSchoolBrand() {
  const data = getDataLayer();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Omit<SchoolBrand, "id">> }) =>
      data.schoolBrands.update(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.schoolBrands }),
  });
}

export function useDeleteSchoolBrand() {
  const data = getDataLayer();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => data.schoolBrands.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.schoolBrands }),
  });
}
