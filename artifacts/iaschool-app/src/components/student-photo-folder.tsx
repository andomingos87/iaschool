import { useEffect, useState } from "react";
import { Images, Maximize2, ScanFace } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@workspace/iaschool-ui/components/ui/alert";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/iaschool-ui/components/ui/card";
import { CardsSkeleton, ErrorState } from "@/components/data-state";
import { ImageLightbox } from "@/components/image-lightbox";
import { useStudentPhotos } from "@/hooks/use-photos";
import { getDataLayer } from "@/lib/data";
import type { Student, StudentPhoto } from "@/lib/data";
import { formatDateTime } from "@/lib/format";

/**
 * Pasta do aluno (spec §7.6). Consulta, não cópia: uma foto com cinco
 * crianças confirmadas aparece nas cinco pastas, com um único arquivo no
 * Storage.
 *
 * Só entra rosto **confirmado** na revisão. Sugestão do reconhecimento não
 * chega aqui, e por isso não chega a download nem a envio (D6).
 */
export function StudentPhotoFolder({ student }: { student: Student }) {
  const photos = useStudentPhotos(student.id);
  const [thumbs, setThumbs] = useState<Map<string, string>>(new Map());
  const [zoom, setZoom] = useState<string | null>(null);

  const list: StudentPhoto[] = photos.data ?? [];
  const key = list.map((p) => p.id).join("|");

  useEffect(() => {
    if (list.length === 0) {
      setThumbs(new Map());
      return;
    }
    let cancelled = false;
    void getDataLayer()
      .photos.signThumbUrls(list.map((p) => ({ id: p.id, thumbPath: p.thumbPath })))
      .then((urls) => {
        if (!cancelled) setThumbs(urls);
      })
      .catch(() => {
        if (!cancelled) setThumbs(new Map());
      });
    return () => {
      cancelled = true;
    };
    // `key` muda quando a lista muda; `list` é recriada a cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  async function open(photo: StudentPhoto) {
    try {
      setZoom(await getDataLayer().photos.signPhotoUrl({ storagePath: photo.storagePath }));
    } catch {
      setZoom(thumbs.get(photo.id) ?? null);
    }
  }

  return (
    <Card className="border-border" data-testid="card-student-photo-folder">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Images className="size-4 text-primary" /> Fotos do aluno
        </CardTitle>
      </CardHeader>
      <CardContent>
        {photos.isError ? (
          <ErrorState onRetry={() => photos.refetch()} />
        ) : photos.isLoading ? (
          <CardsSkeleton count={2} />
        ) : list.length === 0 ? (
          <Alert data-testid="alert-student-folder-empty">
            <ScanFace className="size-4" />
            <AlertTitle>Nenhuma foto confirmada ainda</AlertTitle>
            <AlertDescription>
              O reconhecimento separa as fotos por rosto, mas quem decide de
              quem é cada rosto é uma pessoa. A pasta enche depois que a
              revisão do evento confirma as sugestões.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted-foreground">
              {list.length === 1 ? "1 foto confirmada" : `${list.length} fotos confirmadas`}.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {list.map((photo) => {
                const url = thumbs.get(photo.id);
                return (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => void open(photo)}
                    className="group overflow-hidden rounded-md border border-border bg-muted text-left"
                    data-testid={`student-photo-${photo.id}`}
                  >
                    <div className="relative aspect-square overflow-hidden">
                      {url ? (
                        <img
                          src={url}
                          alt={`Foto de ${student.name}`}
                          className="h-full w-full object-cover transition-transform group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : null}
                      <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/60 opacity-0 transition-opacity group-hover:opacity-100">
                        <Maximize2 className="size-4" />
                      </span>
                    </div>
                    {photo.takenAt && (
                      <p className="p-2 text-[11px] text-muted-foreground">
                        {formatDateTime(photo.takenAt)}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </CardContent>

      <ImageLightbox src={zoom} onClose={() => setZoom(null)} />
    </Card>
  );
}
