import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Clock,
  ImagePlus,
  Loader2,
  RotateCw,
  ScanFace,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@workspace/iaschool-ui/components/ui/alert";
import { Badge } from "@workspace/iaschool-ui/components/ui/badge";
import { Button } from "@workspace/iaschool-ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/iaschool-ui/components/ui/card";
import { toast } from "@workspace/iaschool-ui/hooks/use-toast";
import { CardsSkeleton, ErrorState } from "@/components/data-state";
import { ImageLightbox } from "@/components/image-lightbox";
import { activeByScope, useAuthorizations } from "@/hooks/use-authorizations";
import {
  useCancelReferenceJob,
  useEnqueueReferenceFace,
  useReferenceFaces,
  useReferenceJobs,
  useRemoveReferenceFace,
  useRetryReferenceJob,
} from "@/hooks/use-reference-faces";
import { getDataLayer } from "@/lib/data";
import type { Student } from "@/lib/data";
import { REFERENCE_FACES_RECOMMENDED } from "@/lib/data";
import { isAcceptedImage, prepareReferencePhoto } from "@/lib/upload";
import { formatDateTime, isoToBrDate } from "@/lib/format";

/** URLs assinadas das miniaturas, por caminho no bucket. */
function useSignedThumbs(paths: string[]): Map<string, string> {
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const key = paths.join("|");
  useEffect(() => {
    let cancelled = false;
    const data = getDataLayer();
    const wanted = key ? key.split("|") : [];
    void Promise.all(
      wanted.map(async (p) => {
        try {
          return [p, await data.referenceFaces.signUrl(p)] as const;
        } catch {
          return [p, ""] as const;
        }
      }),
    ).then((pairs) => {
      if (!cancelled) setUrls(new Map(pairs.filter(([, u]) => u)));
    });
    return () => {
      cancelled = true;
    };
  }, [key]);
  return urls;
}

/**
 * Aba "Rosto de referência" da ficha do aluno (spec §7.4).
 *
 * Uma foto basta para matricular (decisão #8): com uma só, a tela marca
 * cobertura baixa e o aviso some na segunda. Sem `biometric_sorting` ativa a
 * tela não deixa cadastrar — e o banco e o Storage também não, essa é a trava
 * que vale (D5).
 *
 * A foto vai para o bucket e entra numa fila: quem calcula o vetor é o motor
 * facial (`det_size` 640), que ainda não roda — até o M5 a referência fica
 * "aguardando processamento", e é isso que a tela diz.
 */
