import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Copy, History, RotateCcw, Square } from "lucide-react";
import { Button } from "@workspace/iaschool-ui/components/ui/button";
import { Card, CardContent } from "@workspace/iaschool-ui/components/ui/card";
import { Progress } from "@workspace/iaschool-ui/components/ui/progress";
import type { EventUploader, UploadSnapshot } from "@/lib/upload";

interface Props {
  snapshot: UploadSnapshot;
  uploader: EventUploader;
}

/**
 * Contador do lote: enviadas, já enviadas (conflito de hash — R2), falhas e
 * o que ficou pendente de outra sessão. O progresso aqui é o do cliente;
 * o do servidor (miniaturas, reconhecimento) chega no M3 via Realtime.
 */
export function EventUploadProgress({ snapshot, uploader }: Props) {
  const { counts, running } = snapshot;
  const [showFailures, setShowFailures] = useState(false);

  const active = counts.total - counts.detached;
  const finished = counts.done + counts.duplicate + counts.failed;
  const percent = active === 0 ? 0 : Math.round((finished / active) * 100);

  const failures = useMemo(
    () => snapshot.items.filter((i) => i.status === "failed"),
    [snapshot.items],
  );

  if (counts.total === 0) return null;

  return (
    <Card data-testid="card-upload-progress">
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium" data-testid="text-upload-summary">
            {running
              ? `Enviando ${finished.toLocaleString("pt-BR")} de ${active.toLocaleString("pt-BR")}…`
              : counts.queued + counts.inProgress > 0
                ? "Envio pausado"
                : `${finished.toLocaleString("pt-BR")} de ${active.toLocaleString("pt-BR")} processadas`}
          </p>
          <div className="flex gap-2">
            {running && (
              <Button size="sm" variant="outline" onClick={() => uploader.cancel()} data-testid="button-cancel-upload">
                <Square className="size-3.5" /> Parar
              </Button>
            )}
            {!running && counts.failed > 0 && (
              <Button size="sm" variant="outline" onClick={() => uploader.retryFailed()} data-testid="button-retry-failed">
                <RotateCcw className="size-3.5" /> Tentar de novo ({counts.failed})
              </Button>
            )}
          </div>
        </div>

        <Progress value={percent} aria-label="Progresso do envio" data-testid="progress-upload" />

        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Stat icon={<CheckCircle2 className="size-4 text-primary" />} label="Enviadas" value={counts.done} testId="stat-done" />
          <Stat icon={<Copy className="size-4 text-muted-foreground" />} label="Já enviadas" value={counts.duplicate} testId="stat-duplicate" />
          <Stat
            icon={<AlertTriangle className="size-4 text-destructive" />}
            label="Falhas"
            value={counts.failed}
            testId="stat-failed"
            onClick={counts.failed > 0 ? () => setShowFailures((v) => !v) : undefined}
          />
          <Stat icon={<History className="size-4 text-muted-foreground" />} label="Na fila" value={counts.queued + counts.inProgress} testId="stat-pending" />
        </dl>

        {counts.detached > 0 && (
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground" data-testid="text-upload-detached">
            {counts.detached === 1
              ? "1 arquivo ficou pendente da última vez."
              : `${counts.detached.toLocaleString("pt-BR")} arquivos ficaram pendentes da última vez.`}{" "}
            Arraste a mesma pasta de novo: só o que falta é enviado.
          </p>
        )}

        {showFailures && failures.length > 0 && (
          <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2 text-xs" data-testid="list-upload-failures">
            {failures.map((f) => (
              <li key={f.key} className="flex justify-between gap-3">
                <span className="truncate font-medium">{f.name}</span>
                <span className="shrink-0 text-muted-foreground">{f.error ?? "falha"}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  icon,
  label,
  value,
  testId,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  testId: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <dt className="flex items-center gap-1.5 text-muted-foreground">
        {icon} {label}
      </dt>
      <dd className="text-lg font-semibold tabular-nums" data-testid={testId}>
        {value.toLocaleString("pt-BR")}
      </dd>
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="rounded-md text-left hover:bg-muted/50" data-testid={`${testId}-toggle`}>
        {body}
      </button>
    );
  }
  return <div>{body}</div>;
}
