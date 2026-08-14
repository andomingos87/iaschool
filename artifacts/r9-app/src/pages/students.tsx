import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Search,
  Users,
  MoreVertical,
  Pencil,
  Trash2,
  Phone,
  Shield,
  Link2,
  Link2Off,
} from "lucide-react";
import { Button } from "@workspace/iasport/components/ui/button";
import { Input } from "@workspace/iasport/components/ui/input";
import { Badge } from "@workspace/iasport/components/ui/badge";
import {
  Card,
  CardContent,
} from "@workspace/iasport/components/ui/card";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/iasport/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/iasport/components/ui/dropdown-menu";
import { toast } from "@workspace/iasport/hooks/use-toast";
import { PageHeader } from "@/components/app-shell";
import { CardsSkeleton, EmptyState, ErrorState } from "@/components/data-state";
import { StudentFormDialog } from "@/components/student-form-dialog";
import { ConfirmDelete } from "@/components/confirm-delete";
import { LinkStudentAccountDialog } from "@/components/link-student-account-dialog";
import { useStudents, useDeleteStudent } from "@/hooks/use-students";
import { useClubs } from "@/hooks/use-clubs";
import { getDataLayer } from "@/lib/data";
import type { LinkedStudentAccount, Student } from "@/lib/data";
import { qk } from "@/lib/query-keys";
import { ageFromIso, initials, storedToMasked } from "@/lib/format";

