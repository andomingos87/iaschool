import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArchiveRestore,
  CheckSquare,
  LayoutGrid,
  List,
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
  X,
} from "lucide-react";
import { Button } from "@workspace/iasport/components/ui/button";
import { Input } from "@workspace/iasport/components/ui/input";
import { Badge } from "@workspace/iasport/components/ui/badge";
import { Checkbox } from "@workspace/iasport/components/ui/checkbox";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/iasport/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/iasport/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/iasport/components/ui/alert-dialog";
import {
  RadioGroup,
  RadioGroupItem,
} from "@workspace/iasport/components/ui/radio-group";
import { Label } from "@workspace/iasport/components/ui/label";
import { toast } from "@workspace/iasport/hooks/use-toast";
import { PageHeader } from "@/components/app-shell";
import { CardsSkeleton, EmptyState, ErrorState } from "@/components/data-state";
import { StudentFormDialog } from "@/components/student-form-dialog";
import { ConfirmDelete } from "@/components/confirm-delete";
import { LinkStudentAccountDialog } from "@/components/link-student-account-dialog";
import {
  useStudents,
  useTrashedStudents,
  useMoveStudentsToTrash,
  useRestoreStudents,
  useDeleteStudentsPermanently,
} from "@/hooks/use-students";
import { useClubs } from "@/hooks/use-clubs";
import { useAuth } from "@/hooks/use-auth";
import { getDataLayer } from "@/lib/data";
import type { LinkedStudentAccount, Student } from "@/lib/data";
import { TRASH_RETENTION_DAYS } from "@/lib/data";
import { qk } from "@/lib/query-keys";
import { ageFromIso, initials, storedToMasked } from "@/lib/format";

type ViewMode = "cards" | "list";
type DeleteMode = "trash" | "permanent";

const VIEW_MODE_KEY = "r9:students-view-mode";

function readViewMode(): ViewMode {
  try {
    return localStorage.getItem(VIEW_MODE_KEY) === "list" ? "list" : "cards";
  } catch {
    return "cards";
  }
}

/** Dias restantes até o expurgo definitivo de um item da lixeira. */
function daysLeft(deletedAt: string): number {
  const expires =
    new Date(deletedAt).getTime() + TRASH_RETENTION_DAYS * 24 * 3600 * 1000;
  return Math.max(0, Math.ceil((expires - Date.now()) / (24 * 3600 * 1000)));
}

