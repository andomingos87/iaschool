import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { classLabel, getDataLayer } from "@/lib/data";
import type { SchoolClass, SchoolClassInput } from "@/lib/data";
import { qk } from "@/lib/query-keys";
import { useAuth } from "@/hooks/use-auth";

/**
 * Salas da escola ativa, ou de `overrideSchoolId` (ficha de um aluno de outra
 * escola). Sem escola nenhuma a consulta não roda: a tela mostra o estado
 * vazio em vez de listar tudo.
 */
export function useClasses(overrideSchoolId?: string) {
  const data = getDataLayer();
  const { session } = useAuth();
  const schoolId = overrideSchoolId ?? session?.activeSchoolId;
  return useQuery({
    queryKey: qk.classes(schoolId),
    queryFn: () => data.classes.list(schoolId),
    enabled: Boolean(schoolId),
  });
}

/**
 * Mapa id → rótulo de todas as turmas visíveis (todas as escolas da pessoa),
 * para traduzir `student.classId` em listas e fichas.
 */
export function useClassLabels() {
  const data = getDataLayer();
  const { data: classes } = useQuery({
    queryKey: qk.classes(),
    queryFn: () => data.classes.list(),
  });
  return useMemo(() => {
    const map = new Map<string, string>();
    for (const c of classes ?? []) map.set(c.id, classLabel(c));
    return map;
  }, [classes]);
}

function useInvalidateClasses() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["classes"] });
    // A turma aparece na ficha e na lista de alunos.
    void qc.invalidateQueries({ queryKey: qk.students });
  };
}

export function useCreateClass() {
  const data = getDataLayer();
  const invalidate = useInvalidateClasses();
  return useMutation({
    mutationFn: (input: SchoolClassInput) => data.classes.create(input),
    onSuccess: invalidate,
  });
}

export function useUpdateClass() {
  const data = getDataLayer();
  const invalidate = useInvalidateClasses();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Omit<SchoolClass, "id" | "schoolId">>;
    }) => data.classes.update(id, patch),
    onSuccess: invalidate,
  });
}

export function useDeleteClass() {
  const data = getDataLayer();
  const invalidate = useInvalidateClasses();
  return useMutation({
    mutationFn: (id: string) => data.classes.delete(id),
    onSuccess: invalidate,
  });
}
