import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  ScrollText,
  XCircle,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@workspace/iaschool-ui/lib/utils";
import { Button } from "@workspace/iaschool-ui/components/ui/button";
import { Badge } from "@workspace/iaschool-ui/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/iaschool-ui/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/iaschool-ui/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@workspace/iaschool-ui/components/ui/sheet";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/iaschool-ui/components/ui/collapsible";
import { Skeleton } from "@workspace/iaschool-ui/components/ui/skeleton";
import { Spinner } from "@workspace/iaschool-ui/components/ui/spinner";
import { toast } from "@workspace/iaschool-ui/hooks/use-toast";
import { PageHeader } from "@/components/app-shell";
import { EmptyState, ErrorState } from "@/components/data-state";
import { ImageLightbox } from "@/components/image-lightbox";
import { getDataLayer } from "@/lib/data";

// Tela de auditoria das gerações de imagem — exclusiva do admin da IAschool.
// Os dados vêm do api-server (/api/generation/logs), que valida o e-mail e o
// papel super_admin no backend; a rota/menú condicionais são só conveniência.

const PAGE_SIZE = 20;

type StatusFilter = "all" | "success" | "error";
type PeriodFilter = "all" | "24h" | "7d" | "30d";

interface LogListItem {
  id: string;
  createdAt: string;
  userEmail: string | null;
  userName: string | null;
  schoolName: string | null;
  studentName: string | null;
  status: string;
  durationMs: number | null;
  resultThumbUrl: string | null;
}

interface LogAttachment {
  role: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  thumbUrl: string | null;
}

interface LogDetail extends Omit<LogListItem, "resultThumbUrl"> {
  prompt: string | null;
  payload: Record<string, unknown> | null;
  attachments: LogAttachment[];
  openaiResponse: Record<string, unknown> | null;
  serverStatus: number | null;
  serverResponse: Record<string, unknown> | null;
  resultThumbUrl: string | null;
  resultUrl: string | null;
}

async function authedFetch<T>(url: string): Promise<T> {
  const token = await getDataLayer().auth.getAccessToken();
  if (!token) {
    throw new Error("Sessão expirada. Entre novamente.");
  }
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!res.ok) {
    throw new Error(body?.error ?? `Falha ao carregar (HTTP ${res.status}).`);
  }
  return body as T;
}

function periodFrom(period: PeriodFilter): string | null {
  const now = Date.now();
  switch (period) {
    case "24h":
      return new Date(now - 24 * 3600_000).toISOString();
    case "7d":
      return new Date(now - 7 * 24 * 3600_000).toISOString();
    case "30d":
      return new Date(now - 30 * 24 * 3600_000).toISOString();
    default:
      return null;
  }
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

function StatusBadge({ status }: { status: string }) {
  const ok = status === "success";
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1",
        ok
          ? "border-primary/40 text-primary"
          : "border-destructive/40 text-destructive",
      )}
      data-testid={`badge-status-${status}`}
    >
      {ok ? (
        <CheckCircle2 className="size-3" />
      ) : (
        <XCircle className="size-3" />
      )}
      {ok ? "Sucesso" : "Erro"}
    </Badge>
  );
}

/** Bloco de JSON formatado com botão de copiar. */
function JsonBlock({ value, testId }: { value: unknown; testId: string }) {
  const [copied, setCopied] = useState(false);
  const text = JSON.stringify(value, null, 2);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Copiado" });
    } catch {
      toast({ variant: "destructive", title: "Não foi possível copiar" });
    }
  }
  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-1.5 top-1.5 size-7"
        onClick={copy}
        aria-label="Copiar JSON"
        data-testid={`button-copy-${testId}`}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </Button>
      <pre
        className="max-h-72 overflow-auto rounded-md border border-border bg-muted/40 p-3 pr-10 text-xs leading-relaxed"
        data-testid={`json-${testId}`}
      >
        {text}
      </pre>
    </div>
  );
}

/** Seção colapsável do painel de detalhe. */
function DetailSection({
  title,
  defaultOpen = false,
  children,
  testId,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  testId: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-md border border-border"
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium"
          data-testid={`button-section-${testId}`}
        >
          {title}
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t border-border px-4 py-4">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="min-w-0 text-right text-sm">{value}</span>
    </div>
  );
}

