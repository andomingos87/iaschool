import { useEffect, useRef, useState } from "react";
import { Download, Images, Loader2, Maximize2, ScanFace } from "lucide-react";
import { Button } from "@workspace/iaschool-ui/components/ui/button";
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
import { useEvents } from "@/hooks/use-events";
import { useAuth } from "@/hooks/use-auth";
import { getDataLayer } from "@/lib/data";
import type { Student, StudentPhoto } from "@/lib/data";
import { toast } from "@workspace/iaschool-ui/hooks/use-toast";
import { isoToBrDate } from "@/lib/format";
import { safeZipName } from "@/lib/zip";
import {
  ALL_EVENTS,
  downloadLabel,
  folderAccess,
  groupConfirmedPhotos,
  photosForFilter,
  runStudentZipDownload,
  startBlobDownload,
  type FolderPhotoRef,
  type ZipRunResult,
} from "@/lib/student-folder";

const filterMemory = new Map<string, string>();

function toFolderPhoto(photo: StudentPhoto, schoolId: string): FolderPhotoRef {
  return {
    id: photo.id,
    eventId: photo.eventId,
    storagePath: photo.storagePath,
    thumbPath: photo.thumbPath,
    takenAt: photo.takenAt,
    createdAt: photo.createdAt,
    confirmed: true,
    schoolId,
  };
}

/**
 * Pasta do aluno (S03). Consulta, não cópia: uma foto com várias crianças
 * confirmadas aparece nas pastas delas, com um único arquivo no Storage.
 * Sugestão de rosto não entra. O ZIP nasce no navegador e não é guardado.
 */
