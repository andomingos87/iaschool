import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
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
import {
  ACCEPTED_FORMATS_LABEL,
  ACCEPT_ATTRIBUTE,
  isAcceptedImage,
  prepareReferencePhoto,
} from "@/lib/upload";
import { enqueueProfileReference } from "@/lib/enqueue-profile-reference";
import { formatDateTime, isoToBrDate } from "@/lib/format";
import { hashFromReferencePath, sha256Hex } from "@/lib/reference-from-profile";

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
 * A foto vai para o bucket e entra numa fila: quem calcula o vetor é o laço de
 * referência do `face-worker` (`det_size` 640). Até ele processar, a
 * referência fica "aguardando processamento", e é isso que a tela diz.
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

  async function useProfilePhoto() {
    setPreparing(true);
    try {
      const decision = await enqueueProfileReference(student);
      if (decision === "enqueue") {
        void faces.refetch();
        void jobs.refetch();
        toast({
          title: "Foto de perfil na fila",
          description: "Ela entrou como rosto de referência e aguarda o processamento.",
        });
      } else if (decision === "duplicate") {
        toast({
          title: "Foto já enviada",
          description: "A foto de perfil já está na fila ou entre as referências.",
        });
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Não foi possível usar a foto de perfil",
        description: err instanceof Error ? err.message : "Tente novamente em instantes.",
      });
    } finally {
      setPreparing(false);
    }
  }

  async function onPick(files: FileList | null) {
    if (!files || files.length === 0 || !consent) return;
    setPreparing(true);
    const seen = new Set(
      [...faceList.map((f) => f.sourcePhotoPath ?? ""), ...jobList.map((j) => j.storagePath)]
        .map((path) => hashFromReferencePath(path)?.hash)
        .filter((hash): hash is string => Boolean(hash)),
    );
    let sent = 0;
    try {
      for (const file of Array.from(files)) {
        if (!isAcceptedImage(file)) {
          toast({
            variant: "destructive",
            title: "Arquivo não aceito",
            description: `"${file.name}" não está num formato aceito (${ACCEPTED_FORMATS_LABEL}).`,
          });
          continue;
        }
        const prepared = await prepareReferencePhoto(file);
        const contentHash = await sha256Hex(prepared.blob);
        if (seen.has(contentHash)) {
          toast({
            title: "Foto já enviada",
            description: "Essa imagem já está na fila ou entre as referências.",
          });
          continue;
        }
        seen.add(contentHash);
        await enqueue.mutateAsync({
          studentId: student.id,
          schoolId: student.schoolId,
          authorizationId: consent.id,
          blob: prepared.blob,
          contentHash,
        });
        sent += 1;
      }
      if (sent > 0) {
        toast({
          title: "Foto de referência enviada",
          description:
            "Ela entra na fila do reconhecimento; o rosto ainda não foi processado.",
        });
      }
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
              Ligue “Reconhecer o rosto” na ficha antes de cadastrar o rosto deste
              aluno. Sem o interruptor, a foto de perfil fica só na galeria e nenhum
              job é criado.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT_ATTRIBUTE}
                multiple
                className="hidden"
                onChange={(e) => void onPick(e.target.files)}
                data-testid="input-reference-photo"
              />
              {student.photos[0] && (
                <Button
                  variant="outline"
                  onClick={() => void useProfilePhoto()}
                  disabled={busy}
                  data-testid="button-use-profile-photo"
                >
                  Usar a foto de perfil
                </Button>
              )}
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
                      {f.sourcePhotoPath &&
                        hashFromReferencePath(f.sourcePhotoPath)?.fromProfile &&
                        !student.photos[0] && (
                          <p className="text-[11px] text-muted-foreground">
                            A foto de perfil que originou esta referência foi removida da galeria.
                          </p>
                        )}
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
                    <div className="relative size-32 overflow-hidden bg-muted">
                      {url && (
                        <img
                          src={url}
                          alt={`Foto de referência de ${student.name}`}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      )}
                      <span
                        aria-hidden
                        className="iaschool-reference-scan pointer-events-none absolute inset-x-1"
                        data-testid="reference-scan"
                      />
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
              processa a foto. Se ela não tiver exatamente um rosto, volta
              como falha.
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
      <style>{`
        .iaschool-reference-scan {
          top: 0;
          height: 2px;
          background: #fff;
          box-shadow: 0 1px 0 0 #111, 0 0 10px 1px rgba(255, 255, 255, 0.85);
          animation: iaschool-reference-scan 1.8s ease-in-out infinite;
        }
        @keyframes iaschool-reference-scan {
          0%, 100% { top: 0; }
          50% { top: calc(100% - 2px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .iaschool-reference-scan {
            animation: none;
            top: 50%;
          }
        }
      `}</style>
    </Card>
  );
}
