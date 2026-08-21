import { useState } from "react";
import {
  Plus,
  Shield,
  MoreVertical,
  Pencil,
  Trash2,
  Shirt,
} from "lucide-react";
import { Button } from "@workspace/iasport/components/ui/button";
import {
  Card,
  CardContent,
} from "@workspace/iasport/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/iasport/components/ui/dropdown-menu";
import { toast } from "@workspace/iasport/hooks/use-toast";
import { PageHeader } from "@/components/app-shell";
import { CardsSkeleton, EmptyState, ErrorState } from "@/components/data-state";
import { ClubFormDialog } from "@/components/club-form-dialog";
import { ConfirmDelete } from "@/components/confirm-delete";
import { useClubs, useDeleteClub } from "@/hooks/use-clubs";
import type { Club } from "@/lib/data";

export default function ClubsPage() {
  const clubs = useClubs();
  const del = useDeleteClub();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Club | null>(null);
  const [toDelete, setToDelete] = useState<Club | null>(null);

  function openNew() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(c: Club) {
    setEditing(c);
    setDialogOpen(true);
  }

  async function confirmDelete() {
    if (!toDelete) return;
    try {
      await del.mutateAsync(toDelete.id);
      toast({ title: "Escola excluída", description: toDelete.name });
      setToDelete(null);
    } catch {
      toast({ variant: "destructive", title: "Não foi possível excluir" });
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Escolas"
        description="Gerencie logo, uniforme e identidade visual de cada escola."
        action={
          <Button onClick={openNew} data-testid="button-new-club">
            <Plus className="size-4" /> Nova escola
          </Button>
        }
      />

      {clubs.isError ? (
        <ErrorState onRetry={() => clubs.refetch()} />
      ) : clubs.isLoading ? (
        <CardsSkeleton />
      ) : (clubs.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<Shield className="size-6" />}
          title="Nenhuma escola cadastrada"
          description="Cadastre uma escola para aplicar logo, uniforme e cores nas imagens geradas."
          action={
            <Button onClick={openNew} data-testid="button-empty-new-club">
              <Plus className="size-4" /> Cadastrar escola
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clubs.data!.map((c) => (
            <Card
              key={c.id}
              className="border-border transition-colors hover:border-primary/50"
              data-testid={`card-club-${c.id}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
                    {c.logo ? (
                      <img src={c.logo.url} alt={c.name} className="h-full w-full object-contain" />
                    ) : (
                      <Shield className="size-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold" data-testid={`text-club-name-${c.id}`}>
                      {c.name}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <Shirt className="size-3.5" /> {c.uniforms.length} uniforme(s)
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        data-testid={`button-menu-club-${c.id}`}
                      >
                        <MoreVertical className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => openEdit(c)}
                        data-testid={`button-edit-club-${c.id}`}
                      >
                        <Pencil className="size-4" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setToDelete(c)}
                        data-testid={`button-delete-club-${c.id}`}
                      >
                        <Trash2 className="size-4" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {c.colors.length > 0 && (
                  <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
                    <span className="text-xs text-muted-foreground">Cores:</span>
                    <div className="flex gap-1.5">
                      {c.colors.map((color, i) => (
                        <span
                          key={i}
                          className="size-5 rounded-full border border-border"
                          style={{ backgroundColor: color }}
                          title={color}
                          data-testid={`swatch-club-${c.id}-${i}`}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {c.uniforms.length > 0 && (
                  <div className="mt-3 flex gap-2 overflow-x-auto">
                    {c.uniforms.slice(0, 4).map((u) => (
                      <img
                        key={u.id}
                        src={u.url}
                        alt="Uniforme"
                        className="size-12 shrink-0 rounded-md border border-border object-cover"
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ClubFormDialog open={dialogOpen} onOpenChange={setDialogOpen} club={editing} />
      <ConfirmDelete
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Excluir escola?"
        description={`Isso removerá "${toDelete?.name}" permanentemente.`}
        onConfirm={confirmDelete}
        loading={del.isPending}
      />
    </div>
  );
}
