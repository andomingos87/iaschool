import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Pencil, School } from "lucide-react";
import { Button } from "@workspace/iaschool-ui/components/ui/button";
import { Card, CardContent } from "@workspace/iaschool-ui/components/ui/card";
import { PageHeader } from "@/components/app-shell";
import { CardsSkeleton, EmptyState, ErrorState } from "@/components/data-state";
import {
  SchoolBrandFormDialog,
  type SchoolBrandFocus,
} from "@/components/school-brand-form-dialog";
import { useSchoolBrands } from "@/hooks/use-school-brands";
import { useStudents } from "@/hooks/use-students";
import { useClasses } from "@/hooks/use-classes";
import { useAuth } from "@/hooks/use-auth";
import { iaschool } from "@/config/iaschool";
import { getDataLayer, isPlatformAdmin, type SchoolBrand } from "@/lib/data";
import { qk } from "@/lib/query-keys";
import { maskCnpj, maskZip, storedToMasked } from "@/lib/format";

function cityLine(b: SchoolBrand): string | null {
  const city = b.address?.city?.trim();
  const state = b.address?.state?.trim();
  if (city && state) return `${city}/${state}`;
  return city || state || null;
}

function gaps(b: SchoolBrand): { id: SchoolBrandFocus; label: string }[] {
  const items: { id: SchoolBrandFocus; label: string }[] = [];
  if (!b.cnpj) items.push({ id: "cnpj", label: "CNPJ" });
  if (!b.address?.city?.trim() || !b.address?.state?.trim()) {
    items.push({ id: "city", label: "Cidade e UF" });
  }
  if (!b.contact?.phone?.trim() && !b.contact?.email?.trim()) {
    items.push({ id: "phone", label: "Telefone ou e-mail" });
  }
  if (!b.contact?.responsible?.trim()) {
    items.push({ id: "responsible", label: "Nome do responsável pela conta" });
  }
  return items;
}

function addressLines(b: SchoolBrand): string[] {
  const a = b.address;
  if (!a) return [];
  const lines: string[] = [];
  const street = [a.street, a.number].filter(Boolean).join(", ");
  if (street) lines.push(street);
  if (a.complement?.trim()) lines.push(a.complement.trim());
  if (a.district?.trim()) lines.push(a.district.trim());
  const city = cityLine(b);
  if (city) lines.push(city);
  if (a.zip) lines.push(maskZip(a.zip));
  return lines;
}

