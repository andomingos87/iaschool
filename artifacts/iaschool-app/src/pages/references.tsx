import { useState } from "react";
import { Images, Maximize2, Trash2, UploadCloud } from "lucide-react";
import { Button } from "@workspace/iaschool-ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/iaschool-ui/components/ui/card";
import { toast } from "@workspace/iaschool-ui/hooks/use-toast";
import { PageHeader } from "@/components/app-shell";
import { GallerySkeleton, EmptyState, ErrorState } from "@/components/data-state";
import { MultiUpload } from "@/components/multi-upload";
import { ImageLightbox } from "@/components/image-lightbox";
import { ConfirmDelete } from "@/components/confirm-delete";
import {
  useReferences,
  useCreateReference,
  useDeleteReference,
} from "@/hooks/use-references";
import { useAuth } from "@/hooks/use-auth";
import type { ReferencePost, StoredImage } from "@/lib/data";
import { BUCKETS } from "@/lib/constants";

export default function ReferencesPage() {
  const { session } = useAuth();
  const refs = useReferences();
  const create = useCreateReference();
  const del = useDeleteReference();
  const [pending, setPending] = useState<StoredImage[]>([]);
  const [zoom, setZoom] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<ReferencePost | null>(null);

  async function handleAdd(images: StoredImage[]) {
    // Salva cada nova imagem como um modelo de arte
    const added = images.filter((img) => !pending.some((p) => p.id === img.id));
    setPending(images);
    for (const img of added) {
      try {
        await create.mutateAsync({
          image: img,
          uploadedBy: session?.user.id ?? "unknown",
        });
      } catch {
        toast({ variant: "destructive", title: "Falha ao salvar o modelo" });
      }
    }
    if (added.length > 0) {
      toast({
        title: "Modelo adicionado",
        description: `${added.length} imagem(ns) na galeria.`,
      });
      setPending([]);
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    try {
      await del.mutateAsync(toDelete.id);
      toast({ title: "Modelo removido" });
      setToDelete(null);
    } catch {
      toast({ variant: "destructive", title: "Não foi possível excluir" });
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Modelos de arte"
        description="Galeria de posts do Instagram usados como estilo na geração."
      />

      <Card className="mb-6 border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UploadCloud className="size-4 text-primary" /> Enviar modelos
          </CardTitle>
          <CardDescription>
            Envie imagens de posts que servem de inspiração visual.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MultiUpload
            bucket={BUCKETS.references}
            value={pending}
            onChange={handleAdd}
            label="Arraste os modelos aqui ou clique para selecionar"
            data-testid="upload-references"
          />
        </CardContent>
      </Card>

      {refs.isError ? (
        <ErrorState onRetry={() => refs.refetch()} />
      ) : refs.isLoading ? (
        <GallerySkeleton />
      ) : (refs.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<Images className="size-6" />}
          title="Galeria vazia"
          description="Envie artes prontas para orientar o estilo das imagens geradas."
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {refs.data!.map((r) => (
            <div
              key={r.id}
              className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted"
              data-testid={`card-reference-${r.id}`}
            >
              <img
                src={r.image.url}
                alt={r.title ?? "Modelo de arte"}
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                <Button
                  size="icon"
                  variant="secondary"
                  className="h-9 w-9"
                  onClick={() => setZoom(r.image.url)}
                  data-testid={`button-zoom-reference-${r.id}`}
                >
                  <Maximize2 className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="destructive"
                  className="h-9 w-9"
                  onClick={() => setToDelete(r)}
                  data-testid={`button-delete-reference-${r.id}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ImageLightbox src={zoom} onClose={() => setZoom(null)} />
      <ConfirmDelete
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Remover modelo?"
        description="A imagem será removida da galeria de modelos."
        onConfirm={confirmDelete}
        loading={del.isPending}
      />
    </div>
  );
}
