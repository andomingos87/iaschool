// Tela de administração do template do prompt de geração.
// Acessível apenas a super_admin (rota protegida em App.tsx e item de menu
// condicional no app-shell).

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Eye,
  History,
  RotateCcw,
  Save,
  Terminal,
} from "lucide-react";
import { Button } from "@workspace/iaschool-ui/components/ui/button";
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
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/iaschool-ui/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/iaschool-ui/components/ui/dialog";
import { Badge } from "@workspace/iaschool-ui/components/ui/badge";
import { Skeleton } from "@workspace/iaschool-ui/components/ui/skeleton";
import { toast } from "@workspace/iaschool-ui/hooks/use-toast";
import { PageHeader } from "@/components/app-shell";
import {
  TemplateEditor,
  type TemplateEditorHandle,
} from "@/components/template-editor";
import { ErrorState } from "@/components/data-state";
import {
  usePromptTemplate,
  usePromptTemplateVersions,
  useSavePromptTemplate,
  useResetPromptTemplate,
} from "@/hooks/use-prompt-template";
import type { PromptTemplateVersion } from "@/lib/data/types";
import {
  DEFAULT_PROMPT_TEMPLATE,
  PLACEHOLDER_DOCS,
  SAMPLE_CONTEXT,
  renderPromptTemplate,
  validatePromptTemplate,
} from "@/lib/prompt-template";

type DiffLine = {
  kind: "same" | "added" | "removed";
  text: string;
};

// Diff simples por linhas (LCS) entre o template da versão e o atual.
// "removed" = linha só existe na versão; "added" = linha só existe no atual.
function diffLines(versionText: string, currentText: string): DiffLine[] {
  const a = versionText.split("\n");
  const b = currentText.split("\n");
  const m = a.length;
  const n = b.length;
  const lcs: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      lcs[i][j] =
        a[i] === b[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ kind: "removed", text: a[i] });
      i++;
    } else {
      out.push({ kind: "added", text: b[j] });
      j++;
    }
  }
  while (i < m) out.push({ kind: "removed", text: a[i++] });
  while (j < n) out.push({ kind: "added", text: b[j++] });
  return out;
}

