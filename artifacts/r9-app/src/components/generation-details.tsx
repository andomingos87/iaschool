import { useState } from "react";
import { ChevronDown, Copy, FileText, Check } from "lucide-react";
import { cn } from "@workspace/iasport/lib/utils";
import { Button } from "@workspace/iasport/components/ui/button";
import { Badge } from "@workspace/iasport/components/ui/badge";
import { toast } from "@workspace/iasport/hooks/use-toast";
import type { GenerationDetails } from "@/lib/data";

/** Formata bytes em unidade legível (pt-BR). */
function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

interface GenerationDetailsSectionProps {
  /** null/undefined = geração antiga sem detalhes salvos */
  details: GenerationDetails | null | undefined;
  /** aberto por padrão? (fechado na tela de geração) */
  defaultOpen?: boolean;
  className?: string;
}

/**
 * "Detalhes da geração" — seção colapsável com o prompt final enviado
 * (com botão copiar) e o resumo do payload (modelo, tamanho e imagens).
 * Nunca exibe tokens/segredos: os dados vêm só dos metadados salvos.
 */
export function GenerationDetailsSection({
  details,
  defaultOpen = false,
  className,
}: GenerationDetailsSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);

  async function copyPrompt() {
    if (!details) return;
    try {
      await navigator.clipboard.writeText(details.prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Prompt copiado" });
    } catch {
      toast({
        variant: "destructive",
        title: "Não foi possível copiar",
        description: "Selecione o texto e copie manualmente.",
      });
    }
  }

  return (
    <div
      className={cn("w-full rounded-md border border-border", className)}
      data-testid="section-generation-details"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
        aria-expanded={open}
        data-testid="button-toggle-details"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <FileText className="size-4 text-primary" /> Detalhes da geração
        </span>
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="space-y-4 border-t border-border px-4 py-4">
          {!details ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="text-details-unavailable"
            >
              Detalhes não disponíveis para esta geração.
            </p>
          ) : (
            <>
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Prompt final enviado
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={copyPrompt}
                    data-testid="button-copy-prompt"
                  >
                    {copied ? (
                      <Check className="size-3.5" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                    {copied ? "Copiado" : "Copiar"}
                  </Button>
                </div>
                <p
                  className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs leading-relaxed text-foreground"
                  data-testid="text-final-prompt"
                >
                  {details.prompt}
                </p>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Resumo do payload
                </p>
                <div className="mb-2 flex flex-wrap gap-2">
                  <Badge variant="secondary" data-testid="badge-model">
                    Modelo: {details.model}
                  </Badge>
                  <Badge variant="secondary" data-testid="badge-size">
                    Tamanho: {details.size}
                  </Badge>
                </div>
                <ol className="space-y-1" data-testid="list-payload-images">
                  {details.images.map((img, i) => (
                    <li
                      key={`${img.fileName}-${i}`}
                      className="flex items-center justify-between gap-2 rounded-md bg-muted px-3 py-1.5 text-xs"
                      data-testid={`payload-image-${i}`}
                    >
                      <span className="min-w-0 truncate">
                        <span className="font-medium">{i + 1}. {img.role}</span>{" "}
                        <span className="text-muted-foreground">
                          ({img.fileName})
                        </span>
                      </span>
                      <span className="shrink-0 text-muted-foreground">
                        {formatBytes(img.sizeBytes)}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
