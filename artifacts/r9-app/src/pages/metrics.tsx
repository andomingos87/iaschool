import { useState } from "react";
import { BarChart3, Lock, Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@workspace/iasport/components/ui/button";
import { Input } from "@workspace/iasport/components/ui/input";
import { Badge } from "@workspace/iasport/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/iasport/components/ui/card";
import { Skeleton } from "@workspace/iasport/components/ui/skeleton";
import { toast } from "@workspace/iasport/hooks/use-toast";
import { PageHeader } from "@/components/app-shell";
import { ErrorState } from "@/components/data-state";
import { ConfirmDelete } from "@/components/confirm-delete";
import {
  useMetrics,
  useCreateMetric,
  useDeleteMetric,
} from "@/hooks/use-metrics";
import type { Metric } from "@/lib/data";

export default function MetricsPage() {
  const metrics = useMetrics();
  const create = useCreateMetric();
  const del = useDeleteMetric();
  const [name, setName] = useState("");
  const [toDelete, setToDelete] = useState<Metric | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      toast({ variant: "destructive", title: "Nome muito curto" });
      return;
    }
    const exists = (metrics.data ?? []).some(
      (m) => m.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (exists) {
      toast({ variant: "destructive", title: "Métrica já existe" });
      return;
    }
    try {
      await create.mutateAsync(trimmed);
      toast({ title: "Métrica criada", description: trimmed });
      setName("");
    } catch {
      toast({ variant: "destructive", title: "Não foi possível criar" });
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    try {
      await del.mutateAsync(toDelete.id);
      toast({ title: "Métrica excluída", description: toDelete.name });
      setToDelete(null);
    } catch {
      toast({ variant: "destructive", title: "Não foi possível excluir" });
    }
  }

  const predefined = (metrics.data ?? []).filter((m) => m.predefined);
  const custom = (metrics.data ?? []).filter((m) => !m.predefined);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Métricas"
        description="10 métricas fixas + as personalizadas que você criar."
      />

      <Card className="mb-6 border-border">
        <CardHeader>
          <CardTitle className="text-base">Nova métrica personalizada</CardTitle>
          <CardDescription>
            Crie métricas próprias (ex.: "Velocidade", "Faltas sofridas").
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="flex gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome da métrica"
              data-testid="input-metric-name"
            />
            <Button type="submit" disabled={create.isPending} data-testid="button-create-metric">
              {create.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Criar
            </Button>
          </form>
        </CardContent>
      </Card>

      {metrics.isError ? (
        <ErrorState onRetry={() => metrics.refetch()} />
      ) : metrics.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-md" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Lock className="size-4" /> Pré-definidas ({predefined.length})
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {predefined.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-3"
                  data-testid={`row-metric-${m.id}`}
                >
                  <span className="flex items-center gap-2 font-medium">
                    <BarChart3 className="size-4 text-primary" /> {m.name}
                  </span>
                  <Badge variant="secondary" className="text-[10px]">
                    Fixa
                  </Badge>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
              Personalizadas ({custom.length})
            </h2>
            {custom.length === 0 ? (
              <div className="rounded-md border border-dashed border-border bg-card/50 p-6 text-center text-sm text-muted-foreground">
                Você ainda não criou métricas personalizadas.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {custom.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-3"
                    data-testid={`row-metric-${m.id}`}
                  >
                    <span className="flex items-center gap-2 font-medium">
                      <BarChart3 className="size-4 text-primary" /> {m.name}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => setToDelete(m)}
                      data-testid={`button-delete-metric-${m.id}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <ConfirmDelete
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Excluir métrica?"
        description={`A métrica "${toDelete?.name}" será removida.`}
        onConfirm={confirmDelete}
        loading={del.isPending}
      />
    </div>
  );
}
