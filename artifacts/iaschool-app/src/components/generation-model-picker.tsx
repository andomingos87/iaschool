import { useState } from "react";
import { Button } from "@workspace/iaschool-ui/components/ui/button";
import { Textarea } from "@workspace/iaschool-ui/components/ui/textarea";
import { MultiUpload } from "@/components/multi-upload";
import { EmptyState, ErrorState } from "@/components/data-state";
import { useAuth } from "@/hooks/use-auth";
import { useCreateReference } from "@/hooks/use-references";
import { BUCKETS } from "@/lib/constants";
import { modelPage } from "@/lib/generation-batches";
import {
  ART_ICEBREAKERS,
  appendIcebreaker,
} from "@/lib/prompt-template";
import type { ReferencePost, StoredImage } from "@/lib/data";
import { Images } from "lucide-react";

export function GenerationModelPicker({
  schoolId,
  models,
  loading,
  error,
  onRetry,
  referenceId,
  onReference,
  prompt,
  onPrompt,
  noLogo,
  noText,
  onNoLogo,
  onNoText,
  disabled = false,
}: {
  schoolId: string;
  models: ReferencePost[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  referenceId: string | null;
  onReference: (id: string) => void;
  prompt: string;
  onPrompt: (value: string) => void;
  noLogo: boolean;
  noText: boolean;
  onNoLogo: (value: boolean) => void;
  onNoText: (value: boolean) => void;
  disabled?: boolean;
}) {
  const { session } = useAuth();
  const create = useCreateReference();
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState<StoredImage[]>([]);
  const view = modelPage(models, page);
  async function save(images: StoredImage[]) {
    const added = images.filter((image) => !pending.some((item) => item.id === image.id));
    setPending(images);
    for (const image of added) {
      const created = await create.mutateAsync({
        image,
        uploadedBy: session?.user.id ?? "unknown",
        schoolId,
      });
      onReference(created.id);
    }
    if (added.length > 0) setPending([]);
  }
  return (
    <div className="space-y-4">
      <MultiUpload
        bucket={BUCKETS.references}
        value={pending}
        onChange={save}
        disabled={disabled}
        label="Enviar um modelo"
        data-testid="upload-generation-model"
      />
      {loading ? (
        <p role="status">Carregando os modelos…</p>
      ) : error ? (
        <ErrorState
          message="Não foi possível carregar os modelos."
          onRetry={onRetry}
        />
      ) : models.length === 0 ? (
        <EmptyState
          icon={<Images className="size-6" />}
          title="Nenhum modelo desta escola"
          description="Envie uma arte para servir de estilo. Modelos de outras escolas não aparecem aqui."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {view.items.map((model) => {
              const pressed = model.id === referenceId;
              return (
                <button
                  key={model.id}
                  type="button"
                  aria-pressed={pressed}
                  disabled={disabled}
                  onClick={() => onReference(model.id)}
                  className={`overflow-hidden rounded-lg border text-left focus-visible:ring-2 focus-visible:ring-ring ${pressed ? "border-primary ring-2 ring-primary" : ""}`}
                >
                  <img
                    src={model.image.url}
                    alt={model.title ?? "Modelo de arte"}
                    loading="lazy"
                    className="aspect-square w-full object-cover"
                  />
                  <span className="block px-2 py-2 text-sm">
                    {pressed ? "Escolhido" : "Usar este modelo"}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={view.page <= 1}
              onClick={() => setPage(view.page - 1)}
            >
              Anterior
            </Button>
            <p className="text-sm" aria-live="polite">
              Página {view.page} de {view.pages}
            </p>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={view.page >= view.pages}
              onClick={() => setPage(view.page + 1)}
            >
              Próxima
            </Button>
          </div>
        </>
      )}
      <div className="space-y-2">
        <label className="block font-semibold" htmlFor="arte-prompt">
          Quer acrescentar alguma instrução?
        </label>
        <p className="text-sm text-muted-foreground">
          Opcional. O modelo já define o estilo. Pode deixar em branco.
        </p>
        <Textarea
          id="arte-prompt"
          value={prompt}
          disabled={disabled}
          onChange={(event) => onPrompt(event.target.value)}
          maxLength={3000}
          rows={4}
          placeholder="Ex.: clima de festa, com o nome do evento."
        />
        <div className="flex flex-wrap gap-2">
          {ART_ICEBREAKERS.map((item) => (
            <Button
              key={item.id}
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={disabled}
              onClick={() => onPrompt(appendIcebreaker(prompt, item.text))}
            >
              {item.label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={noLogo ? "default" : "outline"}
            className="min-h-11"
            aria-pressed={noLogo}
            disabled={disabled}
            onClick={() => onNoLogo(!noLogo)}
          >
            Remover logo
          </Button>
          <Button
            type="button"
            variant={noText ? "default" : "outline"}
            className="min-h-11"
            aria-pressed={noText}
            disabled={disabled}
            onClick={() => onNoText(!noText)}
          >
            Remover texto
          </Button>
        </div>
      </div>
    </div>
  );
}
