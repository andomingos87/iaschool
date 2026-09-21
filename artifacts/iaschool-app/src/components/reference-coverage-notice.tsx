import { useMemo } from "react";
import { UserX } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@workspace/iaschool-ui/components/ui/alert";
import { useStudents } from "@/hooks/use-students";
import { useBiometricReadiness } from "@/hooks/use-reference-faces";
import { useAuth } from "@/hooks/use-auth";

/**
 * "N alunos desta turma estão sem referência; as fotos deles vão para a fila
 * manual" (spec §10). Avisa, não bloqueia.
 *
 * Desde o M4 a conta subtrai quem já tem rosto de referência processado
 * (`student_biometric_readiness`). Foto na fila ainda não conta como
 * referência: só vira uma quando o motor facial gera o vetor.
 */
export function ReferenceCoverageNotice({ classId }: { classId?: string }) {
  const { session } = useAuth();
  const students = useStudents();
  const readiness = useBiometricReadiness(session?.activeSchoolId);

  const count = useMemo(() => {
    const schoolId = session?.activeSchoolId;
    return (students.data ?? []).filter((s) => {
      if (s.schoolId !== schoolId) return false;
      if (classId && s.classId !== classId) return false;
      return (readiness.data?.get(s.id)?.referenceCount ?? 0) === 0;
    }).length;
  }, [students.data, readiness.data, session?.activeSchoolId, classId]);

  if (!students.data || count === 0) return null;

  const scope = classId ? "desta turma" : "da escola";
  return (
    <Alert data-testid="alert-reference-coverage">
      <UserX className="size-4" />
      <AlertTitle>
        {count === 1 ? `1 aluno ${scope} está` : `${count} alunos ${scope} estão`} sem rosto de referência
      </AlertTitle>
      <AlertDescription>
        As fotos em que eles aparecerem vão para a fila manual de revisão. Cadastre o rosto de
        referência na ficha do aluno; o upload não fica bloqueado por isso.
      </AlertDescription>
    </Alert>
  );
}