export default function StudentsPage() {
  const students = useStudents();
  const clubs = useClubs();
  const del = useDeleteStudent();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [toDelete, setToDelete] = useState<Student | null>(null);
  const [toLink, setToLink] = useState<Student | null>(null);
  const [toUnlink, setToUnlink] = useState<Student | null>(null);
  const queryClient = useQueryClient();

  // Contas de aluno já vinculadas — para mostrar o vínculo no card e
  // oferecer "Desvincular conta" quando houver.
  const linkedAccounts = useQuery({
    queryKey: qk.linkedStudentAccounts,
    queryFn: () => getDataLayer().approvals.listLinkedStudentAccounts(),
  });

  const linkedByStudentId = useMemo(() => {
    const map = new Map<string, LinkedStudentAccount>();
    for (const acc of linkedAccounts.data ?? []) {
      map.set(acc.studentRecordId, acc);
    }
    return map;
  }, [linkedAccounts.data]);

  const unlink = useMutation({
    mutationFn: (studentRecordId: string) =>
      getDataLayer().approvals.unlinkStudentAccount(studentRecordId),
    onSuccess: () => {
      toast({
        title: "Conta desvinculada",
        description: `${toUnlink?.name} não tem mais conta de aluno vinculada.`,
      });
      void queryClient.invalidateQueries({ queryKey: qk.linkedStudentAccounts });
      void queryClient.invalidateQueries({
        queryKey: qk.linkableStudentAccounts,
      });
      setToUnlink(null);
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        title: "Não foi possível desvincular",
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    },
  });

  const clubName = useMemo(() => {
    const map = new Map((clubs.data ?? []).map((c) => [c.id, c.name]));
    return (id?: string) => (id ? map.get(id) : undefined);
  }, [clubs.data]);

  const filtered = useMemo(() => {
    const list = students.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.position ?? "").toLowerCase().includes(q) ||
        (clubName(s.clubId) ?? "").toLowerCase().includes(q),
    );
  }, [students.data, search, clubName]);

  function openNew() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(s: Student) {
    setEditing(s);
    setDialogOpen(true);
  }

  async function confirmDelete() {
    if (!toDelete) return;
    try {
      await del.mutateAsync(toDelete.id);
      toast({ title: "Aluno excluído", description: toDelete.name });
      setToDelete(null);
    } catch {
      toast({ variant: "destructive", title: "Não foi possível excluir" });
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Alunos"
        description="Cadastre e gerencie os atletas da escolinha."
        action={
          <Button onClick={openNew} data-testid="button-new-student">
            <Plus className="size-4" /> Novo aluno
          </Button>
        }
      />

      <div className="mb-6 max-w-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, posição ou clube"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search-students"
          />
        </div>
      </div>

      {students.isError ? (
        <ErrorState onRetry={() => students.refetch()} />
      ) : students.isLoading ? (
        <CardsSkeleton />
      ) : (students.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<Users className="size-6" />}
          title="Nenhum aluno cadastrado"
          description="Comece cadastrando seu primeiro atleta para gerar posts com métricas."
          action={
            <Button onClick={openNew} data-testid="button-empty-new-student">
              <Plus className="size-4" /> Cadastrar aluno
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Search className="size-6" />}
          title="Nenhum resultado"
          description={`Nenhum aluno encontrado para "${search}".`}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => {
            const age = ageFromIso(s.birthDate);
            const photo = s.photos?.[0]?.url;
            const linked = linkedByStudentId.get(s.id);
            return (
              <Card
                key={s.id}
                className="border-border transition-colors hover:border-primary/50"
                data-testid={`card-student-${s.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Avatar className="size-12">
                      {photo && <AvatarImage src={photo} alt={s.name} />}
                      <AvatarFallback className="bg-muted text-sm">
                        {initials(s.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold" data-testid={`text-student-name-${s.id}`}>
                        {s.name}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {s.position && (
                          <Badge variant="secondary" className="text-[10px]">
                            {s.position}
                          </Badge>
                        )}
                        {age !== null && (
                          <span className="text-xs text-muted-foreground">
                            {age} anos
                          </span>
                        )}
                        {linked && (
                          <Badge
                            variant="outline"
                            className="gap-1 border-primary/40 text-[10px] text-primary"
                            data-testid={`badge-linked-${s.id}`}
                          >
                            <Link2 className="size-3" /> Conta vinculada
                          </Badge>
                        )}
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          data-testid={`button-menu-student-${s.id}`}
                        >
                          <MoreVertical className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => openEdit(s)}
                          data-testid={`button-edit-student-${s.id}`}
                        >
                          <Pencil className="size-4" /> Editar
                        </DropdownMenuItem>
                        {linked ? (
                          <DropdownMenuItem
                            onClick={() => setToUnlink(s)}
                            data-testid={`button-unlink-student-${s.id}`}
                          >
                            <Link2Off className="size-4" /> Desvincular conta
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onClick={() => setToLink(s)}
                            data-testid={`button-link-student-${s.id}`}
                          >
                            <Link2 className="size-4" /> Vincular conta de aluno
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setToDelete(s)}
                          data-testid={`button-delete-student-${s.id}`}
                        >
                          <Trash2 className="size-4" /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm text-muted-foreground">
                    <p className="flex items-center gap-2">
                      <Phone className="size-3.5" /> {storedToMasked(s.whatsapp)}
                    </p>
                    {clubName(s.clubId) && (
                      <p className="flex items-center gap-2">
                        <Shield className="size-3.5" /> {clubName(s.clubId)}
                      </p>
                    )}
                    {linked && (
                      <p
                        className="flex items-center gap-2"
                        data-testid={`text-linked-account-${s.id}`}
                      >
                        <Link2 className="size-3.5 text-primary" />
                        <span className="truncate">
                          Conta vinculada: {linked.email}
                        </span>
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <StudentFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        student={editing}
        clubs={clubs.data ?? []}
      />
      <LinkStudentAccountDialog
        student={toLink}
        onOpenChange={(o) => !o && setToLink(null)}
      />
      <ConfirmDelete
        open={!!toUnlink}
        onOpenChange={(o) => !o && setToUnlink(null)}
        title="Desvincular conta?"
        description={`A conta ${
          toUnlink ? linkedByStudentId.get(toUnlink.id)?.email ?? "" : ""
        } deixará de ver os dados de "${toUnlink?.name}". Você pode vincular outra conta depois.`}
        onConfirm={() => toUnlink && unlink.mutate(toUnlink.id)}
        loading={unlink.isPending}
      />
      <ConfirmDelete
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Excluir aluno?"
        description={`Isso removerá "${toDelete?.name}" permanentemente. Esta ação não pode ser desfeita.`}
        onConfirm={confirmDelete}
        loading={del.isPending}
      />
    </div>
  );
}
