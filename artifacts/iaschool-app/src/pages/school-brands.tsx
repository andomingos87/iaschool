import { useState } from "react";
import { School, MoreVertical, Pencil, AlertTriangle } from "lucide-react";
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
import { PageHeader } from "@/components/app-shell";
import { CardsSkeleton, EmptyState, ErrorState } from "@/components/data-state";
import { SchoolBrandFormDialog } from "@/components/school-brand-form-dialog";
import { useSchoolBrands } from "@/hooks/use-school-brands";
import type { SchoolBrand } from "@/lib/data";
import { maskCnpj, storedToMasked } from "@/lib/format";

/** Linha "Cidade/UF" do endereço, quando houver o que mostrar. */
function cityLine(b: SchoolBrand): string | null {
  const city = b.address?.city?.trim();
  const state = b.address?.state?.trim();
  if (city && state) return `${city}/${state}`;
  return city || state || null;
}

/**
 * Cadastro das escolas de que a pessoa é membro: dados administrativos (CNPJ,
 * endereço, contato) e identidade visual. A escola em si nasce na aprovação do
 * cadastro (M1) — aqui ela é editada, nunca criada.
 */
export default function SchoolBrandsPage() {
  const brands = useSchoolBrands();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SchoolBrand | null>(null);

  function openEdit(b: SchoolBrand) {
    setEditing(b);
    setDialogOpen(true);
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Escola"
        description="Dados de cadastro, logo e cores aplicados nas artes da sua escola."
      />

      {brands.isError ? (
        <ErrorState onRetry={() => brands.refetch()} />
      ) : brands.isLoading ? (
        <CardsSkeleton />
      ) : (brands.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<School className="size-6" />}
          title="Você ainda não é membro de nenhuma escola"
          description="A escola é criada quando o administrador aprova o cadastro. Se você já foi aprovado, peça ao administrador da sua escola para vincular sua conta."
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
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <dl className="mt-3 space-y-1 border-t border-border pt-3 text-xs">
                  <div className="flex gap-2">
                    <dt className="shrink-0 text-muted-foreground">CNPJ</dt>
                    <dd
                      className="truncate"
                      data-testid={`text-school-brand-cnpj-${b.id}`}
                    >
                      {b.cnpj ? maskCnpj(b.cnpj) : "—"}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="shrink-0 text-muted-foreground">Cidade</dt>
                    <dd className="truncate">{cityLine(b) ?? "—"}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="shrink-0 text-muted-foreground">Contato</dt>
                    <dd className="truncate">
                      {b.contact?.phone
                        ? storedToMasked(b.contact.phone)
                        : (b.contact?.email ?? "—")}
                    </dd>
                  </div>
                </dl>

                {!b.cnpj && (
                  <p
                    className="mt-3 flex items-start gap-2 border-t border-border pt-3 text-xs text-muted-foreground"
                    data-testid={`text-school-brand-incomplete-${b.id}`}
                  >
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    Cadastro incompleto: informe CNPJ, endereço e contato antes do
                    piloto.
                  </p>
                )}

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
    </div>
  );
}