function LogDetailPanel({
  logId,
  onZoom,
}: {
  logId: string;
  onZoom: (url: string) => void;
}) {
  const detail = useQuery({
    queryKey: ["generation-log", logId],
    queryFn: () => authedFetch<LogDetail>(`/api/generation/logs/${logId}`),
  });

  if (detail.isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner className="size-6 text-primary" />
      </div>
    );
  }
  if (detail.isError || !detail.data) {
    return (
      <ErrorState
        message={
          detail.error instanceof Error
            ? detail.error.message
            : "Não foi possível carregar o log."
        }
        onRetry={() => void detail.refetch()}
      />
    );
  }
  const log = detail.data;

  return (
    <div className="space-y-3">
      <DetailSection title="Resumo" defaultOpen testId="resumo">
        <div className="divide-y divide-border/60">
          <SummaryRow label="Data/hora" value={formatDateTime(log.createdAt)} />
          <SummaryRow label="Status" value={<StatusBadge status={log.status} />} />
          <SummaryRow label="Duração" value={formatDuration(log.durationMs)} />
          <SummaryRow label="Aluno" value={log.studentName ?? "—"} />
          <SummaryRow
            label="Usuário"
            value={
              log.userName || log.userEmail
                ? `${log.userName ?? ""}${log.userEmail ? ` (${log.userEmail})` : ""}`
                : "—"
            }
          />
          <SummaryRow label="Escola" value={log.schoolName ?? "—"} />
          <SummaryRow
            label="HTTP ao cliente"
            value={log.serverStatus ?? "—"}
          />
        </div>
      </DetailSection>

      <DetailSection title="Prompt utilizado" testId="prompt">
        {log.prompt ? (
          <JsonBlockText text={log.prompt} testId="prompt" />
        ) : (
          <p className="text-sm text-muted-foreground">Prompt não registrado.</p>
        )}
      </DetailSection>

      <DetailSection title="Payload enviado" testId="payload">
        {log.payload ? (
          <JsonBlock value={log.payload} testId="payload" />
        ) : (
          <p className="text-sm text-muted-foreground">Payload não registrado.</p>
        )}
      </DetailSection>

      <DetailSection title="Anexos enviados" testId="anexos">
        {log.attachments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum anexo registrado.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {log.attachments.map((att, i) => (
              <figure key={i} className="space-y-1.5">
                {att.thumbUrl ? (
                  <button
                    type="button"
                    onClick={() => onZoom(att.thumbUrl!)}
                    className="block w-full overflow-hidden rounded-md border border-border"
                    data-testid={`img-attachment-${i}`}
                  >
                    <img
                      src={att.thumbUrl}
                      alt={att.role}
                      className="aspect-square w-full object-cover transition-transform hover:scale-105"
                    />
                  </button>
                ) : (
                  <div className="flex aspect-square w-full items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
                    sem miniatura
                  </div>
                )}
                <figcaption className="leading-tight">
                  <p className="truncate text-xs font-medium">{att.role}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {att.fileName} · {formatBytes(att.sizeBytes)}
                  </p>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </DetailSection>

      <DetailSection title="Resposta da OpenAI" testId="openai">
        {log.openaiResponse ? (
          <JsonBlock value={log.openaiResponse} testId="openai" />
        ) : (
          <p className="text-sm text-muted-foreground">
            Sem resposta registrada (a falha ocorreu antes da chamada à OpenAI).
          </p>
        )}
      </DetailSection>

      <DetailSection title="Resposta do servidor" testId="servidor">
        {log.serverResponse ? (
          <JsonBlock value={log.serverResponse} testId="servidor" />
        ) : (
          <p className="text-sm text-muted-foreground">Não registrada.</p>
        )}
      </DetailSection>

      <DetailSection title="Resultado final" defaultOpen testId="resultado">
        {log.resultThumbUrl ? (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => onZoom(log.resultUrl ?? log.resultThumbUrl!)}
              className="block w-full max-w-56 overflow-hidden rounded-md border border-border"
              data-testid="img-result-thumb"
            >
              <img
                src={log.resultThumbUrl}
                alt="Resultado gerado"
                className="w-full object-cover transition-transform hover:scale-105"
              />
            </button>
            {log.resultUrl && (
              <Button variant="outline" size="sm" asChild>
                <a
                  href={log.resultUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="link-result-url"
                >
                  <ExternalLink className="size-3.5" /> Abrir imagem salva
                </a>
              </Button>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {log.status === "success"
              ? "Miniatura do resultado indisponível."
              : "A geração falhou — não há resultado."}
          </p>
        )}
      </DetailSection>
    </div>
  );
}

/** Texto longo (prompt) com botão copiar — mesmo visual do JsonBlock. */
function JsonBlockText({ text, testId }: { text: string; testId: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Copiado" });
    } catch {
      toast({ variant: "destructive", title: "Não foi possível copiar" });
    }
  }
  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-1.5 top-1.5 size-7"
        onClick={copy}
        aria-label="Copiar"
        data-testid={`button-copy-${testId}`}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </Button>
      <pre
        className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 pr-10 text-xs leading-relaxed"
        data-testid={`text-${testId}`}
      >
        {text}
      </pre>
    </div>
  );
}

export default function AdminLogsPage() {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [period, setPeriod] = useState<PeriodFilter>("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["generation-logs", status, period, page],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (status !== "all") params.set("status", status);
      const from = periodFrom(period);
      if (from) params.set("from", from);
      return authedFetch<{
        items: LogListItem[];
        total: number;
        page: number;
        pageSize: number;
      }>(`/api/generation/logs?${params.toString()}`);
    },
  });

  const totalPages = Math.max(1, Math.ceil((list.data?.total ?? 0) / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Logs de geração"
        description="Auditoria de cada tentativa de geração de imagem: payload, prompt, anexos e respostas."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v as StatusFilter);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-40" data-testid="select-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="success">Sucesso</SelectItem>
            <SelectItem value="error">Erro</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={period}
          onValueChange={(v) => {
            setPeriod(v as PeriodFilter);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-44" data-testid="select-period">
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todo o período</SelectItem>
            <SelectItem value="24h">Últimas 24 horas</SelectItem>
            <SelectItem value="7d">Últimos 7 dias</SelectItem>
            <SelectItem value="30d">Últimos 30 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {list.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : list.isError ? (
        <ErrorState
          message={
            list.error instanceof Error
              ? list.error.message
              : "Não foi possível carregar os logs."
          }
          onRetry={() => void list.refetch()}
        />
      ) : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState
          icon={<ScrollText className="size-6" />}
          title="Nenhum log com esses filtros"
          description="As tentativas de geração aparecem aqui assim que acontecem. Ajuste os filtros ou gere uma imagem."
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/hora</TableHead>
                  <TableHead>Aluno</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duração</TableHead>
                  <TableHead className="text-right">Resultado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data!.items.map((log) => (
                  <TableRow
                    key={log.id}
                    className="cursor-pointer"
                    onClick={() => setSelected(log.id)}
                    data-testid={`row-log-${log.id}`}
                  >
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatDateTime(log.createdAt)}
                    </TableCell>
                    <TableCell className="max-w-44">
                      <p className="truncate text-sm">{log.studentName ?? "—"}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {log.schoolName ?? log.userEmail ?? ""}
                      </p>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={log.status} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatDuration(log.durationMs)}
                    </TableCell>
                    <TableCell className="text-right">
                      {log.resultThumbUrl ? (
                        <img
                          src={log.resultThumbUrl}
                          alt="Miniatura do resultado"
                          className="ml-auto size-10 rounded-md border border-border object-cover"
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-muted-foreground" data-testid="text-pagination">
              Página {page} de {totalPages} · {list.data!.total} log
              {list.data!.total === 1 ? "" : "s"}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                data-testid="button-prev-page"
              >
                <ChevronLeft className="size-4" /> Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                data-testid="button-next-page"
              >
                Próxima <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </>
      )}

      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader className="mb-4">
            <SheetTitle>Detalhe da geração</SheetTitle>
            <SheetDescription>
              Tudo que foi enviado e recebido nesta tentativa.
            </SheetDescription>
          </SheetHeader>
          {selected && <LogDetailPanel logId={selected} onZoom={setZoom} />}
        </SheetContent>
      </Sheet>

      <ImageLightbox src={zoom} onClose={() => setZoom(null)} />
    </div>
  );
}