export function StudentReferenceFaces({ student }: { student: Student }) {
  const authorizations = useAuthorizations(student.id);
  const faces = useReferenceFaces(student.id);
  const jobs = useReferenceJobs(student.id);
  const enqueue = useEnqueueReferenceFace(student.id);
  const cancelJob = useCancelReferenceJob(student.id);
  const retryJob = useRetryReferenceJob(student.id);
  const removeFace = useRemoveReferenceFace(student.id);

  const inputRef = useRef<HTMLInputElement>(null);
  const [preparing, setPreparing] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);

  const consent = activeByScope(authorizations.data).get("biometric_sorting");
  const faceList = faces.data ?? [];
  const jobList = jobs.data ?? [];
  const pending = jobList.filter((j) => j.status !== "failed");
  const failed = jobList.filter((j) => j.status === "failed");
  const total = faceList.length + pending.length;

  const thumbs = useSignedThumbs([
    ...faceList.map((f) => f.sourcePhotoPath ?? "").filter(Boolean),
    ...jobList.map((j) => j.storagePath),
  ]);

  const busy = enqueue.isPending || preparing || cancelJob.isPending || removeFace.isPending;

  async function onPick(files: FileList | null) {
    if (!files || files.length === 0 || !consent) return;
    setPreparing(true);
    try {
      for (const file of Array.from(files)) {
        if (!isAcceptedImage(file)) {
          toast({
            variant: "destructive",
            title: "Arquivo não aceito",
            description: `"${file.name}" não é JPEG, PNG nem HEIC.`,
          });
          continue;
        }
        const prepared = await prepareReferencePhoto(file);
        await enqueue.mutateAsync({
          studentId: student.id,
          schoolId: student.schoolId,
          authorizationId: consent.id,
          blob: prepared.blob,
        });
      }
      toast({
        title: "Foto de referência enviada",
        description:
          "Ela entra na fila do reconhecimento; o rosto ainda não foi processado.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Não foi possível enviar",
        description:
          err instanceof Error ? err.message : "Tente novamente em instantes.",
      });
    } finally {
      setPreparing(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  if (authorizations.isError || faces.isError) {
    return (
      <ErrorState
        onRetry={() => {
          void authorizations.refetch();
          void faces.refetch();
        }}
      />
    );
  }

  if (authorizations.isLoading || faces.isLoading) {
    return <CardsSkeleton count={1} />;
  }

  return (
    <Card className="border-border" data-testid="card-reference-faces">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ScanFace className="size-4 text-primary" /> Rosto de referência
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!consent ? (
          <Alert variant="destructive" data-testid="alert-reference-no-consent">
            <ShieldAlert className="size-4" />
            <AlertTitle>Sem autorização de reconhecimento</AlertTitle>
            <AlertDescription>
              Ligue "Foto para reconhecimento" no cartão de autorizações antes de
              cadastrar o rosto deste aluno. Sem ela, o cadastro é recusado pelo
              banco, não só por esta tela.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/heic,image/heif"
                multiple
                className="hidden"
                onChange={(e) => void onPick(e.target.files)}
                data-testid="input-reference-photo"
              />
              <Button
                onClick={() => inputRef.current?.click()}
                disabled={busy}
                data-testid="button-add-reference-photo"
              >
                {preparing || enqueue.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ImagePlus className="size-4" />
                )}
                Adicionar foto
              </Button>
              <span className="text-sm text-muted-foreground">
                {total === 0
                  ? "Nenhuma foto de referência."
                  : `${total} foto${total > 1 ? "s" : ""} de referência.`}
              </span>
            </div>

            {total > 0 && total < REFERENCE_FACES_RECOMMENDED && (
              <Alert data-testid="alert-reference-low-coverage">
                <AlertTriangle className="size-4" />
                <AlertTitle>Cobertura baixa</AlertTitle>
                <AlertDescription>
                  Uma foto já matricula o aluno. Com a segunda foto frontal, a
                  chance de o rosto dele cair na fila manual de revisão diminui.
                </AlertDescription>
              </Alert>
            )}
          </>
        )}

        {faceList.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Processadas</p>
            <div className="flex flex-wrap gap-3">
              {faceList.map((f) => {
                const url = f.sourcePhotoPath ? thumbs.get(f.sourcePhotoPath) : undefined;
                return (
                  <div
                    key={f.id}
                    className="w-32 overflow-hidden rounded-md border border-border"
                    data-testid={`reference-face-${f.id}`}
                  >
                    <button
                      type="button"
                      className="block size-32 bg-muted"
                      onClick={() => url && setZoom(url)}
                      disabled={!url}
                    >
                      {url ? (
                        <img
                          src={url}
                          alt={`Rosto de referência de ${student.name}`}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : null}
                    </button>
                    <div className="space-y-1 p-2">
                      <p className="text-[11px] text-muted-foreground">
                        Válida até {isoToBrDate(f.retentionUntil)}
                      </p>
                      {f.expired && (
                        <Badge variant="destructive" className="text-[10px]">
                          Prazo vencido
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-full justify-start px-1 text-destructive"
                        disabled={busy}
                        onClick={() => void removeFace.mutateAsync(f.id)}
                        data-testid={`button-remove-reference-${f.id}`}
                      >
                        <Trash2 className="size-3.5" /> Remover
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {pending.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Aguardando processamento
            </p>
            <div className="flex flex-wrap gap-3">
              {pending.map((j) => {
                const url = thumbs.get(j.storagePath);
                return (
                  <div
                    key={j.id}
                    className="w-32 overflow-hidden rounded-md border border-dashed border-border"
                    data-testid={`reference-job-${j.id}`}
                  >
                    <div className="relative size-32 bg-muted">
                      {url && (
                        <img
                          src={url}
                          alt={`Foto de referência de ${student.name}`}
                          className="h-full w-full object-cover opacity-60"
                          loading="lazy"
                        />
                      )}
                      <span className="absolute inset-0 flex items-center justify-center">
                        <Clock className="size-5 text-muted-foreground" />
                      </span>
                    </div>
                    <div className="space-y-1 p-2">
                      <p className="text-[11px] text-muted-foreground">
                        Enviada em {formatDateTime(j.createdAt)}
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-full justify-start px-1"
                        disabled={busy}
                        onClick={() => void cancelJob.mutateAsync(j.id)}
                        data-testid={`button-cancel-reference-job-${j.id}`}
                      >
                        <X className="size-3.5" /> Descartar
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              O rosto só vira referência depois que o reconhecimento facial
              processa a foto. Esse serviço ainda não está no ar — as fotos
              ficam na fila até ele entrar.
            </p>
          </div>
        )}

        {failed.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-destructive">Falharam</p>
            {failed.map((j) => (
              <div
                key={j.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/40 p-2 text-xs"
                data-testid={`reference-job-failed-${j.id}`}
              >
                <span className="text-muted-foreground">
                  {j.lastError ?? "Não foi possível processar esta foto."}
                </span>
                <span className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7"
                    disabled={busy || retryJob.isPending}
                    onClick={() => void retryJob.mutateAsync(j.id)}
                    data-testid={`button-retry-reference-job-${j.id}`}
                  >
                    <RotateCw className="size-3.5" /> Tentar de novo
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-destructive"
                    disabled={busy}
                    onClick={() => void cancelJob.mutateAsync(j.id)}
                  >
                    <Trash2 className="size-3.5" /> Descartar
                  </Button>
                </span>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          A referência vale até o fim do ano letivo e não é renovada
          automaticamente: o rosto da criança muda, e o recadastro anual é o
          que mantém a separação confiável.
        </p>
      </CardContent>

      <ImageLightbox src={zoom} onClose={() => setZoom(null)} />
    </Card>
  );
}
