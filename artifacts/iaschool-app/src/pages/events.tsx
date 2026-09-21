import { useMemo } from "react";
import { Link } from "wouter";
import { CalendarDays, Images, Plus, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@workspace/iaschool-ui/components/ui/button";
import { Badge } from "@workspace/iaschool-ui/components/ui/badge";
import { Card, CardContent } from "@workspace/iaschool-ui/components/ui/card";
import { PageHeader } from "@/components/app-shell";
import { CardsSkeleton, EmptyState, ErrorState } from "@/components/data-state";
import { useEventPhotoCounts, useEvents } from "@/hooks/use-events";
import { useClassLabels } from "@/hooks/use-classes";
import { useAuth } from "@/hooks/use-auth";
import { EVENT_STATUS_LABEL } from "@/lib/data";
import type { SchoolEvent } from "@/lib/data";
import { isoToBrDate } from "@/lib/format";

/** Cor do selo de status: rascunho neutro, andamento em destaque, pronto em sucesso. */
function statusVariant(status: SchoolEvent["status"]): "secondary" | "default" | "outline" {
  if (status === "draft" || status === "archived") return "secondary";
  if (status === "ready") return "default";
  return "outline";
}

/**
 * Eventos da escola ativa, do mais recente para o mais antigo. Cada evento é
 * a unidade do upload em massa (Fase 2); a contagem de fotos vem de `photos`.
 */
export default function EventsPage() {
  const { session } = useAuth();
  const events = useEvents();
  const counts = useEventPhotoCounts();
  const classLabels = useClassLabels();
  const hasSchool = Boolean(session?.activeSchoolId);

  /** Agrupa por ano do evento, do mais recente para o mais antigo. */
  const byYear = useMemo(() => {
    const groups = new Map<string, SchoolEvent[]>();
    for (const e of events.data ?? []) {
      const year = e.eventDate.slice(0, 4);
      groups.set(year, [...(groups.get(year) ?? []), e]);
    }
    return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [events.data]);

  const newButton = (testId: string) => (
    <Button asChild data-testid={testId}>
      <Link href="/eventos/novo">
        <Plus className="size-4" /> Novo evento
      </Link>
    </Button>
  );

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Eventos"
        description="Cada evento recebe as fotos de um dia — festa, passeio, apresentação. As fotos ficam guardadas até a data de retenção do evento."
        action={hasSchool ? newButton("button-new-event") : undefined}
      />

      {!hasSchool ? (
        <EmptyState
          icon={<CalendarDays className="size-6" />}
          title="Nenhuma escola selecionada"
          description="Os eventos pertencem a uma escola. Selecione a escola no topo da tela, ou peça ao administrador para vincular sua conta a uma escola."
        />
      ) : events.isError ? (
        <ErrorState onRetry={() => events.refetch()} />
      ) : events.isLoading ? (
        <CardsSkeleton />
      ) : (events.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<CalendarDays className="size-6" />}
          title="Nenhum evento cadastrado"
          description="Crie o primeiro evento para poder subir as fotos da turma."
          action={newButton("button-new-event-empty")}
        />
      ) : (
        <div className="space-y-8">
          {byYear.map(([year, list]) => (
            <section key={year} data-testid={`section-event-year-${year}`}>
              <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{year}</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((e) => {
                  const photos = counts.data?.get(e.id) ?? 0;
                  const declared = Boolean(e.imageRightsDeclaredAt);
                  return (
                    <Link
                      key={e.id}
                      href={`/eventos/${e.id}`}
                      className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      data-testid={`link-event-${e.id}`}
                    >
                      <Card className="h-full border-border transition-colors hover:border-primary/50">
                        <CardContent className="flex h-full flex-col gap-3 p-4">
                          <div className="flex items-start gap-3">
                            <div className="flex size-11 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
                              <CalendarDays className="size-5 text-muted-foreground" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-semibold" data-testid={`text-event-name-${e.id}`}>
                                {e.name}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {isoToBrDate(e.eventDate)}
                                {e.classId && classLabels.get(e.classId)
                                  ? ` · ${classLabels.get(e.classId)}`
                                  : ""}
                              </p>
                            </div>
                          </div>
                          <div className="mt-auto flex flex-wrap items-center gap-2">
                            <Badge variant={statusVariant(e.status)} data-testid={`badge-event-status-${e.id}`}>
                              {EVENT_STATUS_LABEL[e.status]}
                            </Badge>
                            <Badge variant="secondary" data-testid={`badge-event-photos-${e.id}`}>
                              <Images className="size-3" />
                              {photos === 1 ? "1 foto" : `${photos} fotos`}
                            </Badge>
                            <span
                              className={`ml-auto inline-flex items-center gap-1 text-xs ${declared ? "text-muted-foreground" : "text-destructive"}`}
                              title={
                                declared
                                  ? "Direito de imagem declarado"
                                  : "Direito de imagem ainda não declarado — o upload não abre"
                              }
                            >
                              {declared ? (
                                <ShieldCheck className="size-3.5" />
                              ) : (
                                <ShieldAlert className="size-3.5" />
                              )}
                              {declared ? "Imagem autorizada" : "Sem declaração"}
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
