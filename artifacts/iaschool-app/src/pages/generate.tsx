import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { Button } from "@workspace/iaschool-ui/components/ui/button";
import { Textarea } from "@workspace/iaschool-ui/components/ui/textarea";
import { PageHeader } from "@/components/app-shell";
import { CardsSkeleton, EmptyState, ErrorState } from "@/components/data-state";
import { GenerationStudentPicker } from "@/components/generation-student-picker";
import { GenerationPhotoPicker } from "@/components/generation-photo-picker";
import { GenerationBatchProgress } from "@/components/generation-batch-progress";
import { useStudents } from "@/hooks/use-students";
import { useClasses } from "@/hooks/use-classes";
import { useAuth } from "@/hooks/use-auth";
import { TEST_DATA_ONLY } from "@/lib/constants";
import {
  GenerationBatchRequestError,
  EMPTY_GENERATION_SELECTION,
  batchIsActive,
  batchReviewError,
  eligibleRoster,
  expandGenerationSelection,
  getGenerationBatchService,
  type GenerationSelection,
  type GenerationPhotoChoice,
  type CreateGenerationBatch,
} from "@/lib/generation-batches";

export default function GeneratePage() {
  const { session, loading, sessionError, retrySession } = useAuth();
  const schoolId = session?.activeSchoolId;
  const userId = session?.user.id;
  const contextRef = useRef(`${userId}:${schoolId}`);
  contextRef.current = `${userId}:${schoolId}`;
  const students = useStudents(),
    classes = useClasses(schoolId);
  const service = getGenerationBatchService();
  const [selection, setSelection] = useState<GenerationSelection>(
    EMPTY_GENERATION_SELECTION,
  );
  const [choices, setChoices] = useState<Record<string, GenerationPhotoChoice>>(
    {},
  );
  const [step, setStep] = useState(0),
    [prompt, setPrompt] = useState("");
  const [photoStudent, setPhotoStudent] = useState<string | null>(null),
    [batchId, setBatchId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const lock = useRef(false),
    pending = useRef<CreateGenerationBatch | null>(null),
    prefilled = useRef(false);
  const pendingRetry = useRef<{
    batchId: string;
    requestId: string;
    itemIds: string[];
  } | null>(null);
  const eligibility = useQuery({
    queryKey: ["generation-eligibility", userId, schoolId],
    queryFn: () => service.eligibility(schoolId!),
    enabled: Boolean(schoolId),
    retry: false,
  });
  const batches = useQuery({
    queryKey: ["generation-batches", userId, schoolId],
    queryFn: () => service.list(schoolId!),
    enabled: Boolean(schoolId),
    retry: false,
    refetchInterval: 5000,
  });
  const batch = useQuery({
    queryKey: ["generation-batch", userId, schoolId, batchId],
    queryFn: () => service.get(batchId!),
    enabled: Boolean(schoolId && batchId),
    retry: false,
    refetchInterval: (query) =>
      query.state.data && batchIsActive(query.state.data) ? 3000 : false,
  });
  const roster = useMemo(
    () => eligibleRoster(students.data ?? [], schoolId ?? "", eligibility.data),
    [students.data, schoolId, eligibility.data],
  );
  const selectedIds = expandGenerationSelection(selection, roster);
  const selected = roster.filter((s) => selectedIds.includes(s.id));
  const selectedPhotos = selected.map((student) => ({
    studentId: student.id,
    photo: choices[student.id] ?? {
      source: "profile" as const,
      id:
        eligibility.data?.students.find((s) => s.studentId === student.id)
          ?.photoId ?? "",
      url: student.photos[0]?.url ?? "",
    },
  }));
  const reviewError = batchReviewError(
    prompt,
    selectedPhotos,
    eligibility.data?.remainingQuota ?? 0,
  );
  useEffect(() => {
    setSelection(EMPTY_GENERATION_SELECTION);
    setChoices({});
    setBatchId(null);
    setStep(0);
    setError(null);
    pending.current = null;
    pendingRetry.current = null;
    prefilled.current = false;
  }, [schoolId, userId]);
  useEffect(() => {
    if (prefilled.current || !eligibility.data || !students.data) return;
    prefilled.current = true;
    const id = new URLSearchParams(location.search).get("aluno");
    if (id && roster.some((s) => s.id === id))
      setSelection({ studentIds: [id], classIds: [], excludedStudentIds: [] });
  }, [eligibility.data, students.data, roster]);
  useEffect(() => {
    if (!batchId) {
      const active = batches.data?.find(
        (b) => b.status === "pending" || b.status === "processing",
      );
      if (active) setBatchId(active.id);
    }
  }, [batches.data, batchId]);
  async function generate() {
    if (lock.current || !schoolId || (!pending.current && reviewError)) return;
    const context = contextRef.current;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const request = pending.current ?? {
        requestId: crypto.randomUUID(),
        schoolId,
        prompt: prompt.trim(),
        students: selectedPhotos.map((s) => ({
          studentId: s.studentId,
          photo: { source: s.photo.source, id: s.photo.id },
        })),
      };
      pending.current = request;
      const result = await service.create(request);
      if (contextRef.current !== context) return;
      pending.current = null;
      setBatchId(result.id);
      await Promise.all([batches.refetch(), eligibility.refetch()]);
    } catch (cause) {
      if (contextRef.current !== context) return;
      if (cause instanceof GenerationBatchRequestError && cause.definitive) {
        pending.current = null;
        pendingRetry.current = null;
        void eligibility.refetch();
      }
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível iniciar. Retome o mesmo pedido para evitar duplicação.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function retry(itemIds: string[]) {
    if (lock.current || !batchId) return;
    const context = contextRef.current;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const request = pendingRetry.current ?? {
        batchId,
        requestId: crypto.randomUUID(),
        itemIds,
      };
      pendingRetry.current = request;
      await service.retry(request.batchId, {
        requestId: request.requestId,
        itemIds: request.itemIds,
      });
      if (contextRef.current !== context) return;
      pendingRetry.current = null;
      await Promise.all([
        batch.refetch(),
        eligibility.refetch(),
        batches.refetch(),
      ]);
    } catch (cause) {
      if (contextRef.current !== context) return;
      if (cause instanceof GenerationBatchRequestError && cause.definitive) {
        pending.current = null;
        pendingRetry.current = null;
        void eligibility.refetch();
      }
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível retomar estas artes. Atualize o progresso.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (loading || students.isLoading) return <CardsSkeleton />;
  if (sessionError)
    return (
      <ErrorState
        message="Não foi possível carregar sua escola."
        onRetry={retrySession}
      />
    );
  if (!schoolId)
    return (
      <EmptyState
        icon={<Sparkles />}
        title="Escolha uma escola"
        description="Selecione a escola no menu para preparar as artes."
      />
    );
  return (
    <div className="space-y-6">
      <PageHeader
        title="Criar artes"
        description="Escolha os alunos, confira as fotos e descreva a arte para todos."
      />
      {TEST_DATA_ONLY && (
        <p className="rounded-lg border p-3 text-sm text-muted-foreground">
          Use somente fotos sintéticas ou de demonstração nesta fase.
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {pending.current && (
        <Button disabled={busy} onClick={() => void generate()}>
          Retomar o mesmo pedido
        </Button>
      )}
      {pendingRetry.current && (
        <Button
          disabled={busy}
          onClick={() => void retry(pendingRetry.current!.itemIds)}
        >
          Retomar a mesma tentativa
        </Button>
      )}
      {batchId ? (
        <>
          <Button
            variant="outline"
            disabled={
              busy ||
              Boolean(pendingRetry.current) ||
              Boolean(pending.current) ||
              Boolean(batch.data && batchIsActive(batch.data))
            }
            onClick={() => setBatchId(null)}
          >
            Preparar outro lote
          </Button>
          {batch.isLoading ? (
            <CardsSkeleton />
          ) : batch.isError ? (
            <ErrorState
              message="Não foi possível consultar o lote. A geração continua no servidor."
              onRetry={() => void batch.refetch()}
            />
          ) : (
            batch.data && (
              <GenerationBatchProgress
                batch={batch.data}
                students={students.data ?? []}
                onRetry={(ids) => void retry(ids)}
                retrying={busy || Boolean(pendingRetry.current)}
                onRefresh={() => void batch.refetch()}
              />
            )
          )}
        </>
      ) : (
        <section className="space-y-5 rounded-xl border bg-card p-4 sm:p-6">
          <ol className="flex gap-4 text-sm" aria-label="Etapas">
            {["Alunos", "Fotos", "Arte"].map((label, index) => (
              <li
                key={label}
                className={
                  step === index
                    ? "font-semibold text-primary"
                    : "text-muted-foreground"
                }
                aria-current={step === index ? "step" : undefined}
              >
                {index + 1}. {label}
              </li>
            ))}
          </ol>
          {eligibility.isLoading ? (
            <CardsSkeleton />
          ) : eligibility.isError ? (
            <ErrorState
              message="Não foi possível conferir as autorizações e fotos."
              onRetry={() => void eligibility.refetch()}
            />
          ) : (
            <>
              {step === 0 && (
                <>
                  <h2 className="font-semibold">Para quem vamos criar?</h2>
                  <p className="text-sm text-muted-foreground">
                    Só aparecem alunos com foto e autorização ativa. Turmas
                    incluem todos os alunos aptos, sem repetir ninguém.
                  </p>
                  <GenerationStudentPicker
                    students={students.data ?? []}
                    eligible={roster}
                    classes={classes.data ?? []}
                    selection={selection}
                    onChange={setSelection}
                    disabled={busy || Boolean(pending.current)}
                  />
                  {classes.isError && (
                    <ErrorState
                      message="Não foi possível carregar as turmas."
                      onRetry={() => void classes.refetch()}
                    />
                  )}
                  <Button
                    disabled={!selected.length || Boolean(pending.current)}
                    onClick={() => setStep(1)}
                  >
                    Conferir {selected.length} {selected.length === 1 ? "foto" : "fotos"}
                  </Button>
                </>
              )}
              {step === 1 && (
                <>
                  <h2 className="font-semibold">Uma foto para cada aluno</h2>
                  <p className="text-sm text-muted-foreground">
                    A foto principal já está escolhida. Clique para trocar por
                    outra foto de perfil ou de evento com o aluno sozinho.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {selectedPhotos.map(({ studentId, photo }) => (
                      <button
                        key={studentId}
                        className="rounded-lg border p-3 text-left focus-visible:ring-2 focus-visible:ring-primary"
                        disabled={Boolean(pending.current)}
                        onClick={() => setPhotoStudent(studentId)}
                      >
                        <img
                          src={photo.url}
                          alt={`Foto escolhida de ${selected.find((s) => s.id === studentId)?.name}`}
                          className="aspect-square w-full rounded-md object-contain"
                        />
                        <span className="mt-2 block text-sm font-medium">
                          {selected.find((s) => s.id === studentId)?.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Trocar foto
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setStep(0)}>
                      Voltar
                    </Button>
                    <Button
                      disabled={!selected.length}
                      onClick={() => setStep(2)}
                    >
                      Descrever a arte
                    </Button>
                  </div>
                </>
              )}
              {step === 2 && (
                <>
                  <label className="block font-semibold" htmlFor="arte-prompt">
                    Como você quer a arte?
                  </label>
                  <Textarea
                    id="arte-prompt"
                    value={prompt}
                    disabled={busy || Boolean(pending.current)}
                    onChange={(e) => setPrompt(e.target.value)}
                    maxLength={3000}
                    rows={5}
                    placeholder="Ex.: Uma arte alegre para a festa da escola, com cores suaves e o nome do evento."
                  />
                  <p className="text-sm">
                    {selected.length} {selected.length === 1 ? "aluno" : "alunos"} = {selected.length} {selected.length === 1 ? "arte" : "artes"}. Cota
                    disponível: {eligibility.data?.remainingQuota ?? 0}.
                  </p>
                  {reviewError && (
                    <p className="text-sm text-muted-foreground">
                      {reviewError}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    A IA pode alterar detalhes da foto. Confira cada arte antes
                    de usar.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      disabled={busy || Boolean(pending.current)}
                      onClick={() => setStep(1)}
                    >
                      Voltar
                    </Button>
                    <Button
                      disabled={
                        busy || (!pending.current && Boolean(reviewError))
                      }
                      onClick={() => void generate()}
                    >
                      <Sparkles className="size-4" />
                      {busy
                        ? "Enviando pedido…"
                        : pending.current
                          ? "Retomar o mesmo pedido"
                          : `Gerar ${selected.length} ${selected.length === 1 ? "arte" : "artes"}`}
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
        </section>
      )}
      {Boolean(batches.data?.length) && (
        <section className="space-y-2">
          <h2 className="font-semibold">Seus lotes</h2>
          {batches.data?.map((item) => (
            <Button
              key={item.id}
              variant="outline"
              className="mr-2"
              onClick={() => setBatchId(item.id)}
            >
              {item.completed}/{item.total} prontas
              {item.failed ? ` · ${item.failed} com falha` : ""}
              {item.status === "processing" || item.status === "pending"
                ? " · em andamento"
                : ""}
            </Button>
          ))}
        </section>
      )}
      {batches.isError && (
        <ErrorState
          message="Não foi possível carregar os lotes anteriores."
          onRetry={() => void batches.refetch()}
        />
      )}
      {photoStudent && selected.find((s) => s.id === photoStudent) && (
        <GenerationPhotoPicker
          student={selected.find((s) => s.id === photoStudent)!}
          onClose={() => setPhotoStudent(null)}
          onSelect={(photo) => {
            setChoices((previous) => ({ ...previous, [photoStudent]: photo }));
            setPhotoStudent(null);
          }}
        />
      )}
    </div>
  );
}
