import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { ArrowLeft, CalendarDays, ScanFace, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@workspace/iaschool-ui/components/ui/alert";
import { Badge } from "@workspace/iaschool-ui/components/ui/badge";
import { Button } from "@workspace/iaschool-ui/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/iaschool-ui/components/ui/tabs";
import { toast } from "@workspace/iaschool-ui/hooks/use-toast";
import { PageHeader } from "@/components/app-shell";
import { CardsSkeleton, EmptyState, ErrorState } from "@/components/data-state";
import { ImageLightbox } from "@/components/image-lightbox";
import { ReviewFaceQueue } from "@/components/review-face-queue";
import { ReviewStudentCard } from "@/components/review-student-card";
import {
  useConfirmFaces,
  useRejectFace,
  useReviewCounts,
  useReviewFaces,
} from "@/hooks/use-face-review";
import { useEvent } from "@/hooks/use-events";
import { useStudents } from "@/hooks/use-students";
import { getDataLayer, groupReviewByStudent } from "@/lib/data";
import type { FaceRejectState, ReviewFace } from "@/lib/data";
import { isoToBrDate } from "@/lib/format";

/**
 * Revisão do evento (spec §7.5, §10 — `/eventos/:id/revisao`).
 *
 * Aba padrão: um cartão por aluno, com a grade dos recortes sugeridos dele
 * neste evento e confirmação em lote. Aba de exceção: fila individual para
 * os rostos sem correspondência e para os que a pessoa desmarcou no cartão.
 *
 * A revisão humana é obrigatória (D6) enquanto a acurácia em criança de 4 a
 * 10 anos não for medida — o spike rodou em adultos. Nenhuma foto chega à
 * pasta do aluno, ao download ou ao envio sem passar por aqui.
 */
export default function EventReviewPage() {
  const params = useParams<{ id: string }>();
  const eventId = params.id ?? "";
  const event = useEvent(eventId || null);
  const faces = useReviewFaces(eventId || null);
  const counts = useReviewCounts(eventId || null);
  const students = useStudents();
  const confirm = useConfirmFaces(eventId);
  const reject = useRejectFace(eventId);

  const [cropUrls, setCropUrls] = useState<Map<string, string>>(new Map());
  const [thumbUrls, setThumbUrls] = useState<Map<string, string>>(new Map());
  const [zoom, setZoom] = useState<string | null>(null);
  /**
   * Desmarcados no cartão: continuam `suggested` no banco (ninguém decidiu
   * nada sobre eles), mas passam a aparecer na fila de exceção, que é onde a
   * spec os manda depois do lote.
   */
  const [deferred, setDeferred] = useState<Set<string>>(new Set());

  const list: ReviewFace[] = useMemo(() => faces.data ?? [], [faces.data]);
  const key = list.map((f) => f.id).join("|");

  useEffect(() => {
    if (list.length === 0) {
      setCropUrls(new Map());
      setThumbUrls(new Map());
      return;
    }
    let cancelled = false;
    const data = getDataLayer();
    const photos = new Map(list.map((f) => [f.photoId, f.thumbPath]));
    void Promise.all([
      data.faceReview.signCropUrls(list.map((f) => ({ id: f.id, cropPath: f.cropPath }))),
      data.photos.signThumbUrls(
        [...photos.entries()].map(([id, thumbPath]) => ({ id, thumbPath })),
      ),
    ])
      .then(([crops, thumbs]) => {
        if (cancelled) return;
        setCropUrls(crops);
        setThumbUrls(thumbs);
      })
      .catch(() => {
        if (cancelled) return;
        setCropUrls(new Map());
        setThumbUrls(new Map());
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const groups = useMemo(
    () => groupReviewByStudent(list.filter((f) => !deferred.has(f.id))),
    [list, deferred],
  );
  const queue = useMemo(
    () => list.filter((f) => f.state === "unassigned" || deferred.has(f.id)),
    [list, deferred],
  );
  const schoolStudents = useMemo(() => {
    const schoolId = event.data?.schoolId;
    return (students.data ?? []).filter((s) => !schoolId || s.schoolId === schoolId);
  }, [students.data, event.data?.schoolId]);

  async function onConfirmGroup(studentId: string, faceIds: string[], toDefer: string[]) {
    try {
      const changed = await confirm.mutateAsync({ faceIds, studentId });
      setDeferred((prev) => new Set([...prev, ...toDefer]));
      toast({
        title: changed === 0 ? "Nada mudou" : `${changed} ${changed === 1 ? "foto confirmada" : "fotos confirmadas"}`,
        description:
          changed === 0
            ? "Estas fotos já tinham sido confirmadas por alguém."
            : "A pasta do aluno já mostra as fotos confirmadas.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Nenhuma foto foi confirmada",
        description:
          err instanceof Error
            ? err.message
            : "A confirmação é tudo ou nada: se um rosto falha na checagem, nenhum é confirmado.",
      });
    }
  }

  async function onConfirmSingle(faceId: string, studentId: string) {
    try {
      await confirm.mutateAsync({ faceIds: [faceId], studentId });
      setDeferred((prev) => {
        const next = new Set(prev);
        next.delete(faceId);
        return next;
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Não foi possível confirmar",
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    }
  }

  async function onReject(faceId: string, state: FaceRejectState) {
    try {
      await reject.mutateAsync({ faceId, state });
      setDeferred((prev) => {
        const next = new Set(prev);
        next.delete(faceId);
        return next;
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Não foi possível registrar",
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    }
  }

  async function openPhoto(face: ReviewFace) {
    try {
      setZoom(await getDataLayer().photos.signPhotoUrl({ storagePath: face.storagePath }));
    } catch {
      setZoom(thumbUrls.get(face.photoId) ?? null);
    }
  }

  if (event.isLoading || faces.isLoading) {
    return (
      <div className="mx-auto max-w-6xl">
        <CardsSkeleton count={3} />
      </div>
    );
  }
  if (event.isError || faces.isError) {
    return (
      <div className="mx-auto max-w-6xl">
        <ErrorState onRetry={() => void faces.refetch()} />
      </div>
    );
  }
  if (!event.data) {
    return (
      <div className="mx-auto max-w-6xl">
        <EmptyState
          icon={<CalendarDays className="size-6" />}
          title="Evento não encontrado"
          description="Ele pode ter sido excluído ou pertencer a outra escola."
          action={
            <Button asChild variant="outline">
              <Link href="/eventos">Voltar para eventos</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const e = event.data;
  const c = counts.data;
  const pending = (c?.suggested ?? 0) + (c?.unassigned ?? 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
          <Link href={`/eventos/${e.id}`} data-testid="link-back-event">
            <ArrowLeft className="size-4" /> {e.name}
          </Link>
        </Button>
        <PageHeader
          title="Revisão dos rostos"
          description={`${isoToBrDate(e.eventDate)} · ${pending} ${pending === 1 ? "rosto aguarda" : "rostos aguardam"} decisão · ${c?.confirmed ?? 0} já confirmados`}
          action={
            <Badge variant="outline" data-testid="badge-review-students">
              {c?.studentsPending ?? 0} {c?.studentsPending === 1 ? "aluno" : "alunos"} na fila
            </Badge>
          }
        />
      </div>

      <Alert data-testid="alert-review-rule">
        <ShieldCheck className="size-4" />
        <AlertTitle>Quem decide de quem é o rosto é você</AlertTitle>
        <AlertDescription>
          O sistema sugere; a atribuição só existe depois que uma pessoa confirma. A
          acurácia do reconhecimento em criança nunca foi medida — o teste do motor
          rodou com adultos —, e é essa conferência que segura o erro.
        </AlertDescription>
      </Alert>

      {pending === 0 ? (
        <EmptyState
          icon={<ScanFace className="size-6" />}
          title={
            (c?.confirmed ?? 0) > 0 ? "Revisão concluída" : "Nenhum rosto para revisar ainda"
          }
          description={
            (c?.confirmed ?? 0) > 0
              ? "Todos os rostos deste evento já passaram por uma pessoa. As fotos confirmadas estão na pasta de cada aluno."
              : "O motor de reconhecimento processa as fotos depois do envio. Enquanto ele não roda, não há sugestão para conferir."
          }
          action={
            <Button asChild variant="outline">
              <Link href={`/eventos/${e.id}`}>Voltar ao evento</Link>
            </Button>
          }
        />
      ) : (
        <Tabs defaultValue="por-aluno">
          <TabsList>
            <TabsTrigger value="por-aluno" data-testid="tab-review-by-student">
              Por aluno ({groups.length})
            </TabsTrigger>
            <TabsTrigger value="excecao" data-testid="tab-review-queue">
              Sem correspondência ({queue.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="por-aluno" className="space-y-4 pt-4">
            {groups.length === 0 ? (
              <EmptyState
                icon={<ScanFace className="size-6" />}
                title="Nenhuma sugestão pendente"
                description="O que sobrou está na aba de exceção."
              />
            ) : (
              groups.map((group) => (
                <ReviewStudentCard
                  key={group.studentId}
                  group={group}
                  cropUrls={cropUrls}
                  thumbUrls={thumbUrls}
                  pending={confirm.isPending}
                  onConfirm={(ids, toDefer) => void onConfirmGroup(group.studentId, ids, toDefer)}
                  onOpenPhoto={(face) => void openPhoto(face)}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="excecao" className="pt-4">
            {queue.length === 0 ? (
              <EmptyState
                icon={<ScanFace className="size-6" />}
                title="Fila de exceção vazia"
                description="Todo rosto deste evento tem um aluno sugerido."
              />
            ) : (
              <ReviewFaceQueue
                faces={queue}
                students={schoolStudents}
                cropUrls={cropUrls}
                thumbUrls={thumbUrls}
                pending={confirm.isPending || reject.isPending}
                onConfirm={(faceId, studentId) => void onConfirmSingle(faceId, studentId)}
                onReject={(faceId, state) => void onReject(faceId, state)}
              />
            )}
          </TabsContent>
        </Tabs>
      )}

      <ImageLightbox src={zoom} onClose={() => setZoom(null)} />
    </div>
  );
}
