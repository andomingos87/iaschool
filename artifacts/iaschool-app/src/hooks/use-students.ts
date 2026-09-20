import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDataLayer } from "@/lib/data";
import type { Student, StudentInput } from "@/lib/data";
import { qk } from "@/lib/query-keys";

export function useStudents() {
  const data = getDataLayer();
  return useQuery({ queryKey: qk.students, queryFn: () => data.students.list() });
}

/** Um aluno específico (página de detalhes). */
export function useStudent(id: string | null) {
  const data = getDataLayer();
  return useQuery({
    queryKey: qk.student(id ?? ""),
    queryFn: () => data.students.get(id!),
    enabled: !!id,
  });
}

/** Alunos na lixeira (a listagem também dispara o expurgo oportunista). */
export function useTrashedStudents(enabled = true) {
  const data = getDataLayer();
  return useQuery({
    queryKey: qk.studentsTrash,
    queryFn: () => data.students.listTrash(),
    enabled,
  });
}

function useInvalidateStudents() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: qk.students });
    void qc.invalidateQueries({ queryKey: qk.studentsTrash });
  };
}

export function useCreateStudent() {
  const data = getDataLayer();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: StudentInput) => data.students.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.students }),
  });
}

export function useUpdateStudent() {
  const data = getDataLayer();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Omit<Student, "id">> }) =>
      data.students.update(id, patch),
    onSuccess: (updated) => {
      void qc.invalidateQueries({ queryKey: qk.students });
      qc.setQueryData(qk.student(updated.id), updated);
    },
  });
}

/** Exclusão normal: move os alunos para a lixeira (30 dias). */
export function useMoveStudentsToTrash() {
  const data = getDataLayer();
  const invalidate = useInvalidateStudents();
  return useMutation({
    mutationFn: (ids: string[]) => data.students.moveToTrash(ids),
    onSuccess: invalidate,
  });
}

/** Devolve alunos da lixeira para a lista ativa. */
export function useRestoreStudents() {
  const data = getDataLayer();
  const invalidate = useInvalidateStudents();
  return useMutation({
    mutationFn: (ids: string[]) => data.students.restore(ids),
    onSuccess: invalidate,
  });
}

/** Exclusão definitiva: remove registro + fotos no Storage (super_admin). */
export function useDeleteStudentsPermanently() {
  const data = getDataLayer();
  const invalidate = useInvalidateStudents();
  return useMutation({
    mutationFn: (ids: string[]) => data.students.deletePermanently(ids),
    onSuccess: invalidate,
  });
}
