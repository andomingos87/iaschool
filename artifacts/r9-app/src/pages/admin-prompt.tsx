// Tela de administração do template do prompt de geração.
// Acessível apenas a super_admin (rota protegida em App.tsx e item de menu
// condicional no app-shell).

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Eye, RotateCcw, Save, Terminal } from "lucide-react";
import { Button } from "@workspace/iasport/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/iasport/components/ui/alert-dialog";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/iasport/components/ui/card";
import { Textarea } from "@workspace/iasport/components/ui/textarea";
import { Badge } from "@workspace/iasport/components/ui/badge";
import { Skeleton } from "@workspace/iasport/components/ui/skeleton";
import { toast } from "@workspace/iasport/hooks/use-toast";
import { PageHeader } from "@/components/app-shell";
import { ErrorState } from "@/components/data-state";
import {
  usePromptTemplate,
  useSavePromptTemplate,
  useResetPromptTemplate,
} from "@/hooks/use-prompt-template";
import {
  DEFAULT_PROMPT_TEMPLATE,
  PLACEHOLDER_DOCS,
  SAMPLE_CONTEXT,
  renderPromptTemplate,
  validatePromptTemplate,
} from "@/lib/prompt-template";

export default function AdminPromptPage() {
  const query = usePromptTemplate();
  const save = useSavePromptTemplate();
  const reset = useResetPromptTemplate();

  const [draft, setDraft] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

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
            <Textarea
              value={value}
              onChange={(e) => setDraft(e.target.value)}
              rows={14}
              className="font-mono text-xs leading-relaxed"
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
                  {warnings.map((w) => (
                    <li
                      key={`${w.token}-${w.message}`}
                      className="flex items-start gap-2 text-xs text-muted-foreground"
                    >
                      <code className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-yellow-500">
                        {w.token}
                      </code>
                      <span>{w.message}</span>
                    </li>
                  ))}
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
              Exemplo montado com: aluno João da Silva (Atacante), métricas,
              brasão e cores do clube, uniforme, logo R9 e instruções extras.
            </p>
          </CardContent>
        </Card>
      </div>

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
