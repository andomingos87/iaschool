import { useEffect, useRef, useState } from "react";
import { Download, Maximize2, RefreshCw } from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { Button } from "@workspace/iaschool-ui/components/ui/button";
import { startBlobDownload } from "@/lib/student-folder";
import { ImageLightbox } from "./image-lightbox";
import { GenerationBatchWait } from "./generation-batch-wait";
import { BATCH_WAIT_PHRASES } from "@/lib/generation-phrases";
import { GuardianVerifyDialog } from "./guardian-verify-dialog";
import { useAuthorizations, activeByScope } from "@/hooks/use-authorizations";
import { useGuardianConsentStatus } from "@/hooks/use-guardian-consent";
import { useAuth } from "@/hooks/use-auth";
import { getDataLayer, type Student } from "@/lib/data";
import { ageBracket, allowedShareTarget, shareBlockers } from "@/lib/eca";
import { iaschool } from "@/config/iaschool";
import {
  type GenerationBatch,
  type GenerationBatchItem,
  failedBatchItemIds,
  batchIsActive,
  getGenerationBatchService,
} from "@/lib/generation-batches";
const labels: Record<GenerationBatchItem["status"], string> = {
  pending: "Na fila",
  processing: "Gerando",
  completed: "Pronta e salva",
  failed: "Falha",
  unknown: "Resultado incerto",
};
export function GenerationBatchProgress({
  batch,
  students,
  onRetry,
  retrying,
  onRefresh,
}: {
  batch: GenerationBatch;
  students: Student[];
  onRetry: (ids: string[]) => void;
  retrying: boolean;
  onRefresh: () => void;
}) {
  const [confirmUnknown, setConfirmUnknown] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null),
    [sharing, setSharing] = useState<GenerationBatchItem | null>(null);
  const failures = failedBatchItemIds(batch);
  const active = batchIsActive(batch);
  const [phraseIndex, setPhraseIndex] = useState(0);
  useEffect(() => {
    if (!active) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      setPhraseIndex((index) => (index + 1) % BATCH_WAIT_PHRASES.length);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [active]);
  const [assetError, setAssetError] = useState<string | null>(null),
    [assetBusy, setAssetBusy] = useState(false);
  const assetLock = useRef(false);
  async function openAsset(itemId: string, download: boolean) {
    if (assetLock.current) return;
    assetLock.current = true;
    setAssetBusy(true);
    setAssetError(null);
    try {
      const fresh = await getGenerationBatchService().get(batch.id);
      const item = fresh.items.find(
        (i) => i.id === itemId && i.status === "completed",
      );
      if (!item?.imageUrl)
        throw new Error("Arte indisponível. Atualize o progresso.");
      if (!download) {
        setZoom(item.imageUrl);
        return;
      }
      const response = await fetch(item.imageUrl, {
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
      if (!response.ok)
        throw new Error(
          "Não foi possível baixar. Atualize o progresso e tente novamente.",
        );
      const blob = await response.blob();
      if (!blob.type.startsWith("image/"))
        throw new Error("A imagem está indisponível.");
      startBlobDownload({
        blob,
        filename: "arte.png",
        createObjectURL: (b) => URL.createObjectURL(b),
        revokeObjectURL: (u) => URL.revokeObjectURL(u),
        click: (url, filename) => {
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          a.click();
        },
        schedule: (f, ms) => {
          window.setTimeout(f, ms);
        },
      });
    } catch (cause) {
      setAssetError(
        cause instanceof Error ? cause.message : "Imagem indisponível.",
      );
    } finally {
      assetLock.current = false;
      setAssetBusy(false);
    }
  }

  return (
    <section
      className="space-y-4 rounded-xl border bg-card p-4 sm:p-6"
      aria-label="Progresso das artes"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {active ? (
            <GenerationBatchWait
              phrase={BATCH_WAIT_PHRASES[phraseIndex] ?? BATCH_WAIT_PHRASES[0]}
              completed={batch.completed}
              total={batch.total}
            />
          ) : (
            <>
              <h2 className="text-lg font-semibold">Artes do lote</h2>
              <p className="text-sm text-muted-foreground" role="status">
                {batch.completed} de {batch.total} prontas
                {batch.failed
                  ? ` · ${batch.failed} com falha ou resultado incerto`
                  : ""}
                .
              </p>
            </>
          )}
        </div>
        <Button variant="outline" onClick={onRefresh}>
          <RefreshCw className="size-4" />
          Atualizar progresso
        </Button>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="Artes prontas"
        aria-valuenow={batch.completed}
        aria-valuemin={0}
        aria-valuemax={batch.total}
      >
        <div
          className="h-full bg-primary transition-all"
          style={{
            width: `${batch.total ? (batch.completed / batch.total) * 100 : 0}%`,
          }}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {batch.items.map((item) => {
          const student = students.find((s) => s.id === item.studentId);
          return (
            <article key={item.id} className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium">
                  {student?.name ?? "Aluno"}
                </h3>
                <span className="text-xs text-muted-foreground">
                  {labels[item.status]}
                </span>
              </div>
              {item.imageUrl && item.status === "completed" && (
                <>
                  <img
                    src={item.imageUrl}
                    alt={`Arte de ${student?.name ?? "aluno"}`}
                    className="aspect-square w-full rounded-md object-contain"
                    loading="lazy"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={assetBusy}
                      onClick={() => void openAsset(item.id, false)}
                    >
                      <Maximize2 className="size-4" />
                      Ampliar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={assetBusy}
                      onClick={() => void openAsset(item.id, true)}
                    >
                      <Download className="size-4" />
                      Baixar
                    </Button>
                    {item.postId && student && (
                      <Button size="sm" onClick={() => setSharing(item)}>
                        <SiWhatsapp className="size-4" />
                        WhatsApp
                      </Button>
                    )}
                  </div>
                </>
              )}
              {item.status === "failed" && (
                <div>
                  <p role="alert" className="text-sm text-destructive">
                    {item.error ??
                      "Não foi possível gerar esta arte. As outras continuam."}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={retrying || batchIsActive(batch)}
                    onClick={() => onRetry([item.id])}
                  >
                    Tentar esta arte novamente
                  </Button>
                </div>
              )}
              {item.status === "unknown" && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Não conseguimos confirmar o resultado. Uma nova tentativa
                    pode gerar outra arte e consumir mais uma geração da cota.
                  </p>
                  {confirmUnknown === item.id ? (
                    <>
                      <Button
                        size="sm"
                        disabled={retrying || batchIsActive(batch)}
                        onClick={() => {
                          setConfirmUnknown(null);
                          onRetry([item.id]);
                        }}
                      >
                        Confirmar nova geração
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmUnknown(null)}
                      >
                        Cancelar
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={retrying || batchIsActive(batch)}
                      onClick={() => setConfirmUnknown(item.id)}
                    >
                      Gerar novamente usando a cota
                    </Button>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
      {failures.length > 1 && (
        <Button
          variant="outline"
          disabled={retrying || batchIsActive(batch)}
          onClick={() => onRetry(failures)}
        >
          Tentar novamente só as {failures.length} falhas
        </Button>
      )}
      <p className="text-xs text-muted-foreground">
        Confira as artes antes de usar. A IA pode alterar detalhes da foto.
      </p>
      {assetError && (
        <p role="alert" className="text-sm text-destructive">
          {assetError}
        </p>
      )}
      <ImageLightbox src={zoom} onClose={() => setZoom(null)} />
      {sharing && students.find((s) => s.id === sharing.studentId) && (
        <BatchArtShare
          item={sharing}
          student={students.find((s) => s.id === sharing.studentId)!}
          onClose={() => setSharing(null)}
        />
      )}
    </section>
  );
}
function BatchArtShare({
  item,
  student,
  onClose,
}: {
  item: GenerationBatchItem;
  student: Student;
  onClose: () => void;
}) {
  const authorizations = useAuthorizations(student.id),
    consent = useGuardianConsentStatus(student.id);
  const { session } = useAuth();
  const [notice, setNotice] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [verify, setVerify] = useState(false);
  const shareLock = useRef(false);
  const compliance = {
    biometricSortingActive: activeByScope(authorizations.data).has(
      "biometric_sorting",
    ),
    deliveryAccepted: consent.data?.state === "accepted",
  };
  const issues = shareBlockers(student, compliance);
  async function share() {
    if (
      shareLock.current ||
      busy ||
      issues.length ||
      !item.postId ||
      authorizations.isLoading ||
      authorizations.isError ||
      consent.isLoading ||
      consent.isError ||
      !session
    )
      return;
    const target = allowedShareTarget(student, compliance);
    if (!target) return;
    shareLock.current = true;
    setBusy(true);
    try {
      await getDataLayer().shareLogs.record({
        postId: item.postId,
        studentId: student.id,
        studentName: student.name,
        channel: "whatsapp",
        targetWhatsapp: target.whatsapp,
        targetLabel: target.label,
        studentAgeBracket: ageBracket(student.birthDate) ?? "adulto",
        guardianConsentAt: student.guardian?.consentAt,
        sentByUserId: session?.user.id ?? "",
        sentByName: session?.user.name ?? "",
      });
      window.open(
        `https://wa.me/${target.whatsapp}?text=${encodeURIComponent(iaschool.generation.shareMessage(student.name))}`,
        "_blank",
        "noopener,noreferrer",
      );
      onClose();
    } catch {
      setNotice("Não foi possível registrar o envio. Tente novamente.");
    } finally {
      shareLock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="rounded-lg border p-3">
      <p className="text-sm font-medium">Compartilhar arte de {student.name}</p>
      {issues.map((issue) => (
        <p key={issue.code} className="text-sm text-muted-foreground">
          {issue.message}
        </p>
      ))}
      {notice && <p role="alert">{notice}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          disabled={
            busy ||
            issues.length > 0 ||
            authorizations.isLoading ||
            authorizations.isError ||
            consent.isLoading ||
            consent.isError
          }
          onClick={() => void share()}
        >
          Abrir WhatsApp
        </Button>
        {issues.some((i) => i.code === "canal-nao-verificado") && (
          <Button variant="outline" onClick={() => setVerify(true)}>
            Verificar responsável
          </Button>
        )}
        <Button variant="ghost" onClick={onClose}>
          Fechar
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Baixe a imagem para anexar à mensagem.
      </p>
      <GuardianVerifyDialog
        open={verify}
        onOpenChange={setVerify}
        student={student}
      />
    </div>
  );
}