export default function StudentsPage() {
  const { session } = useAuth();
  const isAdmin = session?.user.role === "super_admin";
  const [, navigate] = useLocation();

  const students = useStudents();
  const clubs = useClubs();
  const [tab, setTab] = useState<"active" | "trash">("active");
  const trashed = useTrashedStudents(tab === "trash");
  const moveToTrash = useMoveStudentsToTrash();
  const restore = useRestoreStudents();
  const deletePermanently = useDeleteStudentsPermanently();

  const [view, setView] = useState<ViewMode>(readViewMode);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [toLink, setToLink] = useState<Student | null>(null);
  const [toUnlink, setToUnlink] = useState<Student | null>(null);
  const queryClient = useQueryClient();

  // Seleção em massa (lista ativa e lixeira).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState<DeleteMode>("trash");
  // ids alvo do diálogo de exclusão (seleção em massa OU um aluno específico)
  const [deleteTargets, setDeleteTargets] = useState<string[]>([]);
  const [restoreConfirm, setRestoreConfirm] = useState(false);

  function changeView(next: ViewMode) {
    setView(next);
    try {
      localStorage.setItem(VIEW_MODE_KEY, next);
    } catch {
      // preferência não persistida — segue funcionando na sessão atual
    }
  }

  // Contas de aluno já vinculadas — para mostrar o vínculo e
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

  const activeList = students.data ?? [];
  const trashList = trashed.data ?? [];
  const items = tab === "active" ? activeList : trashList;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.position ?? "").toLowerCase().includes(q) ||
        (clubName(s.clubId) ?? "").toLowerCase().includes(q),
    );
  }, [items, search, clubName]);

  const allSelected =
    filtered.length > 0 && filtered.every((s) => selected.has(s.id));
  const busy =
    moveToTrash.isPending || restore.isPending || deletePermanently.isPending;

  function changeTab(next: string) {
    setTab(next as "active" | "trash");
    setSelected(new Set());
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(
      allSelected ? new Set() : new Set(filtered.map((s) => s.id)),
    );
  }

  function openNew() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(s: Student) {
    setEditing(s);
    setDialogOpen(true);
  }

  function openDeleteDialog(ids: string[]) {
    setDeleteTargets(ids);
    // Na lixeira só existe exclusão definitiva; na lista ativa, escola usa a
    // lixeira e o admin escolhe no diálogo.
    setDeleteMode(tab === "trash" ? "permanent" : "trash");
    setConfirmOpen(true);
  }

  async function confirmDelete() {
    const ids = deleteTargets;
    setConfirmOpen(false);
    try {
      if (deleteMode === "permanent") {
        await deletePermanently.mutateAsync(ids);
        toast({
          title: "Exclusão concluída",
          description: `${ids.length} aluno(s) excluído(s) definitivamente.`,
        });
      } else {
        await moveToTrash.mutateAsync(ids);
        toast({
          title: "Movido para a lixeira",
          description: `${ids.length} aluno(s) na lixeira por ${TRASH_RETENTION_DAYS} dias. Você pode restaurar na aba Lixeira.`,
        });
      }
      setSelected(new Set());
      setDeleteTargets([]);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Não foi possível excluir",
        description:
          err instanceof Error ? err.message : "Tente novamente em instantes.",
      });
    }
  }

  async function confirmRestore() {
    const ids = [...selected];
    setRestoreConfirm(false);
    try {
      await restore.mutateAsync(ids);
      toast({
        title: "Alunos restaurados",
        description: `${ids.length} aluno(s) de volta à lista.`,
      });
      setSelected(new Set());
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Não foi possível restaurar",
        description:
          err instanceof Error ? err.message : "Tente novamente em instantes.",
      });
    }
  }

  const permanentWarning =
    "Esta ação não pode ser desfeita: o registro e as fotos do aluno serão removidos para sempre.";

  function openDetails(s: Student) {
    navigate(`/alunos/${s.id}`);
  }

  // ---------- renderização ----------

  function renderCards(list: Student[], isTrash: boolean) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((s) => {
          const age = ageFromIso(s.birthDate);
          const photo = s.photos?.[0]?.url;
          const linked = linkedByStudentId.get(s.id);
          const isSelected = selected.has(s.id);
          return (
            <Card
              key={s.id}
              className={`cursor-pointer border-border transition-colors hover:border-primary/50 ${
                isSelected ? "border-primary ring-2 ring-primary/40" : ""
              }`}
              onClick={() => (isTrash ? toggle(s.id) : openDetails(s))}
              data-testid={`card-student-${s.id}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {(isTrash || selected.size > 0) && (
                    <span
                      onClick={(e) => e.stopPropagation()}
                      className="pt-1"
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggle(s.id)}
                        aria-label={`Selecionar ${s.name}`}
                        data-testid={`checkbox-select-student-${s.id}`}
                      />
                    </span>
                  )}
                  <Avatar className="size-12">
                    {photo && (
                      <AvatarImage
                        src={photo}
                        alt={s.name}
                        className="object-cover"
                      />
                    )}
                    <AvatarFallback className="bg-muted text-sm">
                      {initials(s.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate font-semibold"
                      data-testid={`text-student-name-${s.id}`}
                    >
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
                      {isTrash && s.deletedAt ? (
                        <Badge
                          variant="secondary"
                          className="text-[10px]"
                          data-testid={`badge-days-left-${s.id}`}
                        >
                          {daysLeft(s.deletedAt)}d restantes
                        </Badge>
                      ) : (
                        linked && (
                          <Badge
                            variant="outline"
                            className="gap-1 border-primary/40 text-[10px] text-primary"
                            data-testid={`badge-linked-${s.id}`}
                          >
                            <Link2 className="size-3" /> Conta vinculada
                          </Badge>
                        )
                      )}
                    </div>
                  </div>
                  {!isTrash && (
                    <span onClick={(e) => e.stopPropagation()}>
                      <StudentMenu
                        student={s}
                        linked={!!linked}
                        onEdit={() => openEdit(s)}
                        onLink={() => setToLink(s)}
                        onUnlink={() => setToUnlink(s)}
                        onDelete={() => openDeleteDialog([s.id])}
                        onSelect={() => toggle(s.id)}
                      />
                    </span>
                  )}
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
                  {linked && !isTrash && (
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
    );
  }

  function renderTable(list: Student[], isTrash: boolean) {
    return (
      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Selecionar todos"
                  data-testid="checkbox-select-all"
                />
              </TableHead>
              <TableHead>Aluno</TableHead>
              <TableHead className="hidden sm:table-cell">Posição</TableHead>
              <TableHead className="hidden md:table-cell">Clube</TableHead>
              <TableHead className="hidden lg:table-cell">WhatsApp</TableHead>
              <TableHead className="hidden lg:table-cell">
                {isTrash ? "Expurgo" : "Conta"}
              </TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((s) => {
              const linked = linkedByStudentId.get(s.id);
              const age = ageFromIso(s.birthDate);
              const isSelected = selected.has(s.id);
              return (
                <TableRow
                  key={s.id}
                  className={`cursor-pointer ${isSelected ? "bg-accent/50" : ""}`}
                  onClick={() => (isTrash ? toggle(s.id) : openDetails(s))}
                  data-testid={`row-student-${s.id}`}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggle(s.id)}
                      aria-label={`Selecionar ${s.name}`}
                      data-testid={`checkbox-select-student-${s.id}`}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="size-8">
                        {s.photos?.[0] && (
                          <AvatarImage
                            src={s.photos[0].url}
                            alt={s.name}
                            className="object-cover"
                          />
                        )}
                        <AvatarFallback className="bg-muted text-xs">
                          {initials(s.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p
                          className="truncate font-medium"
                          data-testid={`text-student-name-${s.id}`}
                        >
                          {s.name}
                        </p>
                        {age !== null && (
                          <p className="text-xs text-muted-foreground">
                            {age} anos
                          </p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {s.position ?? (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {clubName(s.clubId) ?? (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {storedToMasked(s.whatsapp)}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {isTrash && s.deletedAt ? (
                      <Badge
                        variant="secondary"
                        data-testid={`badge-days-left-${s.id}`}
                      >
                        {daysLeft(s.deletedAt)}d restantes
                      </Badge>
                    ) : linked ? (
                      <Badge
                        variant="outline"
                        className="gap-1 border-primary/40 text-primary"
                        data-testid={`badge-linked-${s.id}`}
                      >
                        <Link2 className="size-3" /> Vinculada
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {!isTrash && (
                      <StudentMenu
                        student={s}
                        linked={!!linked}
                        onEdit={() => openEdit(s)}
                        onLink={() => setToLink(s)}
                        onUnlink={() => setToUnlink(s)}
                        onDelete={() => openDeleteDialog([s.id])}
                        onSelect={() => toggle(s.id)}
                      />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  }

  function renderContent(isTrash: boolean) {
    const query = isTrash ? trashed : students;
    if (query.isError) {
      return <ErrorState onRetry={() => query.refetch()} />;
    }
    if (query.isLoading) {
      return <CardsSkeleton />;
    }
    if ((query.data?.length ?? 0) === 0) {
      return isTrash ? (
        <EmptyState
          icon={<Trash2 className="size-6" />}
          title="Lixeira vazia"
          description={`Alunos excluídos ficam aqui por ${TRASH_RETENTION_DAYS} dias antes da exclusão definitiva.`}
        />
      ) : (
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
      );
    }
    if (filtered.length === 0) {
      return (
        <EmptyState
          icon={<Search className="size-6" />}
          title="Nenhum resultado"
          description={`Nenhum aluno encontrado para "${search}".`}
        />
      );
    }
    return view === "list" || isTrash
      ? renderTable(filtered, isTrash)
      : renderCards(filtered, isTrash);
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

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1 basis-64">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, posição ou clube"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search-students"
          />
        </div>
        {tab === "active" && (
          <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
            <Button
              variant={view === "cards" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8"
              onClick={() => changeView("cards")}
              aria-label="Visão em cards"
              data-testid="button-view-cards"
            >
              <LayoutGrid className="size-4" />
            </Button>
            <Button
              variant={view === "list" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8"
              onClick={() => changeView("list")}
              aria-label="Visão em lista"
              data-testid="button-view-list"
            >
              <List className="size-4" />
            </Button>
          </div>
        )}
        {filtered.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={toggleAll}
            data-testid="button-select-all"
          >
            <CheckSquare className="size-4" />
            {allSelected ? "Desmarcar tudo" : "Selecionar tudo"}
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="active" data-testid="tab-students">
            <Users className="size-4" /> Alunos
          </TabsTrigger>
          <TabsTrigger value="trash" data-testid="tab-students-trash">
            <Trash2 className="size-4" /> Lixeira
          </TabsTrigger>
        </TabsList>
        <TabsContent value="active">{renderContent(false)}</TabsContent>
        <TabsContent value="trash">{renderContent(true)}</TabsContent>
      </Tabs>

      {/* Barra de ações em massa */}
      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-30 mx-auto flex w-fit items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-lg">
          <span className="text-sm font-medium" data-testid="text-selected-count">
            {selected.size} selecionado(s)
          </span>
          {tab === "trash" && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => setRestoreConfirm(true)}
              data-testid="button-restore-selected"
            >
              <ArchiveRestore className="size-4" /> Restaurar
            </Button>
          )}
          {(tab === "active" || isAdmin) && (
            <Button
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={() => openDeleteDialog([...selected])}
              data-testid="button-delete-selected"
            >
              <Trash2 className="size-4" />
              {tab === "trash" ? "Excluir definitivamente" : "Excluir"}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelected(new Set())}
            data-testid="button-cancel-selection"
          >
            <X className="size-4" /> Cancelar
          </Button>
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

      {/* Confirmação de exclusão (lixeira ou definitiva) */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Excluir {deleteTargets.length} aluno(s)?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tab === "trash"
                ? permanentWarning
                : isAdmin
                  ? "Escolha como deseja excluir os alunos selecionados."
                  : `Os alunos vão para a lixeira e serão excluídos definitivamente após ${TRASH_RETENTION_DAYS} dias. Até lá, você pode restaurá-los.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {isAdmin && tab === "active" && (
            <RadioGroup
              value={deleteMode}
              onValueChange={(v) => setDeleteMode(v as DeleteMode)}
              className="gap-3"
            >
              <div className="flex items-start gap-3 rounded-md border border-border p-3">
                <RadioGroupItem
                  value="trash"
                  id="student-delete-mode-trash"
                  data-testid="radio-delete-trash"
                />
                <Label
                  htmlFor="student-delete-mode-trash"
                  className="cursor-pointer font-normal"
                >
                  <span className="block font-medium">
                    Excluir (lixeira {TRASH_RETENTION_DAYS} dias)
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Pode ser restaurado dentro do prazo.
                  </span>
                </Label>
              </div>
              <div className="flex items-start gap-3 rounded-md border border-destructive/40 p-3">
                <RadioGroupItem
                  value="permanent"
                  id="student-delete-mode-permanent"
                  data-testid="radio-delete-permanent"
                />
                <Label
                  htmlFor="student-delete-mode-permanent"
                  className="cursor-pointer font-normal"
                >
                  <span className="block font-medium text-destructive">
                    Excluir definitivamente
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {permanentWarning}
                  </span>
                </Label>
              </div>
            </RadioGroup>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={busy}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete"
            >
              {deleteMode === "permanent"
                ? "Excluir definitivamente"
                : "Mover para a lixeira"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação de restauração */}
      <AlertDialog open={restoreConfirm} onOpenChange={setRestoreConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Restaurar {selected.size} aluno(s)?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Os alunos voltam para a lista e deixam de ter prazo de exclusão.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-restore">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRestore}
              disabled={busy}
              data-testid="button-confirm-restore"
            >
              Restaurar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StudentMenu({
  student,
  linked,
  onEdit,
  onLink,
  onUnlink,
  onDelete,
  onSelect,
}: {
  student: Student;
  linked: boolean;
  onEdit: () => void;
  onLink: () => void;
  onUnlink: () => void;
  onDelete: () => void;
  onSelect: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          data-testid={`button-menu-student-${student.id}`}
        >
          <MoreVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={onEdit}
          data-testid={`button-edit-student-${student.id}`}
        >
          <Pencil className="size-4" /> Editar
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={onSelect}
          data-testid={`button-select-student-${student.id}`}
        >
          <CheckSquare className="size-4" /> Selecionar
        </DropdownMenuItem>
        {linked ? (
          <DropdownMenuItem
            onClick={onUnlink}
            data-testid={`button-unlink-student-${student.id}`}
          >
            <Link2Off className="size-4" /> Desvincular conta
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            onClick={onLink}
            data-testid={`button-link-student-${student.id}`}
          >
            <Link2 className="size-4" /> Vincular conta de aluno
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          className="text-destructive"
          onClick={onDelete}
          data-testid={`button-delete-student-${student.id}`}
        >
          <Trash2 className="size-4" /> Excluir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
