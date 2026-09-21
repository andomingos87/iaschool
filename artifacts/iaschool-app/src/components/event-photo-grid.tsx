import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Skeleton } from "@workspace/iaschool-ui/components/ui/skeleton";
import { toast } from "@workspace/iaschool-ui/hooks/use-toast";
import { ImageLightbox } from "@/components/image-lightbox";
import { useSignedPhotoUrl, useThumbUrls } from "@/hooks/use-photos";
import type { Photo } from "@/lib/data";
import {
  GALLERY_GAP_PX,
  columnsForWidth,
  indicesForRows,
  rowCount,
  rowHeight,
} from "@/lib/gallery/layout";

/**
 * Galeria virtualizada (spec §10, R3): só as linhas visíveis (mais 3 de
 * folga) existem no DOM, e só as miniaturas visíveis têm URL assinada. A
 * página rola pela janela (o `<main>` do shell não tem overflow próprio), por
 * isso `useWindowVirtualizer` com `scrollMargin`. Célula quadrada: a altura
 * da linha é determinística e não precisa de `measureElement`.
 */
export function EventPhotoGrid({ photos, eventId }: { photos: Photo[]; eventId: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [scrollMargin, setScrollMargin] = useState(0);
  const [zoom, setZoom] = useState<{ src: string | null; alt: string } | null>(null);
  const signPhoto = useSignedPhotoUrl();

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      setWidth(el.clientWidth);
      setScrollMargin(el.getBoundingClientRect().top + window.scrollY);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const cols = columnsForWidth(width || 1024);
  const rowH = rowHeight(width || 1024, cols);
  const rows = rowCount(photos.length, cols);

  const virtualizer = useWindowVirtualizer({
    count: rows,
    estimateSize: () => rowH,
    overscan: 3,
    scrollMargin,
  });

  // Colunas/altura mudaram (redimensionou a janela): recalcula as posições.
  useEffect(() => {
    virtualizer.measure();
  }, [virtualizer, cols, rowH]);

  const virtualRows = virtualizer.getVirtualItems();
  const visible = useMemo(() => {
    if (virtualRows.length === 0) return [] as Photo[];
    const [start, end] = indicesForRows(
      virtualRows[0]!.index,
      virtualRows[virtualRows.length - 1]!.index,
      cols,
      photos.length,
    );
    return photos.slice(start, end);
  }, [virtualRows, cols, photos]);
  const thumbUrl = useThumbUrls(eventId, visible);

  async function open(photo: Photo) {
    setZoom({ src: null, alt: photo.originalFilename });
    try {
      const src = await signPhoto(photo);
      setZoom((z) => (z && z.alt === photo.originalFilename ? { src, alt: z.alt } : z));
    } catch (err) {
      setZoom(null);
      toast({
        variant: "destructive",
        title: "Não foi possível abrir a foto",
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    }
  }

  return (
    <div ref={containerRef} className="w-full" data-testid="grid-event-photos">
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualRows.map((row) => {
          const [start, end] = indicesForRows(row.index, row.index, cols, photos.length);
          return (
            <div
              key={row.key}
              className="absolute left-0 top-0 grid w-full"
              style={{
                transform: `translateY(${row.start - virtualizer.options.scrollMargin}px)`,
                height: row.size,
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                gap: GALLERY_GAP_PX,
              }}
              data-testid={`gallery-row-${row.index}`}
            >
              {photos.slice(start, end).map((p) => (
                <PhotoCell key={p.id} photo={p} url={thumbUrl(p.id)} onOpen={() => void open(p)} />
              ))}
            </div>
          );
        })}
      </div>
      {zoom && !zoom.src && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60" aria-live="polite">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}
      <ImageLightbox src={zoom?.src ?? null} alt={zoom?.alt} onClose={() => setZoom(null)} />
    </div>
  );
}

function PhotoCell({ photo, url, onOpen }: { photo: Photo; url: string | undefined; onOpen: () => void }) {
  const failed = photo.status === "failed";
  const waiting = !photo.thumbPath && !failed; // pending/processing: o worker ainda não passou
  return (
    <button
      type="button"
      className={`group relative aspect-square overflow-hidden rounded-md border border-border ${
        failed ? "bg-destructive/10" : "bg-muted"
      }`}
      onClick={onOpen}
      title={failed ? photo.error ?? "Não processada" : waiting ? "Processando…" : photo.originalFilename}
      aria-label={photo.originalFilename}
      data-testid={`photo-${photo.id}`}
      data-status={photo.status}
    >
      {url ? (
        <img
          src={url}
          alt=""
          decoding="async"
          className="size-full object-cover transition-transform group-hover:scale-105"
        />
      ) : failed ? (
        <span className="flex size-full flex-col items-center justify-center gap-1 text-destructive">
          <AlertTriangle className="size-5" />
          <span className="text-[10px] font-medium uppercase tracking-wide">Falhou</span>
        </span>
      ) : (
        <span className="relative flex size-full items-center justify-center">
          <Skeleton className="absolute inset-0 rounded-none" />
          {waiting && <Loader2 className="relative size-4 animate-spin text-muted-foreground/70" />}
        </span>
      )}
    </button>
  );
}
