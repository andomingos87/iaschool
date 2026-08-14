import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Sparkles,
  Users,
  Shield,
  Shirt,
  Images,
  BarChart3,
  Download,
  Maximize2,
  RotateCcw,
  Wand2,
  Plus,
} from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { cn } from "@workspace/iasport/lib/utils";
import { Button } from "@workspace/iasport/components/ui/button";
import { Input } from "@workspace/iasport/components/ui/input";
import { Textarea } from "@workspace/iasport/components/ui/textarea";
import { Checkbox } from "@workspace/iasport/components/ui/checkbox";
import { Badge } from "@workspace/iasport/components/ui/badge";
import {
  Card,
  CardContent,
} from "@workspace/iasport/components/ui/card";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/iasport/components/ui/avatar";
import { toast } from "@workspace/iasport/hooks/use-toast";
import { getDataLayer } from "@/lib/data";
import type {
  Club,
  GenerationDetails,
  GenerationRequest,
  MetricValue,
  ReferencePost,
  StoredImage,
  Student,
} from "@/lib/data";
import { PageHeader } from "@/components/app-shell";
import { EmptyState, CardsSkeleton } from "@/components/data-state";
import { GenerationLoader } from "@/components/generation-loader";
import { GenerationDetailsSection } from "@/components/generation-details";
import { ImageLightbox } from "@/components/image-lightbox";
import { useStudents } from "@/hooks/use-students";
import { useClubs } from "@/hooks/use-clubs";
import { useReferences } from "@/hooks/use-references";
import { useMetrics } from "@/hooks/use-metrics";
import { useCreateGeneratedPost } from "@/hooks/use-generated-posts";
import { useGenerationQuota } from "@/hooks/use-generation-quota";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/query-keys";
import { initials, storedToMasked } from "@/lib/format";
import {
  AUX_PROMPT_PREFILL_EVENT,
  AUX_PROMPT_PREFILL_KEY,
  plausibleMetricValue,
} from "@/lib/constants";

type Phase = "form" | "generating" | "result";

const STEP_META = [
  { key: "aluno", label: "Aluno", icon: Users },
  { key: "brasao", label: "Brasão", icon: Shield },
  { key: "r9", label: "Logo R9", icon: Sparkles },
  { key: "uniforme", label: "Uniforme", icon: Shirt },
  { key: "referencia", label: "Referência", icon: Images },
  { key: "metricas", label: "Métricas", icon: BarChart3 },
];

