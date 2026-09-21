import { useState } from "react";
import { ImageOff } from "lucide-react";
import { Button } from "@workspace/iaschool-ui/components/ui/button";
import { ImageLightbox } from "@/components/image-lightbox";
import type { Photo } from "@/lib/data";

const PAGE = 120;

/**
 * Grade simples das fotos já enviadas. Carrega em páginas de 120 para não
 * pedir centenas de imagens de uma vez; a galeria virtualizada com miniaturas
 * WebP é do M3 (spec §10).
 */
export function EventPhotoGrid({ photos }: { photos: Photo[] }) {
  const [limit, setLimit] = useState(PAGE);
  const [zoom, setZoom] = useState<string | null>(null);
  const visible = photos.slice(0, limit);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8" data-testid="grid-event-photos">
        {visible.map((p) => (
          <button
            key={p.id}
            type="button"
            className="group relative aspect-square overflow-hidden rounded-md border border-border bg-muted"
            onClick={() => p.displayUrl && setZoom(p.displayUrl)}
            title={p.originalFilename}
            data-testid={`photo-${p.id}`}
          >
            {p.displayUrl ? (
              <img
                src={p.displayUrl}
                alt=""
                loading="lazy"
                decoding="async"
                className="size-full object-cover transition-transform group-hover:scale-105"
              />
            ) : (
              <span className="flex size-full items-center justify-center text-muted-foreground">
                <ImageOff className="size-5" />
              </span>
            )}
          </button>
        ))}
      </div>
      {limit < photos.length && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => setLimit((l) => l + PAGE)} data-testid="button-load-more-photos">
            Mostrar mais ({(photos.length - limit).toLocaleString("pt-BR")} restantes)
          </Button>
        </div>
      )}
      <ImageLightbox src={zoom} onClose={() => setZoom(null)} />
    </div>
  );
}