export default function AdminPromptPage() {
  const query = usePromptTemplate();
  const versions = usePromptTemplateVersions();
  const save = useSavePromptTemplate();
  const reset = useResetPromptTemplate();
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [viewingVersion, setViewingVersion] =
    useState<PromptTemplateVersion | null>(null);

  const [draft, setDraft] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const editorRef = useRef<TemplateEditorHandle>(null);

  // Pré-preenche com o salvo ou com o padrão embutido.
  useEffect(() => {
    if (!query.isLoading && draft === null) {
      setDraft(query.data?.template ?? DEFAULT_PROMPT_TEMPLATE);
    }
  }, [query.isLoading, query.data, draft]);

  const value = draft ?? "";
  const preview = useMemo(
    () => renderPromptTemplate(value, SAMPLE_CONTEXT),
    [value],
  );
  const warnings = useMemo(() => validatePromptTemplate(value), [value]);
  const dirty = value !== (query.data?.template ?? DEFAULT_PROMPT_TEMPLATE);
  const busy = save.isPending || reset.isPending;

  function onSave() {
    if (!value.trim()) {
      toast({
        variant: "destructive",
        title: "O template não pode ficar vazio",
        description: "Use \"Restaurar padrão\" para voltar ao template original.",
      });
      return;
    }
    if (warnings.length > 0) {
      setConfirmOpen(true);
      return;
    }
    void doSave();
  }

  async function doSave() {
    try {
      await save.mutateAsync(value);
      toast({
        title: "Template salvo",
        description: "As próximas gerações já usarão este template.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Falha ao salvar o template",
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    }
  }

  async function onRestoreVersion(version: PromptTemplateVersion) {
    setRestoringId(version.id);
    try {
      await save.mutateAsync(version.template);
      setDraft(version.template);
      setViewingVersion(null);
      toast({
        title: "Versão restaurada",
        description: "As próximas gerações já usarão esta versão do template.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Falha ao restaurar a versão",
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    } finally {
      setRestoringId(null);
    }
  }

  async function onRestore() {
    try {
      await reset.mutateAsync();
      setDraft(DEFAULT_PROMPT_TEMPLATE);
      toast({
        title: "Template padrão restaurado",
        description: "A geração voltou a usar o prompt original.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Falha ao restaurar o padrão",
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    }
  }

  if (query.isLoading) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader
          title="Prompt de geração"
          description="Carregando template..."
        />
        <div className="space-y-4">
          <Skeleton className="h-64 w-full rounded-lg" />
          <Skeleton className="h-32 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader title="Prompt de geração" />
        <ErrorState
          message="Não foi possível carregar o template do prompt."
          onRetry={() => query.refetch()}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Prompt de geração"
        description="Edite o template enviado à IA nas gerações. Blocos condicionais só entram quando o dado existe."
        action={
          <>
            <Button
              variant="outline"
              onClick={onRestore}
              disabled={busy}
              data-testid="button-restaurar-padrao"
            >
              <RotateCcw className="size-4" /> Restaurar padrão
            </Button>
            <Button
              onClick={onSave}
              disabled={busy || !dirty}
              data-testid="button-salvar-template"
            >
              <Save className="size-4" /> Salvar
            </Button>
          </>
        }
      />

      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Terminal className="size-4 text-primary" /> Template
            </CardTitle>
            {query.data ? (
              <Badge variant="secondary">Personalizado</Badge>
            ) : (
              <Badge variant="outline">Padrão</Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            <TemplateEditor
              ref={editorRef}
              value={value}
              onChange={setDraft}
              warnings={warnings}
              rows={14}
              placeholder="Escreva o template do prompt..."
              data-testid="input-template"
            />
            {warnings.length > 0 && (
              <div
                className="space-y-1.5 rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3"
                data-testid="alert-avisos-template"
              >
                <p className="flex items-center gap-2 text-sm font-medium text-yellow-500">
                  <AlertTriangle className="size-4" />
                  {warnings.length === 1
                    ? "1 possível problema no template"
                    : `${warnings.length} possíveis problemas no template`}
                </p>
                <ul className="space-y-1">
                  {warnings.map((w) => {
                    const first = w.occurrences[0];
                    return (
                      <li
                        key={`${w.token}-${w.message}`}
                        className="flex items-start gap-2 text-xs text-muted-foreground"
                      >
                        <button
                          type="button"
                          disabled={!first}
                          onClick={() =>
                            first && editorRef.current?.jumpTo(first.start, first.end)
                          }
                          className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-yellow-500 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:no-underline"
                          title={first ? "Ir até o trecho no editor" : undefined}
                          data-testid={`button-aviso-${w.token}`}
                        >
                          {w.token}
                        </button>
                        <span>{w.message}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            <div>
              <p className="mb-2 text-sm font-medium">Placeholders disponíveis</p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {PLACEHOLDER_DOCS.map((p) => (
                  <div key={p.token} className="flex items-start gap-2 text-xs">
                    <code className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-primary">
                      {p.token}
                    </code>
                    <span className="text-muted-foreground">{p.description}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Eye className="size-4 text-primary" /> Prévia com dados de exemplo
            </CardTitle>
          </CardHeader>
          <CardContent>
            {preview ? (
              <p
                className="rounded-md border border-border bg-muted/40 p-4 text-sm leading-relaxed"
                data-testid="text-preview"
              >
                {preview}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground" data-testid="text-preview-empty">
                O template está vazio — a geração usará o template padrão embutido.
              </p>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Exemplo montado com: aluno João da Silva, logo e cores da
              Escola Horizonte, logo IAschool e instruções extras.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="size-4 text-primary" /> Histórico de versões
            </CardTitle>
          </CardHeader>
          <CardContent>
            {versions.isLoading ? (
              <Skeleton className="h-20 w-full rounded-md" />
            ) : versions.isError ? (
              <p className="text-sm text-destructive" data-testid="text-versions-error">
                Não foi possível carregar o histórico de versões.
              </p>
            ) : !versions.data || versions.data.length === 0 ? (
              <p
                className="text-sm text-muted-foreground"
                data-testid="text-versions-empty"
              >
                Nenhuma versão salva ainda. Cada salvamento do template cria uma
                versão que pode ser restaurada aqui.
              </p>
            ) : (
              <ul className="divide-y divide-border" data-testid="list-versions">
                {versions.data.map((v, i) => (
                  <li
                    key={v.id}
                    className="flex items-center justify-between gap-3 py-3"
                    data-testid={`row-version-${v.id}`}
                  >
                    <button
                      type="button"
                      onClick={() => setViewingVersion(v)}
                      className="min-w-0 flex-1 cursor-pointer rounded-md text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      data-testid={`button-ver-versao-${v.id}`}
                    >
                      <p className="text-sm font-medium">
                        {new Date(v.savedAt).toLocaleString("pt-BR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                        {i === 0 && (
                          <Badge variant="secondary" className="ml-2">
                            Mais recente
                          </Badge>
                        )}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        Salvo por {v.savedBy} ·{" "}
                        <span className="font-mono">
                          {v.template.slice(0, 80)}
                          {v.template.length > 80 ? "…" : ""}
                        </span>
                      </p>
                    </button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onRestoreVersion(v)}
                      disabled={busy || v.template === (query.data?.template ?? "")}
                      data-testid={`button-restaurar-versao-${v.id}`}
                    >
                      <RotateCcw className="size-3.5" />
                      {restoringId === v.id ? "Restaurando..." : "Restaurar"}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={viewingVersion !== null}
        onOpenChange={(open) => {
          if (!open) setViewingVersion(null);
        }}
      >
        <DialogContent
          className="max-h-[85vh] max-w-3xl overflow-hidden"
          data-testid="dialog-ver-versao"
        >
          {viewingVersion && (
            <VersionDialogBody
              version={viewingVersion}
              currentTemplate={query.data?.template ?? DEFAULT_PROMPT_TEMPLATE}
              restoring={restoringId === viewingVersion.id}
              busy={busy}
              onRestore={() => void onRestoreVersion(viewingVersion)}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent data-testid="dialog-confirmar-avisos">
          <AlertDialogHeader>
            <AlertDialogTitle>Salvar mesmo com avisos?</AlertDialogTitle>
            <AlertDialogDescription>
              O template tem{" "}
              {warnings.length === 1
                ? "1 possível problema"
                : `${warnings.length} possíveis problemas`}
              : placeholders desconhecidos viram texto vazio na geração, e
              blocos sem fechamento ou trechos com sintaxe inválida ficam como
              texto literal no prompt. Você pode salvar assim mesmo ou voltar e
              corrigir.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancelar-salvar">
              Voltar e corrigir
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                void doSave();
              }}
              data-testid="button-salvar-mesmo-assim"
            >
              Salvar mesmo assim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function VersionDialogBody({
  version,
  currentTemplate,
  restoring,
  busy,
  onRestore,
}: {
  version: PromptTemplateVersion;
  currentTemplate: string;
  restoring: boolean;
  busy: boolean;
  onRestore: () => void;
}) {
  const [showDiff, setShowDiff] = useState(false);
  const isSame = version.template === currentTemplate;
  const diff = useMemo(
    () => (isSame ? [] : diffLines(version.template, currentTemplate)),
    [isSame, version.template, currentTemplate],
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          Versão de{" "}
          {new Date(version.savedAt).toLocaleString("pt-BR", {
            dateStyle: "short",
            timeStyle: "short",
          })}
        </DialogTitle>
        <DialogDescription>
          Salvo por {version.savedBy}.{" "}
          {isSame
            ? "Esta versão é idêntica ao template atual."
            : "Confira o texto completo antes de restaurar."}
        </DialogDescription>
      </DialogHeader>

      {!isSame && (
        <div className="flex items-center gap-2">
          <Button
            variant={showDiff ? "outline" : "secondary"}
            size="sm"
            onClick={() => setShowDiff(false)}
            data-testid="button-ver-texto"
          >
            Texto completo
          </Button>
          <Button
            variant={showDiff ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowDiff(true)}
            data-testid="button-ver-diferencas"
          >
            Diferenças vs. atual
          </Button>
        </div>
      )}

      <div className="max-h-[45vh] overflow-y-auto rounded-md border border-border bg-muted/40 p-3">
        {showDiff && !isSame ? (
          <div
            className="whitespace-pre-wrap font-mono text-xs leading-relaxed"
            data-testid="text-versao-diff"
          >
            {diff.map((line, idx) => (
              <div
                key={idx}
                className={
                  line.kind === "removed"
                    ? "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400"
                    : line.kind === "added"
                      ? "bg-destructive/10 text-destructive line-through decoration-destructive/50"
                      : "text-muted-foreground"
                }
              >
                {line.kind === "removed"
                  ? "+ "
                  : line.kind === "added"
                    ? "− "
                    : "  "}
                {line.text || "\u00a0"}
              </div>
            ))}
          </div>
        ) : (
          <pre
            className="whitespace-pre-wrap font-mono text-xs leading-relaxed"
            data-testid="text-versao-completa"
          >
            {version.template}
          </pre>
        )}
      </div>
      {showDiff && !isSame && (
        <p className="text-xs text-muted-foreground">
          <span className="text-yellow-600 dark:text-yellow-400">+ amarelo</span>
          : entra se você restaurar ·{" "}
          <span className="text-destructive">− riscado</span>: sai do template
          atual
        </p>
      )}

      <DialogFooter>
        <Button
          onClick={onRestore}
          disabled={busy || isSame}
          data-testid="button-restaurar-no-dialogo"
        >
          <RotateCcw className="size-4" />
          {restoring
            ? "Restaurando..."
            : isSame
              ? "Já é o template atual"
              : "Restaurar esta versão"}
        </Button>
      </DialogFooter>
    </>
  );
}