export default function GeneratePage() {
  const students = useStudents();
  const clubs = useClubs();
  const references = useReferences();
  const metrics = useMetrics();
  const createPost = useCreateGeneratedPost();
  const quota = useGenerationQuota();
  const queryClient = useQueryClient();

  const [phase, setPhase] = useState<Phase>("form");
  const [step, setStep] = useState(0);

  // seleções
  const [student, setStudent] = useState<Student | null>(null);
  const [photo, setPhoto] = useState<StoredImage | null>(null);
  const [showClubLogo, setShowClubLogo] = useState(true);
  const [includeR9, setIncludeR9] = useState(true);
  const [uniform, setUniform] = useState<StoredImage | null>(null);
  const [reference, setReference] = useState<ReferencePost | null>(null);
  const [selectedMetrics, setSelectedMetrics] = useState<Record<string, string>>({});
  const [auxiliaryPrompt, setAuxiliaryPrompt] = useState("");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultDetails, setResultDetails] = useState<GenerationDetails | null>(null);
  // Progresso real (0–100) do upload das fotos; null = fase de geração.
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);

  // Pré-preenche as instruções adicionais com um prompt vindo de
  // "Detalhes da geração" (botão "Usar como instruções").
  useEffect(() => {
    function applyPrefill(prompt: string | null) {
      if (!prompt) return;
      try {
        sessionStorage.removeItem(AUX_PROMPT_PREFILL_KEY);
      } catch {
        // ignora
      }
      setAuxiliaryPrompt(prompt);
      setPhase("form");
      toast({
        title: "Instruções pré-preenchidas",
        description:
          'O prompt da geração foi copiado para "Instruções adicionais" (último passo). Ajuste como quiser.',
      });
    }

    function readStored(): string | null {
      try {
        return sessionStorage.getItem(AUX_PROMPT_PREFILL_KEY);
      } catch {
        return null;
      }
    }

    applyPrefill(readStored());
    const onEvent = (e: Event) => {
      const prompt =
        (e as CustomEvent<string>).detail ?? readStored();
      applyPrefill(prompt);
    };
    window.addEventListener(AUX_PROMPT_PREFILL_EVENT, onEvent);
    return () => window.removeEventListener(AUX_PROMPT_PREFILL_EVENT, onEvent);
  }, []);

  const club: Club | undefined = useMemo(
    () => clubs.data?.find((c) => c.id === student?.clubId),
    [clubs.data, student],
  );

  const hasClubLogo = !!club?.logo;
  const hasUniforms = (club?.uniforms.length ?? 0) > 0;

  const loading =
    students.isLoading || clubs.isLoading || references.isLoading || metrics.isLoading;

  // valida cada passo
  function canAdvance(current: number): boolean {
    switch (current) {
      case 0:
        return !!student && !!photo;
      case 4:
        return !!reference;
      case 5:
        return Object.values(selectedMetrics).some((v) => v.trim() !== "");
      default:
        return true;
    }
  }

  function next() {
    setStep((s) => Math.min(s + 1, STEP_META.length - 1));
  }
  function back() {
    setStep((s) => Math.max(s - 1, 0));
  }

  function resetAll() {
    setPhase("form");
    setStep(0);
    setStudent(null);
    setPhoto(null);
    setShowClubLogo(true);
    setIncludeR9(true);
    setUniform(null);
    setReference(null);
    setSelectedMetrics({});
    setAuxiliaryPrompt("");
    setResultUrl(null);
    setResultDetails(null);
  }

  function toggleMetric(id: string) {
    setSelectedMetrics((prev) => {
      const next = { ...prev };
      if (id in next) delete next[id];
      else next[id] = "";
      return next;
    });
  }

  function aiFill() {
    const list = metrics.data ?? [];
    const filled: Record<string, string> = {};
    const ids = Object.keys(selectedMetrics);
    const target = ids.length > 0 ? ids : list.slice(0, 4).map((m) => m.id);
    target.forEach((id) => {
      const m = list.find((x) => x.id === id);
      if (m) filled[id] = plausibleMetricValue(m.name);
    });
    setSelectedMetrics(filled);
    toast({
      title: "Valores gerados com IA",
      description: "Revise e ajuste se necessário.",
    });
  }

  async function generate() {
    if (!student || !photo || !reference) return;
    const list = metrics.data ?? [];
    const metricValues: MetricValue[] = Object.entries(selectedMetrics)
      .filter(([, v]) => v.trim() !== "")
      .map(([id, value]) => {
        const m = list.find((x) => x.id === id);
        return { metricId: id, name: m?.name ?? "Métrica", value };
      });

    const request: GenerationRequest = {
      student,
      studentPhoto: photo,
      club,
      showClubLogo: hasClubLogo && showClubLogo,
      includeR9Logo: includeR9,
      uniform: uniform ?? undefined,
      reference,
      metrics: metricValues,
      auxiliaryPrompt: auxiliaryPrompt.trim() || undefined,
    };

    setPhase("generating");
    setUploadProgress(0);
    try {
      const { imageUrl, details } = await getDataLayer().generation.generate(
        request,
        (percent) => setUploadProgress(percent < 100 ? percent : null),
      );
      setResultUrl(imageUrl);
      setResultDetails(details);
      setPhase("result");
      // O saldo diário mudou — atualiza o indicador na próxima visita ao form.
      void queryClient.invalidateQueries({ queryKey: qk.generationQuota });
      // Se salvar no histórico falhar, a imagem gerada continua visível.
      try {
        // Persiste a imagem no Storage (bucket "generated") em vez de gravar
        // a data URL base64 gigante direto no banco. Se o upload falhar,
        // salva a data URL mesmo assim para não perder o post.
        let savedUrl = imageUrl;
        if (imageUrl.startsWith("data:")) {
          try {
            const blob = await (await fetch(imageUrl)).blob();
            const stored = await getDataLayer().storage.upload(
              "generated",
              blob,
              `${student.name.replace(/\s+/g, "-").toLowerCase()}.png`,
            );
            savedUrl = stored.url;
          } catch {
            // mantém a data URL como fallback
          }
        }
        await createPost.mutateAsync({
          studentId: student.id,
          imageUrl: savedUrl,
          metrics: metricValues,
          details,
        });
      } catch {
        toast({
          variant: "destructive",
          title: "Imagem gerada, mas não foi salva no histórico",
          description: "Você ainda pode baixar ou compartilhar esta imagem.",
        });
      }
    } catch (err) {
      setPhase("form");
      setUploadProgress(null);
      // Mesmo em falha a cota pode ter sido consumida — atualiza o saldo.
      void queryClient.invalidateQueries({ queryKey: qk.generationQuota });
      toast({
        variant: "destructive",
        title: "Falha na geração",
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    }
  }

  function download() {
    if (!resultUrl) return;
    const a = document.createElement("a");
    a.href = resultUrl;
    a.download = `r9-${student?.name.replace(/\s+/g, "-").toLowerCase() ?? "post"}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function sendWhatsapp() {
    if (!student) return;
    const digits = student.whatsapp.replace(/\D/g, "");
    const msg = `Olá! Confira o card de desempenho do ${student.name} na R9 Escolinhas. Baixe a imagem gerada e mande junto com esta mensagem. Vamos pra cima!`;
    window.open(
      `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  // ---- Estados de nível de página ----
  if (loading) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader title="Gerar imagem" description="Carregando dados..." />
        <CardsSkeleton count={3} />
      </div>
    );
  }

  if ((students.data?.length ?? 0) === 0) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader title="Gerar imagem" />
        <EmptyState
          icon={<Users className="size-6" />}
          title="Cadastre um aluno primeiro"
          description="Você precisa de ao menos um aluno com foto para gerar imagens."
          action={
            <Link href="/alunos" data-testid="link-goto-alunos">
              <Button>
                <Plus className="size-4" /> Cadastrar aluno
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  if (phase === "generating") {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader
          title={
            uploadProgress !== null && uploadProgress < 100
              ? "Enviando fotos"
              : "Gerando imagem"
          }
          description="Isso leva alguns segundos."
        />
        <Card className="border-primary/40">
          <CardContent className="p-6">
            <GenerationLoader uploadProgress={uploadProgress} />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (phase === "result" && resultUrl) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader
          title="Imagem pronta!"
          description="Baixe, amplie e envie pelo WhatsApp."
        />
        <Card className="border-primary/40">
          <CardContent className="flex flex-col items-center gap-6 p-6">
            <div className="relative w-full max-w-md">
              <img
                src={resultUrl}
                alt="Post gerado"
                className="w-full rounded-lg border border-border shadow-xl"
                data-testid="img-result"
              />
              <Badge className="absolute left-3 top-3">
                <Sparkles className="size-3" /> Gerado com IA
              </Badge>
            </div>
            <div className="grid w-full max-w-md grid-cols-1 gap-2 sm:grid-cols-3">
              <Button variant="outline" onClick={() => setZoom(resultUrl)} data-testid="button-ampliar">
                <Maximize2 className="size-4" /> Ampliar
              </Button>
              <Button variant="secondary" onClick={download} data-testid="button-baixar">
                <Download className="size-4" /> Baixar PNG
              </Button>
              <Button onClick={sendWhatsapp} data-testid="button-whatsapp">
                <SiWhatsapp className="size-4" /> WhatsApp
              </Button>
            </div>
            <GenerationDetailsSection
              details={resultDetails}
              className="max-w-md"
            />
            <p className="max-w-md text-center text-xs text-muted-foreground">
              O WhatsApp abre com a mensagem pronta. A imagem não pode ser anexada
              automaticamente — baixe o PNG e envie junto.
            </p>
            <Button variant="ghost" onClick={resetAll} data-testid="button-nova-geracao">
              <RotateCcw className="size-4" /> Gerar outra imagem
            </Button>
          </CardContent>
        </Card>
        <ImageLightbox src={zoom} onClose={() => setZoom(null)} />
      </div>
    );
  }

  // ---- Wizard (form) ----
  const StepIcon = STEP_META[step].icon;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Gerar imagem"
        description="Monte o post passo a passo. Leva menos de um minuto."
      />

      {/* stepper */}
      <div className="mb-6 flex items-center gap-1 overflow-x-auto pb-2">
        {STEP_META.map((s, i) => {
          const Icon = s.icon;
          const done = i < step;
          const active = i === step;
          return (
            <div key={s.key} className="flex items-center">
              <button
                type="button"
                onClick={() => i <= step && setStep(i)}
                disabled={i > step}
                className={cn(
                  "flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  active && "bg-primary text-primary-foreground",
                  done && "bg-accent text-accent-foreground",
                  !active && !done && "bg-muted text-muted-foreground",
                )}
                data-testid={`step-${s.key}`}
              >
                {done ? <Check className="size-3.5" /> : <Icon className="size-3.5" />}
                <span className="hidden sm:inline">{s.label}</span>
              </button>
              {i < STEP_META.length - 1 && (
                <div className="mx-1 h-px w-4 bg-border sm:w-6" />
              )}
            </div>
          );
        })}
      </div>

      <Card className="border-border">
        <CardContent className="p-6">
          <div className="mb-4 flex items-center gap-2">
            <StepIcon className="size-5 text-primary" />
            <h2 className="text-lg font-bold">{stepTitle(step)}</h2>
          </div>

          <div key={step} className="animate-in fade-in slide-in-from-right-2 duration-300">
            {/* STEP 0 — aluno + foto */}
            {step === 0 && (
              <div className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  {students.data!.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setStudent(s);
                        setPhoto(s.photos?.[0] ?? null);
                        setUniform(null);
                      }}
                      className={cn(
                        "flex items-center gap-3 rounded-md border p-3 text-left transition-colors",
                        student?.id === s.id
                          ? "border-primary bg-accent"
                          : "border-border hover:border-primary/50",
                      )}
                      data-testid={`select-student-${s.id}`}
                    >
                      <Avatar className="size-10">
                        {s.photos?.[0] && <AvatarImage src={s.photos[0].url} alt={s.name} />}
                        <AvatarFallback className="text-xs">{initials(s.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{s.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {s.position ?? "Sem posição"}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>

                {student && (
                  <div>
                    <p className="mb-2 text-sm font-medium">Escolha a foto do aluno</p>
                    {student.photos.length === 0 ? (
                      <div className="rounded-md border border-dashed border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
                        Este aluno não tem fotos.{" "}
                        <Link href="/alunos" className="underline" data-testid="link-add-photo">
                          Adicione uma foto
                        </Link>{" "}
                        para continuar.
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-3">
                        {student.photos.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setPhoto(p)}
                            className={cn(
                              "size-20 overflow-hidden rounded-md border-2 transition-all",
                              photo?.id === p.id
                                ? "border-primary ring-2 ring-primary/30"
                                : "border-border",
                            )}
                            data-testid={`select-photo-${p.id}`}
                          >
                            <img src={p.url} alt="Foto" className="h-full w-full object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* STEP 1 — brasão */}
            {step === 1 && (
              <div className="space-y-4">
                {!hasClubLogo ? (
                  <p className="text-sm text-muted-foreground">
                    {club
                      ? `O clube "${club.name}" não tem brasão cadastrado.`
                      : "Este aluno não está associado a um clube com brasão."}{" "}
                    Você pode seguir para o próximo passo.
                  </p>
                ) : (
                  <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                    <img
                      src={club!.logo!.url}
                      alt={club!.name}
                      className="size-20 rounded-md border border-border bg-muted object-contain p-1"
                    />
                    <div className="flex gap-2">
                      <Button
                        variant={showClubLogo ? "default" : "outline"}
                        onClick={() => setShowClubLogo(true)}
                        data-testid="button-club-logo-yes"
                      >
                        Exibir brasão
                      </Button>
                      <Button
                        variant={!showClubLogo ? "default" : "outline"}
                        onClick={() => setShowClubLogo(false)}
                        data-testid="button-club-logo-no"
                      >
                        Não exibir
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* STEP 2 — logo R9 */}
            {step === 2 && (
              <label
                className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-4"
                data-testid="checkbox-r9-wrapper"
              >
                <Checkbox
                  checked={includeR9}
                  onCheckedChange={(v) => setIncludeR9(!!v)}
                  data-testid="checkbox-r9"
                />
                <div>
                  <p className="font-medium">Incluir logo R9</p>
                  <p className="text-sm text-muted-foreground">
                    Adiciona a marca R9 Escolinhas no canto da imagem.
                  </p>
                </div>
              </label>
            )}

            {/* STEP 3 — uniforme */}
            {step === 3 && (
              <div className="space-y-3">
                {!hasUniforms ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum uniforme cadastrado para este clube. Você pode pular este passo.
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Opcional — escolha um uniforme ou pule.
                    </p>
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => setUniform(null)}
                        className={cn(
                          "flex size-24 items-center justify-center rounded-md border-2 text-xs text-muted-foreground transition-all",
                          uniform === null
                            ? "border-primary ring-2 ring-primary/30"
                            : "border-border",
                        )}
                        data-testid="select-uniform-none"
                      >
                        Sem uniforme
                      </button>
                      {club!.uniforms.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => setUniform(u)}
                          className={cn(
                            "size-24 overflow-hidden rounded-md border-2 transition-all",
                            uniform?.id === u.id
                              ? "border-primary ring-2 ring-primary/30"
                              : "border-border",
                          )}
                          data-testid={`select-uniform-${u.id}`}
                        >
                          <img src={u.url} alt="Uniforme" className="h-full w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* STEP 4 — referência */}
            {step === 4 && (
              <div className="space-y-3">
                {(references.data?.length ?? 0) === 0 ? (
                  <div className="rounded-md border border-dashed border-border bg-card/50 p-6 text-center text-sm text-muted-foreground">
                    Nenhuma referência disponível.{" "}
                    <Link href="/referencias" className="underline" data-testid="link-goto-referencias">
                      Adicione referências
                    </Link>{" "}
                    para escolher o estilo.
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                    {references.data!.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setReference(r)}
                        className={cn(
                          "aspect-square overflow-hidden rounded-md border-2 transition-all",
                          reference?.id === r.id
                            ? "border-primary ring-2 ring-primary/30"
                            : "border-border",
                        )}
                        data-testid={`select-reference-${r.id}`}
                      >
                        <img src={r.image.url} alt="Referência" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* STEP 5 — métricas */}
            {step === 5 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Selecione métricas e informe os valores.
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={aiFill}
                    data-testid="button-ai-fill"
                  >
                    <Wand2 className="size-4" /> Gerar com IA
                  </Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(metrics.data ?? []).map((m) => {
                    const selected = m.id in selectedMetrics;
                    return (
                      <div
                        key={m.id}
                        className={cn(
                          "flex items-center gap-2 rounded-md border p-2 transition-colors",
                          selected ? "border-primary bg-accent/40" : "border-border",
                        )}
                        data-testid={`metric-row-${m.id}`}
                      >
                        <Checkbox
                          checked={selected}
                          onCheckedChange={() => toggleMetric(m.id)}
                          data-testid={`checkbox-metric-${m.id}`}
                        />
                        <span className="flex-1 truncate text-sm font-medium">{m.name}</span>
                        {selected && (
                          <Input
                            value={selectedMetrics[m.id]}
                            onChange={(e) =>
                              setSelectedMetrics((prev) => ({
                                ...prev,
                                [m.id]: e.target.value,
                              }))
                            }
                            placeholder="Valor"
                            className="h-8 w-20"
                            data-testid={`input-metric-${m.id}`}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
                <div>
                  <p className="mb-1 text-sm font-medium">
                    Instruções adicionais (opcional)
                  </p>
                  <Textarea
                    value={auxiliaryPrompt}
                    onChange={(e) => setAuxiliaryPrompt(e.target.value)}
                    rows={3}
                    placeholder="Ex.: fundo com clima de final de campeonato, tom mais sóbrio, destacar o número 9..."
                    data-testid="input-instrucoes-adicionais"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Essas instruções entram no prompt enviado à IA apenas nesta geração.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* navegação */}
          <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
            <Button
              variant="ghost"
              onClick={back}
              disabled={step === 0}
              data-testid="button-wizard-back"
            >
              <ArrowLeft className="size-4" /> Voltar
            </Button>

            {step < STEP_META.length - 1 ? (
              <Button
                onClick={next}
                disabled={!canAdvance(step)}
                data-testid="button-wizard-next"
              >
                Continuar <ArrowRight className="size-4" />
              </Button>
            ) : (
              <div className="flex flex-col items-end gap-1.5">
                <Button
                  onClick={generate}
                  disabled={
                    !canAdvance(step) || !reference || quota.data?.remaining === 0
                  }
                  data-testid="button-wizard-generate"
                >
                  <Sparkles className="size-4" /> Gerar imagem
                </Button>
                {quota.data && (
                  <p
                    className={cn(
                      "text-xs",
                      quota.data.remaining === 0
                        ? "font-medium text-destructive"
                        : quota.data.remaining <= Math.max(3, Math.ceil(quota.data.limit * 0.1))
                          ? "font-medium text-amber-500"
                          : "text-muted-foreground",
                    )}
                    data-testid="text-quota-restante"
                  >
                    {quota.data.remaining === 0
                      ? "Cota diária esgotada — tente novamente amanhã."
                      : quota.data.remaining <= Math.max(3, Math.ceil(quota.data.limit * 0.1))
                        ? `Atenção: só ${quota.data.remaining === 1 ? "resta 1 geração" : `restam ${quota.data.remaining} gerações`} hoje.`
                        : `${quota.data.remaining} de ${quota.data.limit} gerações restantes hoje`}
                  </p>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* resumo do aluno selecionado */}
      {student && (
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Aluno: <span className="font-medium text-foreground">{student.name}</span>
          {" · "}WhatsApp: {storedToMasked(student.whatsapp)}
        </p>
      )}
    </div>
  );
}

function stepTitle(step: number): string {
  return [
    "Selecionar aluno e foto",
    "Exibir brasão do clube?",
    "Incluir logo R9",
    "Escolher uniforme (opcional)",
    "Selecionar referência",
    "Escolher métricas",
  ][step];
}
