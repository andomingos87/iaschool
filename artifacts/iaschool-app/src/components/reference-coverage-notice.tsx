import { useMemo } from "react";
import { UserX } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@workspace/iaschool-ui/components/ui/alert";
import { useStudents } from "@/hooks/use-students";
import { useAuth } from "@/hooks/use-auth";

/**
 * "N alunos desta turma estão sem referência; as fotos deles vão para a fila
 * manual" (spec §10). Avisa, não bloqueia.
 *
 * Até o M4 não existe `student_reference_faces`, então nenhum aluno tem rosto
 * de referência: o aviso conta todos os alunos ativos da turma (ou da escola,
 * quando o evento não tem turma). Quando a tabela chegar, este componente
 * passa a subtrair quem já tem referência — o texto não muda.
 */
export function ReferenceCoverageNotice({ classId }: { classId?: string }) {
  const { session } = useAuth();
  const students = useStudents();

  const count = useMemo(() => {
    const schoolId = session?.activeSchoolId;
    return (students.data ?? []).filter(
      (s) => s.schoolId === schoolId && (!classId || s.classId === classId),
    ).length;
  }, [students.data, session?.activeSchoolId, classId]);

  if (!students.data || count === 0) return null;

  const scope = classId ? "desta turma" : "da escola";
  return (
    <Alert data-testid="alert-reference-coverage">
      <UserX className="size-4" />
      <AlertTitle>
        {count === 1 ? `1 aluno ${scope} está` : `${count} alunos ${scope} estão`} sem rosto de referência
      </AlertTitle>
      <AlertDescription>
        As fotos em que eles aparecerem vão para a fila manual de revisão. O cadastro do rosto de
        referência chega na próxima fase; o upload não fica bloqueado por isso.
      </AlertDescription>
    </Alert>
  );
}