function SchoolFicha({
  brand,
  onEdit,
  onBack,
}: {
  brand: SchoolBrand;
  onEdit: (focus: SchoolBrandFocus | null) => void;
  onBack: (() => void) | null;
}) {
  const { session } = useAuth();
  const students = useStudents();
  const classes = useClasses(brand.id);
  const events = useQuery({
    queryKey: qk.events(brand.id),
    queryFn: () => getDataLayer().events.list(brand.id),
  });
  const pending = gaps(brand);
  const membership = session?.user.schools.find((s) => s.schoolId === brand.id);
  const role = isPlatformAdmin(session?.user.role)
    ? iaschool.roles[session!.user.role]
    : membership
      ? iaschool.memberRoles[membership.role]
      : "—";
  const studentCount = (students.data ?? []).filter((s) => s.schoolId === brand.id).length;
  const reviewEvents = (events.data ?? []).filter((e) => e.status === "review");
  const reviewHref =
    reviewEvents.length === 1 ? `/eventos/${reviewEvents[0]!.id}/revisao` : "/eventos";
  const lines = addressLines(brand);

  const stats = [
    { label: "Alunos", value: studentCount, href: "/alunos" },
    { label: "Turmas", value: classes.data?.length ?? 0, href: "/turmas" },
    { label: "Eventos", value: events.data?.length ?? 0, href: "/eventos" },
    { label: "Revisão aberta", value: reviewEvents.length, href: reviewHref },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-4" data-testid="school-ficha">
      {onBack && (
        <Button variant="ghost" onClick={onBack} data-testid="button-school-back">
          <ArrowLeft className="size-4" /> Escolas
        </Button>
      )}

      <Card className="border-border">
        <CardContent className="space-y-3 p-4 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold" data-testid={`text-school-brand-name-${brand.id}`}>
                {brand.name}
              </h2>
              <p className="text-sm text-muted-foreground">
                {brand.cnpj ? maskCnpj(brand.cnpj) : "CNPJ não informado"}
                {" · "}
                {cityLine(brand) ?? "Cidade não informada"}
                {" · "}
                {role}
              </p>
            </div>
            <Button onClick={() => onEdit(null)} data-testid="button-edit-school-brand">
              <Pencil className="size-4" /> Editar cadastro
            </Button>
          </div>
        </CardContent>
      </Card>

      {pending.length > 0 && (
        <Card className="border-border">
          <CardContent className="space-y-2 p-4 sm:p-6">
            <h3 className="font-semibold">Pendências</h3>
            <ul className="space-y-1 text-sm">
              {pending.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="text-primary underline-offset-4 hover:underline"
                    onClick={() => onEdit(item.id)}
                    data-testid={`link-school-gap-${item.id}`}
                  >
                    Completar {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href}>
            <Card className="border-border transition-colors hover:border-primary/50">
              <CardContent className="p-4">
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card className="border-border">
        <CardContent className="space-y-4 p-4 sm:p-6">
          <h3 className="font-semibold">Cadastro</h3>
          <div>
            <p className="text-xs text-muted-foreground">Endereço</p>
            {lines.length === 0 ? (
              <p className="text-sm">Não informado</p>
            ) : (
              lines.map((line) => (
                <p key={line} className="text-sm">
                  {line}
                </p>
              ))
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Contato</p>
            <p className="text-sm">{brand.contact?.responsible?.trim() || "Responsável não informado"}</p>
            <p className="text-sm">
              {brand.contact?.phone ? storedToMasked(brand.contact.phone) : "Telefone não informado"}
            </p>
            <p className="text-sm">{brand.contact?.email?.trim() || "E-mail não informado"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Cores usadas nas artes</p>
            {brand.colors.length === 0 ? (
              <p className="text-sm">Nenhuma cor cadastrada</p>
            ) : (
              <div className="mt-1 flex gap-1.5">
                {brand.colors.map((color, i) => (
                  <span
                    key={color}
                    className="size-6 rounded-full border border-border"
                    style={{ backgroundColor: color }}
                    title={color}
                    data-testid={`swatch-school-brand-${brand.id}-${i}`}
                  />
                ))}
              </div>
            )}
          </div>
          {brand.logo && (
            <div>
              <img
                src={brand.logo.url}
                alt=""
                className="size-16 rounded-md border border-border bg-muted object-contain p-1"
              />
              <p className="mt-1 text-xs text-muted-foreground">Não é colocado na arte.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function SchoolBrandsPage() {
  const brands = useSchoolBrands();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [focusField, setFocusField] = useState<SchoolBrandFocus | null>(null);
  const list = brands.data ?? [];
  const single = list.length === 1 ? list[0] : null;
  const selected = list.find((b) => b.id === selectedId) ?? single ?? null;

  function openEdit(focus: SchoolBrandFocus | null) {
    setFocusField(focus);
    setDialogOpen(true);
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Escola"
        description="Dados de cadastro da escola. As cores entram na arte. O logo não é colocado na arte."
      />

      {brands.isError ? (
        <ErrorState onRetry={() => brands.refetch()} />
      ) : brands.isLoading ? (
        <CardsSkeleton />
      ) : list.length === 0 ? (
        <EmptyState
          icon={<School className="size-6" />}
          title="Você ainda não é membro de nenhuma escola"
          description="A escola é criada quando o administrador aprova o cadastro. Se você já foi aprovado, peça ao administrador da sua escola para vincular sua conta."
        />
      ) : selected ? (
        <SchoolFicha
          brand={selected}
          onEdit={openEdit}
          onBack={list.length > 1 ? () => setSelectedId(null) : null}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setSelectedId(b.id)}
              className="rounded-md border border-border p-4 text-left transition-colors hover:border-primary/50"
              data-testid={`card-school-brand-${b.id}`}
            >
              <p className="font-semibold" data-testid={`text-school-brand-name-${b.id}`}>
                {b.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {b.cnpj ? maskCnpj(b.cnpj) : "CNPJ não informado"}
                {cityLine(b) ? ` · ${cityLine(b)}` : ""}
              </p>
            </button>
          ))}
        </div>
      )}

      <SchoolBrandFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        brand={selected}
        focusField={focusField}
      />
    </div>
  );
}
