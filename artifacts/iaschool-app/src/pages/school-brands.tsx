import { useState } from "react";
import {
  Plus,
  School,
  MoreVertical,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button } from "@workspace/iaschool-ui/components/ui/button";
import {
  Card,
  CardContent,
} from "@workspace/iaschool-ui/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/iaschool-ui/components/ui/dropdown-menu";
import { toast } from "@workspace/iaschool-ui/hooks/use-toast";
import { PageHeader } from "@/components/app-shell";
import { CardsSkeleton, EmptyState, ErrorState } from "@/components/data-state";
import { SchoolBrandFormDialog } from "@/components/school-brand-form-dialog";
import { ConfirmDelete } from "@/components/confirm-delete";
import {
  useSchoolBrands,
  useDeleteSchoolBrand,
} from "@/hooks/use-school-brands";
import type { SchoolBrand } from "@/lib/data";

export default function SchoolBrandsPage() {
  const brands = useSchoolBrands();
  const del = useDeleteSchoolBrand();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SchoolBrand | null>(null);
  const [toDelete, setToDelete] = useState<SchoolBrand | null>(null);

  function openNew() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(b: SchoolBrand) {
    setEditing(b);
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
        title="Identidade da escola"
        description="Logo e cores aplicados nas artes de cada escola."
        action={
          <Button onClick={openNew} data-testid="button-new-school-brand">
            <Plus className="size-4" /> Nova escola
          </Button>
        }
      />

      {brands.isError ? (
        <ErrorState onRetry={() => brands.refetch()} />
      ) : brands.isLoading ? (
        <CardsSkeleton />
      ) : (brands.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<School className="size-6" />}
          title="Nenhuma escola cadastrada"
          description="Cadastre uma escola para aplicar logo e cores nas artes geradas."
          action={
            <Button onClick={openNew} data-testid="button-empty-new-school-brand">
              <Plus className="size-4" /> Cadastrar escola
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {brands.data!.map((b) => (
            <Card
              key={b.id}
              className="border-border transition-colors hover:border-primary/50"
              data-testid={`card-school-brand-${b.id}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
                    {b.logo ? (
                      <img src={b.logo.url} alt={b.name} className="h-full w-full object-contain" />
                    ) : (
                      <School className="size-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate font-semibold"
                      data-testid={`text-school-brand-name-${b.id}`}
                    >
                      {b.name}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {b.logo ? "Logo cadastrado" : "Sem logo"}
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        data-testid={`button-menu-school-brand-${b.id}`}
                      >
                        <MoreVertical className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => openEdit(b)}
                        data-testid={`button-edit-school-brand-${b.id}`}
                      >
                        <Pencil className="size-4" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setToDelete(b)}
                        data-testid={`button-delete-school-brand-${b.id}`}
                      >
                        <Trash2 className="size-4" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {b.colors.length > 0 && (
                  <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
                    <span className="text-xs text-muted-foreground">Cores:</span>
                    <div className="flex gap-1.5">
                      {b.colors.map((color, i) => (
                        <span
                          key={i}
                          className="size-5 rounded-full border border-border"
                          style={{ backgroundColor: color }}
                          title={color}
                          data-testid={`swatch-school-brand-${b.id}-${i}`}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <SchoolBrandFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        brand={editing}
      />
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
