import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Cpu,
  History,
  Loader2,
  RotateCcw,
  Square,
  Upload,
} from "lucide-react";
import { Button } from "@workspace/iaschool-ui/components/ui/button";
import { Card, CardContent } from "@workspace/iaschool-ui/components/ui/card";
import { Progress } from "@workspace/iaschool-ui/components/ui/progress";
import type { BatchJob } from "@/lib/data";
import type { EventUploader, UploadSnapshot } from "@/lib/upload";

interface Props {
  snapshot: UploadSnapshot | null;
  uploader: EventUploader | null;
  /** Último lote do evento (Realtime em `batch_jobs`). */
  batch: BatchJob | null;
  /** Fotos com `status = 'failed'` no servidor (job estourou as 5 tentativas). */
  failedJobs: number;
  onRetryJobs: () => void;
  retryingJobs: boolean;
}

const n = (v: number) => v.toLocaleString("pt-BR");

/**
 * Dois blocos no mesmo cartão: **Envio** (o que este navegador está subindo:
 * enviadas, já enviadas por hash — R2, falhas de rede) e **Processamento** (o
 * que o ingest-worker já fez com o que chegou: miniaturas e falhas de job).
 * Os dois botões de "tentar de novo" são coisas diferentes: reenviar arquivos
 * que não chegaram exige o File local; reprocessar é pedido ao servidor.
 */
export function EventUploadProgress({ snapshot, uploader, batch, failedJobs, onRetryJobs, retryingJobs }: Props) {
  const [showFailures, setShowFailures] = useState(false);
  const failures = useMemo(
    () => snapshot?.items.filter((i) => i.status === "failed") ?? [],
    [snapshot?.items],
  );

  const hasUpload = Boolean(snapshot && snapshot.counts.total > 0);
  const hasServer = Boolean(batch) || failedJobs > 0;
  if (!hasUpload && !hasServer) return null;

  return (
    <Card data-testid="card-upload-progress">
      <CardContent className="space-y-5 p-4">
        {hasUpload && snapshot && uploader && (
          <UploadBlock
            snapshot={snapshot}
            uploader={uploader}
            failures={failures}
            showFailures={showFailures}
            onToggleFailures={() => setShowFailures((v) => !v)}
          />
        )}
        {hasUpload && hasServer && <div className="border-t border-border" />}
        {hasServer && (
          <ProcessingBlock
            batch={batch}
            failedJobs={failedJobs}
            onRetryJobs={onRetryJobs}
            retrying={retryingJobs}
          />
        )}
      </CardContent>
    </Card>
  );
}

function UploadBlock({
  snapshot,
  uploader,
  failures,
  showFailures,
  onToggleFailures,
}: {
  snapshot: UploadSnapshot;
  uploader: EventUploader;
  failures: UploadSnapshot["items"];
  showFailures: boolean;
  onToggleFailures: () => void;
}) {
  const { counts, running } = snapshot;
  const active = counts.total - counts.detached;
  const finished = counts.done + counts.duplicate + counts.failed;
  const percent = active === 0 ? 0 : Math.round((finished / active) * 100);

  return (
    <section className="space-y-3" data-testid="section-upload">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium" data-testid="text-upload-summary">
          <Upload className="size-4 text-muted-foreground" />
          {running
            ? `Enviando ${n(finished)} de ${n(active)}…`
            : counts.queued + counts.inProgress > 0
              ? "Envio pausado"
              : `${n(finished)} de ${n(active)} enviadas`}
        </p>
        <div className="flex gap-2">
          {running && (
            <Button size="sm" variant="outline" onClick={() => uploader.cancel()} data-testid="button-cancel-upload">
              <Square className="size-3.5" /> Parar
            </Button>
          )}
          {!running && counts.failed > 0 && (
            <Button size="sm" variant="outline" onClick={() => uploader.retryFailed()} data-testid="button-retry-failed">
              <RotateCcw className="size-3.5" /> Reenviar falhas do envio ({n(counts.failed)})
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
          onClick={counts.failed > 0 ? onToggleFailures : undefined}
        />
        <Stat icon={<History className="size-4 text-muted-foreground" />} label="Na fila" value={counts.queued + counts.inProgress} testId="stat-pending" />
      </dl>

      {counts.detached > 0 && (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground" data-testid="text-upload-detached">
          {counts.detached === 1
            ? "1 arquivo ficou pendente da última vez."
            : `${n(counts.detached)} arquivos ficaram pendentes da última vez.`}{" "}
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
    </section>
  );
}

function ProcessingBlock({
  batch,
  failedJobs,
  onRetryJobs,
  retrying,
}: {
  batch: BatchJob | null;
  failedJobs: number;
  onRetryJobs: () => void;
  retrying: boolean;
}) {
  const total = batch?.total ?? 0;
  const processed = batch?.processed ?? 0;
  const failed = Math.max(batch?.failed ?? 0, failedJobs);
  const done = processed + failed;
  const percent = total === 0 ? 0 : Math.min(100, Math.round((done / total) * 100));
  const status = batch?.status ?? (failedJobs > 0 ? "failed" : "done");
  const uploadStillGoing = Boolean(batch && !batch.uploadFinishedAt);

  let summary: React.ReactNode;
  if (status === "running") {
    summary = (
      <>
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
        {uploadStillGoing
          ? `Processadas ${n(processed)} de ${n(total)} recebidas até agora`
          : `Processadas ${n(processed)} de ${n(total)}`}
        {failed > 0 && ` · ${n(failed)} ${failed === 1 ? "falha" : "falhas"}`}
      </>
    );
  } else if (status === "done") {
    summary = (
      <>
        <CheckCircle2 className="size-4 text-primary" />
        {processed === 1 ? "1 foto processada" : `Todas as ${n(processed)} fotos processadas`}
      </>
    );
  } else if (status === "cancelled") {
    summary = (
      <>
        <Square className="size-4 text-muted-foreground" />
        {`Envio interrompido · ${n(processed)} processadas`}
      </>
    );
  } else {
    summary = (
      <>
        <AlertTriangle className="size-4 text-destructive" />
        {`${n(processed)} processadas · ${n(failed)} ${failed === 1 ? "não processada" : "não processadas"}`}
      </>
    );
  }

  return (
    <section className="space-y-3" data-testid="section-processing">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium" data-testid="text-processing-summary">
          <Cpu className="size-4 text-muted-foreground" />
          {summary}
        </p>
        {failedJobs > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={onRetryJobs}
            disabled={retrying}
            data-testid="button-retry-jobs"
          >
            {retrying ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
            {failedJobs === 1
              ? "1 foto não processada — tentar de novo"
              : `${n(failedJobs)} fotos não processadas — tentar de novo`}
          </Button>
        )}
      </div>
      {(status === "running" || total > 0) && (
        <Progress value={percent} aria-label="Progresso do processamento" data-testid="progress-processing" />
      )}
      {status === "running" && (
        <p className="text-xs text-muted-foreground">
          As miniaturas aparecem na galeria conforme ficam prontas. Você pode sair desta tela; o
          processamento continua no servidor.
        </p>
      )}
    </section>
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
        {n(value)}
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