export function StudentPhotoFolder({ student }: { student: Student }) {
  const { session, loading: authLoading } = useAuth();
  const schoolId = session?.activeSchoolId ?? "";
  const allowed = folderAccess(student.schoolId, schoolId) === "ok";
  const photos = useStudentPhotos(allowed ? student.id : null);
  const events = useEvents();
  const [thumbs, setThumbs] = useState<Map<string, string>>(new Map());
  const [zoom, setZoom] = useState<string | null>(null);
  const [filter, setFilter] = useState(() => filterMemory.get(student.id) ?? ALL_EVENTS);
  const [progress, setProgress] = useState<{ processed: number; total: number } | null>(null);
  const [zipNotice, setZipNotice] = useState<Extract<ZipRunResult, { status: "partial" | "error" }> | null>(null);
  const running = useRef(false);

  useEffect(() => {
    setFilter(filterMemory.get(student.id) ?? ALL_EVENTS);
  }, [student.id]);

  const list = (photos.data ?? []).map((photo) => toFolderPhoto(photo, student.schoolId));
  const groups = groupConfirmedPhotos({
    photos: list,
    events: (events.data ?? []).map((event) => ({
      id: event.id,
      name: event.name,
      eventDate: event.eventDate,
      schoolId: event.schoolId,
    })),
    schoolId,
  });
  const effectiveFilter =
    filter === ALL_EVENTS || groups.some((group) => group.id === filter) ? filter : ALL_EVENTS;
  const visible = photosForFilter(groups, effectiveFilter);
  const visibleKey = visible.map((photo) => photo.id).join("|");

  useEffect(() => {
    if (!allowed || visible.length === 0) {
      setThumbs(new Map());
      return;
    }
    let cancelled = false;
    void getDataLayer()
      .photos.signThumbUrls(visible.map((photo) => ({ id: photo.id, thumbPath: photo.thumbPath })))
      .then((urls) => {
        if (!cancelled) setThumbs(urls);
      })
      .catch(() => {
        if (!cancelled) setThumbs(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [allowed, visibleKey]);

  function chooseFilter(next: string) {
    filterMemory.set(student.id, next);
    setFilter(next);
    setZoom(null);
  }

  async function open(photo: FolderPhotoRef) {
    try {
      setZoom(await getDataLayer().photos.signPhotoUrl({ storagePath: photo.storagePath }));
    } catch {
      setZoom(thumbs.get(photo.id) ?? null);
    }
  }

  async function downloadZip() {
    setZipNotice(null);
    const result = await runStudentZipDownload({
      running,
      photos: list,
      events: (events.data ?? []).map((event) => ({
        id: event.id,
        name: event.name,
        eventDate: event.eventDate,
        schoolId: event.schoolId,
      })),
      schoolId,
      filterId: effectiveFilter,
      signUrls: (paths) => getDataLayer().photos.signPhotoUrls(paths),
      fetchResponse: async (url) => {
        const response = await fetch(url);
        return {
          ok: response.ok,
          status: response.status,
          bytes: new Uint8Array(await response.arrayBuffer()),
        };
      },
      onProgress: (processed, total) => setProgress({ processed, total }),
    });
    setProgress(null);
    if (result.status === "busy" || result.status === "disabled") return;
    if (result.status === "error") {
      setZipNotice(result);
      toast({
        variant: "destructive",
        title: "Nenhuma foto entrou no arquivo",
        description: "Nada foi baixado. Tente de novo.",
      });
      return;
    }
    startBlobDownload({
      blob: result.blob,
      filename: `${safeZipName(student.name, "aluno")} - fotos.zip`,
      createObjectURL: (blob) => URL.createObjectURL(blob),
      revokeObjectURL: (url) => URL.revokeObjectURL(url),
      click: (url, filename) => {
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
      },
      schedule: (fn, ms) => {
        window.setTimeout(fn, ms);
      },
    });
    if (result.status === "partial") {
      setZipNotice(result);
      toast({
        title: "ZIP incompleto",
        description: `${result.included} fotos no arquivo. ${result.missing} não entraram.`,
      });
    }
  }

  const loading = authLoading || (allowed && (photos.isLoading || events.isLoading));
  const failed = allowed && (photos.isError || events.isError);
  const downloadDisabled = visible.length === 0 || progress !== null;

  return (
    <Card className="border-border" data-testid="card-student-photo-folder">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Images className="size-4 text-primary" /> Fotos do aluno
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <CardsSkeleton count={2} />
        ) : !allowed ? (
          <Alert data-testid="alert-student-folder-denied">
            <ScanFace className="size-4" />
            <AlertTitle>Pasta indisponível nesta escola</AlertTitle>
            <AlertDescription>
              As fotos confirmadas deste aluno não aparecem fora da escola dele.
            </AlertDescription>
          </Alert>
        ) : failed ? (
          <ErrorState
            onRetry={() => {
              void photos.refetch();
              void events.refetch();
            }}
          />
        ) : groups.length === 0 ? (
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
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0 flex-1">
                <label htmlFor="student-folder-event" className="text-sm font-medium">
                  Evento
                </label>
                <select
                  id="student-folder-event"
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  value={effectiveFilter}
                  onChange={(event) => chooseFilter(event.target.value)}
                  data-testid="select-student-folder-event"
                >
                  <option value={ALL_EVENTS}>
                    Todos os eventos ({groups.reduce((sum, group) => sum + group.photos.length, 0)})
                  </option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                      {group.eventDate ? ` · ${isoToBrDate(group.eventDate)}` : ""}
                      {` (${group.photos.length})`}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void downloadZip()}
                disabled={downloadDisabled}
                data-testid="button-download-student-zip"
              >
                {progress ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Baixando {progress.processed} de {progress.total}
                  </>
                ) : (
                  <>
                    <Download className="size-4" /> {downloadLabel(effectiveFilter)}
                  </>
                )}
              </Button>
            </div>

            {zipNotice?.status === "partial" && (
              <Alert className="mb-3" data-testid="alert-student-zip-partial">
                <AlertTitle>ZIP incompleto</AlertTitle>
                <AlertDescription className="flex flex-wrap items-center gap-2">
                  <span>
                    {zipNotice.included} fotos no arquivo. {zipNotice.missing} não entraram.
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void downloadZip()}
                    disabled={progress !== null}
                    data-testid="button-retry-student-zip"
                  >
                    Tentar novamente
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            {zipNotice?.status === "error" && (
              <Alert className="mb-3" variant="destructive" data-testid="alert-student-zip-error">
                <AlertTitle>Nenhuma foto entrou no arquivo</AlertTitle>
                <AlertDescription className="flex flex-wrap items-center gap-2">
                  <span>Nada foi baixado.</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void downloadZip()}
                    disabled={progress !== null}
                    data-testid="button-retry-student-zip"
                  >
                    Tentar novamente
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {visible.length === 0 ? (
              effectiveFilter === ALL_EVENTS ? (
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
                <Alert data-testid="alert-student-folder-event-empty">
                  <ScanFace className="size-4" />
                  <AlertTitle>Este evento não tem fotos confirmadas deste aluno</AlertTitle>
                  <AlertDescription>
                    Escolha outro evento ou volte para todos.
                  </AlertDescription>
                </Alert>
              )
            ) : (
              <div className="space-y-5">
                {(effectiveFilter === ALL_EVENTS ? groups.filter((group) => group.photos.length > 0) : groups.filter((group) => group.id === effectiveFilter)).map((group) => (
                  <section key={group.id} data-testid={`student-folder-event-${group.id}`}>
                    <h3 className="mb-2 text-sm font-medium">
                      {group.name}
                      {group.eventDate ? ` · ${isoToBrDate(group.eventDate)}` : ""}
                      <span className="ml-2 font-normal text-muted-foreground">
                        {group.photos.length === 1 ? "1 foto" : `${group.photos.length} fotos`}
                      </span>
                    </h3>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                      {group.photos.map((photo) => {
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
                              <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/60 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                                <Maximize2 className="size-4" />
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>

      <ImageLightbox src={zoom} onClose={() => setZoom(null)} />
    </Card>
  );
}
