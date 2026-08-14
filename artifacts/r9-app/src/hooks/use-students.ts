import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDataLayer } from "@/lib/data";
import type { Student } from "@/lib/data";
import { qk } from "@/lib/query-keys";

export function useStudents() {
  const data = getDataLayer();
  return useQuery({ queryKey: qk.students, queryFn: () => data.students.list() });
}

/** IDs dos registros de students que já têm conta de aluno vinculada. */
export function useLinkedStudentRecordIds() {
  const data = getDataLayer();
  return useQuery({
    queryKey: qk.linkedStudentRecordIds,
    queryFn: () => data.approvals.listLinkedStudentRecordIds(),
  });
}

export function useCreateStudent() {
  const data = getDataLayer();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<Student, "id" | "createdAt" | "updatedAt">) =>
      data.students.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.students }),
  });
}

export function useUpdateStudent() {
  const data = getDataLayer();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Omit<Student, "id">> }) =>
      data.students.update(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.students }),
  });
}

export function useDeleteStudent() {
  const data = getDataLayer();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => data.students.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.students }),
  });
}
