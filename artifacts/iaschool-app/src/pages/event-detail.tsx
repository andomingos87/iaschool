import { useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import {
  ArrowLeft,
  CalendarDays,
  FlaskConical,
  Images,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Button } from "@workspace/iaschool-ui/components/ui/button";
import { Badge } from "@workspace/iaschool-ui/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/iaschool-ui/components/ui/card";
import { Checkbox } from "@workspace/iaschool-ui/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@workspace/iaschool-ui/components/ui/alert";
import { toast } from "@workspace/iaschool-ui/hooks/use-toast";
import { PageHeader } from "@/components/app-shell";
import { CardsSkeleton, EmptyState, ErrorState, GallerySkeleton } from "@/components/data-state";
import { ConfirmDelete } from "@/components/confirm-delete";
import { EventUploadDropzone } from "@/components/event-upload-dropzone";
import { EventUploadProgress } from "@/components/event-upload-progress";
import { EventPhotoGrid } from "@/components/event-photo-grid";
import { ReferenceCoverageNotice } from "@/components/reference-coverage-notice";
import { useClassLabels } from "@/hooks/use-classes";
import { useDeclareImageRights, useEvent, useMoveEventToTrash } from "@/hooks/use-events";
import { useEventPhotos } from "@/hooks/use-photos";
import { useEventUpload } from "@/hooks/use-event-upload";
import { EVENT_STATUS_LABEL } from "@/lib/data";
import { TEST_DATA_ONLY } from "@/lib/constants";
import { formatDateTime, isoToBrDate } from "@/lib/format";
import { MAX_FILES_PER_BATCH } from "@/lib/upload";

/**
 * Tela do evento (spec §10, `/eventos/:id`): declaração de direito de imagem
 * (sem ela o upload não abre — §9.2), dropzone de pasta, progresso do lote e
 * a grade das fotos já enviadas.
 */
export default function EventDetailPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const event = useEvent(params.id ?? null);
  const photos = useEventPhotos(event.data?.id ?? null);
  const classLabels = useClassLabels();
  const declare = useDeclareImageRights();
  const remove = useMoveEventToTrash();
  const { uploader, snapshot } = useEventUpload(event.data);

  const [accepted, setAccepted] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (event.isLoading) {
    return (
      <div className="mx-auto max-w-6xl">
        <CardsSkeleton count={3} />
      </div>
    );
  }
  if (event.isError) {
    return (
      <div className="mx-auto max-w-6xl">
        <ErrorState onRetry={() => event.refetch()} />
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
  const declared = Boolean(e.imageRightsDeclaredAt);
  const className = e.classId ? classLabels.get(e.classId) : undefined;

  async function onDeclare() {
    try {
      await declare.mutateAsync(e.id);
      toast({ title: "Declaração registrada", description: "O upload está liberado." });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Não foi possível registrar a declaração",
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    }
  }

  async function onFiles(files: File[]) {
    if (!uploader) return;
    try {
      const result = await uploader.addFiles(files);
      if (result.overLimit > 0) {
        toast({
          variant: "destructive",
          title: `Mais de ${MAX_FILES_PER_BATCH.toLocaleString("pt-BR")} fotos de uma vez`,
          description: `A pasta tem ${result.overLimit.toLocaleString("pt-BR")} arquivos além do limite. Divida em duas pastas e envie uma por vez.`,
        });
        return;
      }
      const parts: string[] = [];
      if (result.accepted > 0) parts.push(`${result.accepted.toLocaleString("pt-BR")} na fila`);
      if (result.alreadySent > 0) parts.push(`${result.alreadySent.toLocaleString("pt-BR")} já enviadas antes`);
      if (result.rejected > 0) parts.push(`${result.rejected.toLocaleString("pt-BR")} ignoradas (não são JPEG, PNG ou HEIC)`);
      toast({
        title: result.accepted > 0 ? "Envio começou" : "Nada novo para enviar",
        description: parts.join(" · ") || "A pasta não tinha imagens aceitas.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Não foi possível começar o envio",
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    }
  }

  async function confirmDelete() {
    try {
      await remove.mutateAsync(e.id);
      toast({ title: "Evento movido para a lixeira", description: "As fotos seguem com ele." });
      navigate("/eventos");
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Não foi possível excluir",
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    }
  }

  const uploading = snapshot?.running ?? false;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
          <Link href="/eventos" data-testid="link-back-events">
            <ArrowLeft className="size-4" /> Eventos
          </Link>
        </Button>
        <PageHeader
          title={e.name}
          description={`${isoToBrDate(e.eventDate)}${className ? ` · ${className}` : " · Toda a escola"} · fotos guardadas até ${isoToBrDate(e.photoRetentionUntil)}`}
          action={
            <>
              <Badge variant={e.status === "draft" ? "secondary" : "outline"} data-testid="badge-event-status">
                {EVENT_STATUS_LABEL[e.status]}
              </Badge>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setDeleting(true)}
                disabled={uploading}
                aria-label="Excluir evento"
                data-testid="button-delete-event"
              >
                <Trash2 className="size-4" />
              </Button>
            </>
          }
        />
      </div>

      {TEST_DATA_ONLY && (
        <Alert data-testid="alert-test-data-only">
          <FlaskConical className="size-4" />
          <AlertTitle>Fase de validação: só material de teste</AlertTitle>
          <AlertDescription>
            Enquanto a liberação de produção não sair, nenhuma foto real de aluno deve ser enviada.
            Use fotos de demonstração para experimentar o fluxo.
          </AlertDescription>
        </Alert>
      )}

      {!declared ? (
        <Card className="border-destructive/40" data-testid="card-image-rights">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="size-5 text-destructive" /> Declaração de direito de imagem
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Subir a foto de um aluno já é tratamento de imagem de menor. Antes de abrir o upload,
              a escola declara que possui autorização de uso de imagem dos alunos presentes neste
              evento. A declaração fica registrada com seu nome e a data. Ela não substitui o termo
              assinado pelo responsável.
            </p>
            <label className="flex items-start gap-3 text-sm">
              <Checkbox
                checked={accepted}
                onCheckedChange={(v) => setAccepted(v === true)}
                className="mt-0.5"
                data-testid="checkbox-declare-image-rights"
              />
              <span>
                Declaro que a escola possui autorização de uso de imagem dos alunos presentes neste
                evento.
              </span>
            </label>
            <Button
              onClick={() => void onDeclare()}
              disabled={!accepted || declare.isPending}
              data-testid="button-declare-image-rights"
            >
              {declare.isPending ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
              Registrar e liberar o upload
            </Button>
          </CardContent>
        </Card>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="text-image-rights-declared">
          <ShieldCheck className="size-4 text-primary" /> Direito de imagem declarado em{" "}
          {formatDateTime(e.imageRightsDeclaredAt!)}.
        </p>
      )}

      <ReferenceCoverageNotice classId={e.classId} />

      <section className="space-y-4">
        <EventUploadDropzone disabled={!declared || !uploader} onFiles={onFiles} />
        {snapshot && uploader && <EventUploadProgress snapshot={snapshot} uploader={uploader} />}
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Images className="size-4" />
          {photos.data
            ? photos.data.length === 1
              ? "1 foto no evento"
              : `${photos.data.length.toLocaleString("pt-BR")} fotos no evento`
            : "Fotos do evento"}
        </h2>
        {photos.isError ? (
          <ErrorState onRetry={() => photos.refetch()} />
        ) : photos.isLoading ? (
          <GallerySkeleton />
        ) : (photos.data?.length ?? 0) === 0 ? (
          <EmptyState
            icon={<Images className="size-6" />}
            title="Nenhuma foto ainda"
            description={
              declared
                ? "Arraste a pasta do evento acima para começar."
                : "Registre a declaração de direito de imagem para abrir o upload."
            }
          />
        ) : (
          <EventPhotoGrid photos={photos.data ?? []} />
        )}
      </section>

      <ConfirmDelete
        open={deleting}
        onOpenChange={setDeleting}
        title="Excluir evento?"
        description={`"${e.name}" vai para a lixeira, junto com as fotos enviadas. Nada é apagado de imediato.`}
        onConfirm={() => void confirmDelete()}
        loading={remove.isPending}
      />
    </div>
  );
}
