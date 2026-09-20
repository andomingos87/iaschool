import { useMemo, useState } from "react";
import { GraduationCap, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@workspace/iaschool-ui/components/ui/button";
import { Badge } from "@workspace/iaschool-ui/components/ui/badge";
import { Card, CardContent } from "@workspace/iaschool-ui/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/iaschool-ui/components/ui/dropdown-menu";
import { toast } from "@workspace/iaschool-ui/hooks/use-toast";
import { PageHeader } from "@/components/app-shell";
import { CardsSkeleton, EmptyState, ErrorState } from "@/components/data-state";
import { ClassFormDialog } from "@/components/class-form-dialog";
import { ConfirmDelete } from "@/components/confirm-delete";
import { useClasses, useDeleteClass } from "@/hooks/use-classes";
import { useStudents } from "@/hooks/use-students";
import { useAuth } from "@/hooks/use-auth";
import { GRADE_LABEL } from "@/lib/data";
import type { SchoolClass } from "@/lib/data";

/**
 * Salas da escola ativa (`classes`). A sala é a linha e a série é campo dela
 * (decisão #6 do M1). A turma alimenta o cadastro do aluno hoje e os eventos
 * de upload em massa no M2.
 */
export default function ClassesPage() {
  const { session } = useAuth();
  const classes = useClasses();
  const students = useStudents();
  const remove = useDeleteClass();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SchoolClass | null>(null);
  const [deleting, setDeleting] = useState<SchoolClass | null>(null);

  const hasSchool = Boolean(session?.activeSchoolId);

  /** Quantos alunos ativos há em cada sala. */
  const countByClass = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of students.data ?? []) {
      if (!s.classId) continue;
      map.set(s.classId, (map.get(s.classId) ?? 0) + 1);
    }
    return map;
  }, [students.data]);

  /** Alunos da escola ativa ainda sem turma — o que falta para fechar o ano. */
  const withoutClass = useMemo(
    () =>
      (students.data ?? []).filter(
        (s) => !s.classId && s.schoolId === session?.activeSchoolId,
      ).length,
    [students.data, session?.activeSchoolId],
  );

  /** Agrupa por ano letivo, do mais recente para o mais antigo. */
  const byYear = useMemo(() => {
    const groups = new Map<number, SchoolClass[]>();
    for (const c of classes.data ?? []) {
      const list = groups.get(c.schoolYear) ?? [];
      list.push(c);
      groups.set(c.schoolYear, list);
    }
    return [...groups.entries()].sort((a, b) => b[0] - a[0]);
  }, [classes.data]);

  function openNew() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(c: SchoolClass) {
    setEditing(c);
    setDialogOpen(true);
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await remove.mutateAsync(deleting.id);
      toast({
        title: "Turma excluída",
        description: "Os alunos dela ficaram sem turma; o cadastro continua.",
      });
      setDeleting(null);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Não foi possível excluir",
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Turmas"
        description="Salas da escola por ano letivo. Cada aluno pertence a uma sala."
        action={
          hasSchool ? (
            <Button onClick={openNew} data-testid="button-new-class">
              <Plus className="size-4" /> Nova turma
            </Button>
          ) : undefined
        }
      />

      {!hasSchool ? (
        <EmptyState
          icon={<GraduationCap className="size-6" />}
          title="Nenhuma escola selecionada"
          description="As turmas pertencem a uma escola. Selecione a escola no topo da tela, ou peça ao administrador para vincular sua conta a uma escola."
        />
      ) : classes.isError ? (
        <ErrorState onRetry={() => classes.refetch()} />
      ) : classes.isLoading ? (
        <CardsSkeleton />
      ) : (classes.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<GraduationCap className="size-6" />}
          title="Nenhuma turma cadastrada"
          description="Cadastre as salas do ano letivo para poder vincular os alunos e, depois, os eventos de fotos."
          action={
            <Button onClick={openNew} data-testid="button-new-class-empty">
              <Plus className="size-4" /> Nova turma
            </Button>
          }
        />
      ) : (
        <div className="space-y-8">
          {withoutClass > 0 && (
            <p
              className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
              data-testid="text-students-without-class"
            >
              {withoutClass === 1
                ? "1 aluno ainda está sem turma."
                : `${withoutClass} alunos ainda estão sem turma.`}{" "}
              Defina a turma na ficha do aluno.
            </p>
          )}

          {byYear.map(([year, list]) => (
            <section key={year} data-testid={`section-class-year-${year}`}>
              <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
                Ano letivo {year}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((c) => {
                  const count = countByClass.get(c.id) ?? 0;
                  return (
                    <Card
                      key={c.id}
                      className="border-border transition-colors hover:border-primary/50"
                      data-testid={`card-class-${c.id}`}
                    >
                      <CardContent className="flex items-start gap-3 p-4">
                        <div className="flex size-11 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
                          <GraduationCap className="size-5 text-muted-foreground" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p
                            className="truncate font-semibold"
                            data-testid={`text-class-name-${c.id}`}
                          >
                            {GRADE_LABEL[c.grade] ?? c.grade} · {c.name}
                          </p>
                          <Badge
                            variant="secondary"
                            className="mt-1.5"
                            data-testid={`badge-class-students-${c.id}`}
                          >
                            {count === 1 ? "1 aluno" : `${count} alunos`}
                          </Badge>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              data-testid={`button-menu-class-${c.id}`}
                            >
                              <MoreVertical className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => openEdit(c)}
                              data-testid={`button-edit-class-${c.id}`}
                            >
                              <Pencil className="size-4" /> Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setDeleting(c)}
                              className="text-destructive"
                              data-testid={`button-delete-class-${c.id}`}
                            >
                              <Trash2 className="size-4" /> Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <ClassFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        schoolClass={editing}
      />

      <ConfirmDelete
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Excluir turma?"
        description={
          deleting
            ? `${GRADE_LABEL[deleting.grade] ?? deleting.grade} · ${deleting.name} será removida. Os alunos vinculados ficam sem turma — nenhum cadastro é apagado.`
            : ""
        }
        onConfirm={() => void confirmDelete()}
        loading={remove.isPending}
      />
    </div>
  );
}
