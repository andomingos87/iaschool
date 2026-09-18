import { useMemo, useState } from "react";
import {
  ArchiveRestore,
  CheckSquare,
  GalleryVerticalEnd,
  Maximize2,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@workspace/iaschool-ui/components/ui/button";
import { Badge } from "@workspace/iaschool-ui/components/ui/badge";
import { Checkbox } from "@workspace/iaschool-ui/components/ui/checkbox";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/iaschool-ui/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/iaschool-ui/components/ui/alert-dialog";
import {
  RadioGroup,
  RadioGroupItem,
} from "@workspace/iaschool-ui/components/ui/radio-group";
import { Label } from "@workspace/iaschool-ui/components/ui/label";
import { toast } from "@workspace/iaschool-ui/hooks/use-toast";
import { PageHeader } from "@/components/app-shell";
import {
  GallerySkeleton,
  EmptyState,
  ErrorState,
} from "@/components/data-state";
import { ImageLightbox } from "@/components/image-lightbox";
import {
  useGeneratedPosts,
  useTrashedPosts,
  useMoveToTrash,
  useRestorePosts,
  useDeletePermanently,
} from "@/hooks/use-generated-posts";
import { useStudents } from "@/hooks/use-students";
import { useAuth } from "@/hooks/use-auth";
import { formatDateTime } from "@/lib/format";
import { TRASH_RETENTION_DAYS, type GeneratedPost } from "@/lib/data";

type DeleteMode = "trash" | "permanent";

/** Dias restantes até o expurgo definitivo de um item da lixeira. */
function daysLeft(deletedAt: string): number {
  const expires =
    new Date(deletedAt).getTime() + TRASH_RETENTION_DAYS * 24 * 3600 * 1000;
  return Math.max(0, Math.ceil((expires - Date.now()) / (24 * 3600 * 1000)));
}

function PostGrid({
  posts,
  selecting,
  selected,
  onToggle,
  onZoom,
  studentName,
  trash,
}: {
  posts: GeneratedPost[];
  selecting: boolean;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onZoom: (url: string) => void;
  studentName: (id: string) => string;
  trash?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {posts.map((post) => {
        const isSelected = selected.has(post.id);
        return (
          <div
            key={post.id}
            className={`group relative overflow-hidden rounded-lg border bg-muted transition-colors ${
              isSelected ? "border-primary ring-2 ring-primary/50" : "border-border"
            }`}
            data-testid={`card-gallery-post-${post.id}`}
          >
            <button
              type="button"
              className="block w-full text-left"
              onClick={() =>
                selecting ? onToggle(post.id) : onZoom(post.imageUrl)
              }
              data-testid={`button-gallery-post-${post.id}`}
            >
              <div className="aspect-square overflow-hidden">
                <img
                  src={post.imageUrl}
                  alt={`Post de ${studentName(post.studentId)}`}
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  loading="lazy"
                />
              </div>
              <div className="p-2">
                <p className="truncate text-sm font-medium">
                  {studentName(post.studentId)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(post.createdAt)}
                </p>
              </div>
            </button>
            {selecting && (
              <div className="absolute left-2 top-2">
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => onToggle(post.id)}
                  className="size-5 border-2 bg-background/80"
                  aria-label="Selecionar post"
                  data-testid={`checkbox-select-post-${post.id}`}
                />
              </div>
            )}
            {trash && post.deletedAt && (
              <Badge
                variant="secondary"
                className="absolute right-2 top-2 bg-background/85"
                data-testid={`badge-days-left-${post.id}`}
              >
                {daysLeft(post.deletedAt)}d restantes
              </Badge>
            )}
            {!selecting && (
              <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-end p-2 opacity-0 transition-opacity group-hover:opacity-100">
                <Button
                  size="icon"
                  variant="secondary"
                  className="pointer-events-auto h-8 w-8"
                  onClick={() => onZoom(post.imageUrl)}
                  aria-label="Ampliar"
                  data-testid={`button-zoom-post-${post.id}`}
                >
                  <Maximize2 className="size-4" />
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function GalleryPage() {
  const { session } = useAuth();
  const isAdmin = session?.user.role === "super_admin";
  const [tab, setTab] = useState<"gallery" | "trash">("gallery");
  const posts = useGeneratedPosts();
  const trashed = useTrashedPosts(tab === "trash");
  const students = useStudents();
  const moveToTrash = useMoveToTrash();
  const restore = useRestorePosts();
  const deletePermanently = useDeletePermanently();

  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState<DeleteMode>("trash");
  const [restoreConfirm, setRestoreConfirm] = useState(false);

  const studentName = useMemo(() => {
    const map = new Map((students.data ?? []).map((s) => [s.id, s.name]));
    return (id: string) => map.get(id) ?? "Aluno";
  }, [students.data]);

  const current = tab === "gallery" ? posts : trashed;
  const items = current.data ?? [];
  const allSelected = items.length > 0 && selected.size === items.length;
  const busy =
    moveToTrash.isPending || restore.isPending || deletePermanently.isPending;

  function resetSelection() {
    setSelecting(false);
    setSelected(new Set());
  }

  function changeTab(next: string) {
    setTab(next as "gallery" | "trash");
    resetSelection();
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
    setSelected(allSelected ? new Set() : new Set(items.map((p) => p.id)));
  }

  function openDeleteDialog() {
    // Na lixeira só existe exclusão definitiva; na galeria, escola usa a
    // lixeira e o admin escolhe no diálogo.
    setDeleteMode(tab === "trash" ? "permanent" : "trash");
    setConfirmOpen(true);
  }

  async function confirmDelete() {
    const ids = [...selected];
    setConfirmOpen(false);
    try {
      if (deleteMode === "permanent") {
        await deletePermanently.mutateAsync(ids);
        toast({
          title: "Exclusão concluída",
          description: `${ids.length} post(s) excluído(s) definitivamente.`,
        });
      } else {
        await moveToTrash.mutateAsync(ids);
        toast({
          title: "Movido para a lixeira",
          description: `${ids.length} post(s) na lixeira por ${TRASH_RETENTION_DAYS} dias. Você pode restaurar na aba Lixeira.`,
        });
      }
      resetSelection();
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
        title: "Posts restaurados",
        description: `${ids.length} post(s) de volta à galeria.`,
      });
      resetSelection();
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
    "Esta ação não pode ser desfeita: o registro e o arquivo da imagem serão removidos para sempre.";

  function renderContent(list: typeof posts, isTrash: boolean) {
    if (list.isError) {
      return <ErrorState onRetry={() => list.refetch()} />;
    }
    if (list.isLoading) {
      return <GallerySkeleton />;
    }
    if ((list.data?.length ?? 0) === 0) {
      return isTrash ? (
        <EmptyState
          icon={<Trash2 className="size-6" />}
          title="Lixeira vazia"
          description={`Posts excluídos ficam aqui por ${TRASH_RETENTION_DAYS} dias antes da exclusão definitiva.`}
        />
      ) : (
        <EmptyState
          icon={<GalleryVerticalEnd className="size-6" />}
          title="Nenhum post na galeria"
          description="Crie sua primeira arte para vê-la aqui."
        />
      );
    }
    return (
      <PostGrid
        posts={list.data!}
        selecting={selecting}
        selected={selected}
        onToggle={toggle}
        onZoom={setZoom}
        studentName={studentName}
        trash={isTrash}
      />
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Galeria"
        description="Todos os posts gerados, com lixeira de 30 dias."
        action={
          selecting ? (
            <>
              <Button
                variant="outline"
                onClick={toggleAll}
                data-testid="button-select-all"
              >
                <CheckSquare className="size-4" />
                {allSelected ? "Desmarcar tudo" : "Selecionar tudo"}
              </Button>
              <Button
                variant="ghost"
                onClick={resetSelection}
                data-testid="button-cancel-selection"
              >
                <X className="size-4" /> Cancelar
              </Button>
            </>
          ) : (
            (items.length > 0 || selected.size > 0) && (
              <Button
                variant="outline"
                onClick={() => setSelecting(true)}
                data-testid="button-enter-selection"
              >
                <CheckSquare className="size-4" /> Selecionar
              </Button>
            )
          )
        }
      />

      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="gallery" data-testid="tab-gallery">
            <GalleryVerticalEnd className="size-4" /> Galeria
          </TabsTrigger>
          <TabsTrigger value="trash" data-testid="tab-trash">
            <Trash2 className="size-4" /> Lixeira
          </TabsTrigger>
        </TabsList>
        <TabsContent value="gallery">
          {renderContent(posts, false)}
        </TabsContent>
        <TabsContent value="trash">{renderContent(trashed, true)}</TabsContent>
      </Tabs>

      {/* Barra de ações do modo de seleção */}
      {selecting && selected.size > 0 && (
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
          <Button
            variant="destructive"
            size="sm"
            disabled={busy}
            onClick={openDeleteDialog}
            data-testid="button-delete-selected"
          >
            <Trash2 className="size-4" />
            {tab === "trash" ? "Excluir definitivamente" : "Excluir"}
          </Button>
        </div>
      )}

      {/* Confirmação de exclusão */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Excluir {selected.size} post(s)?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tab === "trash" || (!isAdmin && deleteMode === "trash")
                ? tab === "trash"
                  ? permanentWarning
                  : `Os posts vão para a lixeira e serão excluídos definitivamente após ${TRASH_RETENTION_DAYS} dias. Até lá, você pode restaurá-los.`
                : "Escolha como deseja excluir os posts selecionados."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {isAdmin && tab === "gallery" && (
            <RadioGroup
              value={deleteMode}
              onValueChange={(v) => setDeleteMode(v as DeleteMode)}
              className="gap-3"
            >
              <div className="flex items-start gap-3 rounded-md border border-border p-3">
                <RadioGroupItem
                  value="trash"
                  id="delete-mode-trash"
                  data-testid="radio-delete-trash"
                />
                <Label htmlFor="delete-mode-trash" className="cursor-pointer font-normal">
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
                  id="delete-mode-permanent"
                  data-testid="radio-delete-permanent"
                />
                <Label htmlFor="delete-mode-permanent" className="cursor-pointer font-normal">
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
              Restaurar {selected.size} post(s)?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Os posts voltam para a galeria e deixam de ter prazo de exclusão.
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

      <ImageLightbox src={zoom} onClose={() => setZoom(null)} />
    </div>
  );
}
