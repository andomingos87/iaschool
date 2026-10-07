import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Sparkles,
  Users,
  School,
  Images,
  Download,
  Maximize2,
  RotateCcw,
  Wand2,
  Plus,
  Loader2,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { cn } from "@workspace/iaschool-ui/lib/utils";
import { Button } from "@workspace/iaschool-ui/components/ui/button";
import { Input } from "@workspace/iaschool-ui/components/ui/input";
import { Textarea } from "@workspace/iaschool-ui/components/ui/textarea";
import { Badge } from "@workspace/iaschool-ui/components/ui/badge";
import {
  Card,
  CardContent,
} from "@workspace/iaschool-ui/components/ui/card";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/iaschool-ui/components/ui/avatar";
import { toast } from "@workspace/iaschool-ui/hooks/use-toast";
import { getDataLayer } from "@/lib/data";
import type {
  SchoolBrand,
  GenerationDetails,
  GenerationRequest,
  ReferencePost,
  StoredImage,
  Student,
} from "@/lib/data";
import { PageHeader } from "@/components/app-shell";
import { EmptyState, CardsSkeleton, ErrorState } from "@/components/data-state";
import { GenerationLoader } from "@/components/generation-loader";
import { GenerationDetailsSection } from "@/components/generation-details";
import { ImageLightbox } from "@/components/image-lightbox";
import { GuardianVerifyDialog } from "@/components/guardian-verify-dialog";
import { useStudents } from "@/hooks/use-students";
import { useClassLabels } from "@/hooks/use-classes";
import { activeByScope, useAuthorizations } from "@/hooks/use-authorizations";
import { useGuardianConsentStatus } from "@/hooks/use-guardian-consent";
import { useSchoolBrands } from "@/hooks/use-school-brands";
import { useReferences } from "@/hooks/use-references";
import { useCreateGeneratedPost } from "@/hooks/use-generated-posts";
import { useGenerationQuota } from "@/hooks/use-generation-quota";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/query-keys";
import { iaschool } from "@/config/iaschool";
import { useAuth } from "@/hooks/use-auth";
import { isPlatformAdmin } from "@/lib/data";
import {
  artWizardSteps,
  initialArtSchoolId,
  studentSchoolInSession,
  type ArtWizardStep,
} from "@/lib/art-wizard";
import {
  ageBracket,
  allowedShareTarget,
  generationBlockers,
  hasVerifiedGuardianChannel,
  requiresGuardianConsent,
  shareBlockers,
} from "@/lib/eca";
import { stampAiDisclosure } from "@/lib/watermark";
import { initials, storedToMasked, studentContactLine } from "@/lib/format";
import {
  AUX_PROMPT_PREFILL_EVENT,
  AUX_PROMPT_PREFILL_KEY,
} from "@/lib/constants";

type Phase = "form" | "generating" | "result";

const STEP_ICON: Record<ArtWizardStep, typeof Users> = {
  aluno: Users,
  escola: School,
  modelo: Images,
};

const STEP_LABEL: Record<ArtWizardStep, string> = {
  aluno: "Aluno",
  escola: "Escola",
  modelo: "Modelo de arte",
};

const STEP_TITLE: Record<ArtWizardStep, string> = {
  aluno: "Selecionar aluno e foto",
  escola: "Escolher escola",
  modelo: "Escolher o modelo de arte",
};

export default function GeneratePage() {
  const students = useStudents();
  const classLabels = useClassLabels();
  const schoolBrands = useSchoolBrands();
  const references = useReferences();
  const createPost = useCreateGeneratedPost();
  const quota = useGenerationQuota();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const me = session?.user;

  const [phase, setPhase] = useState<Phase>("form");
  const [step, setStep] = useState(0);

  // seleções
  const [student, setStudent] = useState<Student | null>(null);
  const [photo, setPhoto] = useState<StoredImage | null>(null);
  // null = ainda não escolheu; cai na escola inicial da sessão.
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);
  const [outOfSessionName, setOutOfSessionName] = useState<string | null>(null);
  const [reference, setReference] = useState<ReferencePost | null>(null);
  const [auxiliaryPrompt, setAuxiliaryPrompt] = useState("");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultDetails, setResultDetails] = useState<GenerationDetails | null>(null);
  // Progresso real (0–100) do upload das fotos; null = fase de geração.
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  // id do post salvo — necessário para amarrar o envio à trilha de auditoria.
  const [resultPostId, setResultPostId] = useState<string | null>(null);
  const [guardianDialogOpen, setGuardianDialogOpen] = useState(false);

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

  const platformAdmin = isPlatformAdmin(session?.user.role);
  const membershipIds = useMemo(
    () => (session?.user.schools ?? []).map((s) => s.schoolId),
    [session?.user.schools],
  );
  const visibleSchoolIds = useMemo(
    () => (schoolBrands.data ?? []).map((b) => b.id),
    [schoolBrands.data],
  );
  const steps = useMemo(
    () => artWizardSteps({ schoolCount: membershipIds.length, platformAdmin }),
    [membershipIds.length, platformAdmin],
  );
  const defaultSchoolId = useMemo(
    () =>
      initialArtSchoolId({
        membershipSchoolIds: membershipIds,
        visibleSchoolIds,
        activeSchoolId: session?.activeSchoolId,
        platformAdmin,
      }),
    [membershipIds, visibleSchoolIds, session?.activeSchoolId, platformAdmin],
  );
  const brandId = selectedBrandId ?? defaultSchoolId;

  // Pré-seleciona o aluno vindo de /gerar?aluno=<id>. Escola fora da sessão
  // não avança e não busca a escola por outro caminho.
  const [prefillApplied, setPrefillApplied] = useState(false);
  useEffect(() => {
    if (prefillApplied || !students.data || schoolBrands.isLoading) return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("aluno");
    if (!id) {
      setPrefillApplied(true);
      return;
    }
    setPrefillApplied(true);
    const s = students.data.find((x) => x.id === id);
    const url = new URL(window.location.href);
    url.searchParams.delete("aluno");
    window.history.replaceState(null, "", url.toString());
    if (!s) return;
    const inSession = studentSchoolInSession({
      studentSchoolId: s.schoolId,
      membershipSchoolIds: membershipIds,
      visibleSchoolIds,
      platformAdmin,
    });
    if (!inSession) {
      setOutOfSessionName(s.name);
      setStudent(null);
      setPhoto(null);
      return;
    }
    setOutOfSessionName(null);
    setStudent(s);
    setPhoto(s.photos?.[0] ?? null);
    setSelectedBrandId(s.schoolId);
  }, [
    prefillApplied,
    students.data,
    schoolBrands.isLoading,
    membershipIds,
    visibleSchoolIds,
    platformAdmin,
  ]);

  const schoolBrand: SchoolBrand | undefined = useMemo(
    () => schoolBrands.data?.find((b) => b.id === brandId),
    [schoolBrands.data, brandId],
  );

  const loading =
    students.isLoading || schoolBrands.isLoading || references.isLoading;

  const sessionSchools = {
    membershipSchoolIds: membershipIds,
    visibleSchoolIds,
    platformAdmin,
  };

  const roster = useMemo(
    () => (students.data ?? []).filter((s) => !!brandId && s.schoolId === brandId),
    [students.data, brandId],
  );

  // valida cada passo
  /**
   * Impedimentos do ECA Digital para o aluno selecionado.
   * Vazio = liberado. Ver lib/eca.ts para a base legal de cada item.
   */
  const authorizations = useAuthorizations(student?.id ?? null);
  const consentStatus = useGuardianConsentStatus(student?.id ?? null);
  const artCompliance = {
    biometricSortingActive: activeByScope(authorizations.data).has("biometric_sorting"),
    deliveryAccepted: consentStatus.data?.state === "accepted",
  };
  const blockers = student ? generationBlockers(student, artCompliance) : [];
  const shareIssues = student ? shareBlockers(student, artCompliance) : [];

  function sameSchool(s: Student): boolean {
    return (
      !!brandId &&
      s.schoolId === brandId &&
      studentSchoolInSession({ studentSchoolId: s.schoolId, ...sessionSchools })
    );
  }

  function canAdvance(current: number): boolean {
    const key = steps[current];
    if (key === "aluno") {
      // Sem conformidade não se avança: a foto do aluno não pode ser
      // enviada ao modelo antes de a autorização estar registrada.
      return !!student && !!photo && blockers.length === 0 && sameSchool(student);
    }
    if (key === "escola") return !!schoolBrand && schoolBrand.id === brandId;
    if (key === "modelo") return !!reference;
    return false;
  }

  function next() {
    setStep((s) => Math.min(s + 1, steps.length - 1));
  }
  function back() {
    setStep((s) => Math.max(s - 1, 0));
  }

  function resetAll() {
    setPhase("form");
    setStep(0);
    setStudent(null);
    setPhoto(null);
    setSelectedBrandId(null);
    setOutOfSessionName(null);
    setResultPostId(null);
    setReference(null);
    setAuxiliaryPrompt("");
    setResultUrl(null);
    setResultDetails(null);
  }

  function selectSchoolBrand(id: string) {
    if (id === brandId) return;
    setSelectedBrandId(id);
    if (student && student.schoolId !== id) {
      setStudent(null);
      setPhoto(null);
    }
  }

  function pickStudent(s: Student) {
    if (
      !studentSchoolInSession({
        studentSchoolId: s.schoolId,
        ...sessionSchools,
      })
    ) {
      setOutOfSessionName(s.name);
      setStudent(null);
      setPhoto(null);
      return;
    }
    setOutOfSessionName(null);
    setStudent(s);
    setPhoto(s.photos?.[0] ?? null);
    if (steps.includes("escola")) setSelectedBrandId(s.schoolId);
  }

  async function generate() {
    if (!student || !photo || !reference) return;
    if (!schoolBrand) {
      toast({
        variant: "destructive",
        title: "Escola indisponível",
        description: "Esta conta não tem uma escola na sessão.",
      });
      return;
    }
    if (student.schoolId !== schoolBrand.id || !sameSchool(student)) {
      toast({
        variant: "destructive",
        title: "Escola diferente do aluno",
        description: "A arte usa a escola do aluno. Troque o aluno ou a escola.",
      });
      return;
    }
    // Segunda barreira, além do wizard: nenhuma foto de menor sai daqui sem
    // consentimento registrado do responsável (Lei 15.211/2025, art. 7º, § 2º).
    if (blockers.length > 0) {
      toast({
        variant: "destructive",
        title: "Geração bloqueada",
        description: blockers[0].message,
      });
      return;
    }
    const request: GenerationRequest = {
      student,
      studentPhoto: photo,
      schoolBrand,
      showSchoolLogo: false,
      reference,
      auxiliaryPrompt: auxiliaryPrompt.trim() || undefined,
    };

    setPhase("generating");
    setUploadProgress(0);
    try {
      const { imageUrl, details, logId } = await getDataLayer().generation.generate(
        request,
        (percent) => setUploadProgress(percent < 100 ? percent : null),
      );
      // Selo de transparência do caráter sintético aplicado ANTES de salvar,
      // para que toda cópia que sai do produto já nasça marcada
      // (Decreto 12.880/2026, art. 11, I).
      const stampedUrl = await stampAiDisclosure(imageUrl);
      setResultUrl(stampedUrl);
      setResultDetails(details);
      setPhase("result");
      // O saldo diário mudou — atualiza o indicador na próxima visita ao form.
      void queryClient.invalidateQueries({ queryKey: qk.generationQuota });
      // Se salvar no histórico falhar, a imagem gerada continua visível.
      try {
        // Persiste a imagem no Storage (bucket "generated") em vez de gravar
        // a data URL base64 gigante direto no banco. Se o upload falhar,
        // salva a data URL mesmo assim para não perder o post.
        let savedUrl = stampedUrl;
        if (stampedUrl.startsWith("data:")) {
          try {
            const blob = await (await fetch(stampedUrl)).blob();
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
        const saved = await createPost.mutateAsync({
          studentId: student.id,
          imageUrl: savedUrl,
          details,
        });
        setResultPostId(saved.id);
        // Vincula a URL do post salvo ao log de auditoria (best-effort).
        if (logId && savedUrl.startsWith("http")) {
          void (async () => {
            try {
              const token = await getDataLayer().auth.getAccessToken();
              if (!token) return;
              await fetch(`/api/generation/logs/${logId}/result`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ imageUrl: savedUrl }),
              });
            } catch {
              // log é best-effort — nunca incomoda o usuário
            }
          })();
        }
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
    a.download = `iaschool-${student?.name.replace(/\s+/g, "-").toLowerCase() ?? "post"}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  /**
   * Envio da imagem por WhatsApp.
   *
   * Para aluno menor de 18 anos, o único destino permitido é o número
   * verificado do responsável legal, e todo envio é registrado na trilha de
   * auditoria (Lei 15.211/2025, arts. 6º, V e 7º, § 2º; Decreto, art. 35).
   */
  async function sendWhatsapp() {
    if (!student) return;
    if (shareIssues.length > 0) {
      const issue = shareIssues[0];
      toast({
        variant: "destructive",
        title: "Envio bloqueado",
        description: `${issue.message} (${issue.legalBasis})`,
      });
      if (issue.code === "canal-nao-verificado") setGuardianDialogOpen(true);
      return;
    }
    const target = allowedShareTarget(student, artCompliance);
    if (!target) {
      toast({
        variant: "destructive",
        title: "Envio bloqueado",
        description: "Nenhum destino autorizado para este aluno.",
      });
      return;
    }

    // A trilha é gravada ANTES de abrir o WhatsApp: se o registro falhar, o
    // envio não acontece. Uma trilha incompleta não serve como prova.
    if (resultPostId) {
      try {
        await getDataLayer().shareLogs.record({
          postId: resultPostId,
          studentId: student.id,
          studentName: student.name,
          channel: "whatsapp",
          targetWhatsapp: target.whatsapp,
          targetLabel: target.label,
          studentAgeBracket: ageBracket(student.birthDate) ?? "adulto",
          guardianConsentAt: student.guardian?.consentAt,
          sentByUserId: me?.id ?? "",
          sentByName: me?.name ?? "",
        });
      } catch (err) {
        toast({
          variant: "destructive",
          title: "Envio não registrado",
          description:
            err instanceof Error
              ? err.message
              : "Não foi possível registrar o envio na auditoria.",
        });
        return;
      }
    }

    const msg = iaschool.generation.shareMessage(student.name);
    window.open(
      `https://wa.me/${target.whatsapp}?text=${encodeURIComponent(msg)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  // ---- Estados de nível de página ----
  if (loading) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader title="Criar arte" description="Carregando dados..." />
        <CardsSkeleton count={3} />
      </div>
    );
  }

  if ((students.data?.length ?? 0) === 0) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader title="Criar arte" />
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
              <Button
                onClick={sendWhatsapp}
                disabled={shareIssues.length > 0}
                data-testid="button-whatsapp"
              >
                <SiWhatsapp className="size-4" /> WhatsApp
              </Button>
            </div>

            {/* Destino do envio — quem pode receber a imagem de um menor */}
            {student && requiresGuardianConsent(student.birthDate) && (
              <div
                className={cn(
                  "w-full max-w-md rounded-md border p-3 text-sm",
                  shareIssues.length > 0
                    ? "border-destructive/50 bg-destructive/10"
                    : "border-primary/40 bg-accent/30",
                )}
                data-testid="box-share-target"
              >
                {shareIssues.length > 0 ? (
                  <div className="flex items-start gap-2">
                    <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
                    <div className="space-y-2">
                      <p className="font-medium text-destructive">
                        Envio bloqueado
                      </p>
                      <ul className="space-y-1 text-xs text-muted-foreground">
                        {shareIssues.map((i) => (
                          <li key={i.code}>
                            {i.message}{" "}
                            <span className="opacity-70">({i.legalBasis})</span>
                          </li>
                        ))}
                      </ul>
                      {student.guardian?.whatsapp && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setGuardianDialogOpen(true)}
                          data-testid="button-verify-guardian-result"
                        >
                          <ShieldCheck className="size-4" /> Verificar WhatsApp do
                          responsável
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                    <p className="text-xs text-muted-foreground">
                      Aluno menor de 18 anos: o envio vai para{" "}
                      <span className="font-medium text-foreground">
                        {student.guardian?.name} (responsável)
                      </span>{" "}
                      no número verificado{" "}
                      <span className="font-mono">
                        {storedToMasked(student.guardian?.whatsapp ?? "")}
                      </span>
                      . Cada envio fica registrado na auditoria.
                    </p>
                  </div>
                )}
              </div>
            )}
            <GenerationDetailsSection
              details={resultDetails}
              className="max-w-md"
            />
            <p className="max-w-md text-center text-xs text-muted-foreground">
              O WhatsApp abre com a mensagem pronta. A imagem não pode ser anexada
              automaticamente — baixe o PNG e envie junto. Toda imagem sai com o
              selo "imagem gerada por IA" (Decreto nº 12.880/2026, art. 11).
            </p>
            <Button variant="ghost" onClick={resetAll} data-testid="button-nova-geracao">
              <RotateCcw className="size-4" /> Gerar outra imagem
            </Button>
          </CardContent>
        </Card>
        <ImageLightbox src={zoom} onClose={() => setZoom(null)} />
        <GuardianVerifyDialog
          open={guardianDialogOpen}
          onOpenChange={setGuardianDialogOpen}
          student={student}
        />
      </div>
    );
  }

  // ---- Wizard (form) ----
  const stepKey = steps[step] ?? steps[steps.length - 1];
  const StepIcon = STEP_ICON[stepKey];
  const choosableSchools = (schoolBrands.data ?? []).filter(
    (b) => platformAdmin || membershipIds.includes(b.id),
  );

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Criar arte"
        description="Monte a arte passo a passo. Leva menos de um minuto."
      />

      {/* stepper */}
      <div className="mb-6 flex items-center gap-1 overflow-x-auto pb-2">
        {steps.map((key, i) => {
          const Icon = STEP_ICON[key];
          const done = i < step;
          const active = i === step;
          return (
            <div key={key} className="flex items-center">
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
                data-testid={`step-${key}`}
              >
                {done ? <Check className="size-3.5" /> : <Icon className="size-3.5" />}
                <span className="hidden sm:inline">{STEP_LABEL[key]}</span>
              </button>
              {i < steps.length - 1 && (
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
            <h2 className="text-lg font-bold">{STEP_TITLE[stepKey]}</h2>
          </div>

          <div key={step} className="animate-in fade-in slide-in-from-right-2 duration-300">
            {/* STEP 0 — aluno + foto */}
            {stepKey === "aluno" && (
              <div className="space-y-5">
                {outOfSessionName && (
                  <div
                    className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm"
                    data-testid="box-school-out-of-session"
                  >
                    A escola de {outOfSessionName} não está na sua sessão. O
                    passo não avança. O acesso à escola não foi ampliado.
                  </div>
                )}
                {roster.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum aluno desta escola.
                  </p>
                ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {roster.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => pickStudent(s)}
                      className={cn(
                        "flex items-center gap-3 rounded-md border p-3 text-left transition-colors",
                        student?.id === s.id
                          ? "border-primary bg-accent"
                          : "border-border hover:border-primary/50",
                      )}
                      data-testid={`select-student-${s.id}`}
                    >
                      <Avatar className="size-10">
                        {s.photos?.[0] && (
                          <AvatarImage
                            src={s.photos[0].url}
                            alt={s.name}
                            className="object-cover"
                          />
                        )}
                        <AvatarFallback className="text-xs">{initials(s.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{s.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {studentContactLine(s, s.classId ? classLabels.get(s.classId) : undefined)}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
                )}

                {student && blockers.length > 0 && (
                  <div
                    className="rounded-md border border-destructive/50 bg-destructive/10 p-4"
                    data-testid="box-generation-blockers"
                  >
                    <div className="flex items-start gap-2">
                      <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-destructive">
                          Não é possível gerar imagem deste aluno
                        </p>
                        <ul className="space-y-1 text-xs text-muted-foreground">
                          {blockers.map((b) => (
                            <li key={b.code}>
                              {b.message}{" "}
                              <span className="opacity-70">({b.legalBasis})</span>
                            </li>
                          ))}
                        </ul>
                        <Link
                          href={`/alunos/${student.id}`}
                          className="inline-block text-xs underline"
                          data-testid="link-fix-student"
                        >
                          Completar o cadastro do aluno
                        </Link>
                      </div>
                    </div>
                  </div>
                )}

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

            {stepKey === "escola" && (
              <div className="space-y-5">
                {schoolBrands.isError ? (
                  <ErrorState onRetry={() => schoolBrands.refetch()} />
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      A escola do aluno já vem marcada. As cores dessa escola
                      entram na arte. O logo não é colocado. Para mudar o
                      cadastro, abra a página Escola.
                    </p>

                    {choosableSchools.length === 0 ? (
                      <div className="rounded-md border border-dashed border-border bg-card/50 p-6 text-center text-sm text-muted-foreground">
                        Sua conta ainda não está vinculada a nenhuma escola.
                      </div>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {choosableSchools.map((b) => (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => selectSchoolBrand(b.id)}
                            className={cn(
                              "flex items-center gap-3 rounded-md border p-3 text-left transition-colors",
                              brandId === b.id
                                ? "border-primary bg-accent"
                                : "border-border hover:border-primary/50",
                            )}
                            data-testid={`select-school-brand-${b.id}`}
                          >
                            <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
                              {b.logo ? (
                                <img
                                  src={b.logo.url}
                                  alt=""
                                  className="h-full w-full object-contain"
                                />
                              ) : (
                                <School className="size-5 text-muted-foreground" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-medium">
                                {b.name}
                                {student?.schoolId === b.id && (
                                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                                    (escola do aluno)
                                  </span>
                                )}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {b.colors.length === 0
                                  ? "Sem cores cadastradas"
                                  : b.colors.length === 1
                                    ? "1 cor na arte"
                                    : `${b.colors.length} cores na arte`}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {stepKey === "modelo" && (
              <div className="space-y-5">
                {(references.data?.length ?? 0) === 0 ? (
                  <div className="rounded-md border border-dashed border-border bg-card/50 p-6 text-center text-sm text-muted-foreground">
                    Nenhum modelo de arte disponível.{" "}
                    <Link
                      href="/referencias"
                      className="underline"
                      data-testid="link-goto-referencias"
                    >
                      Adicione modelos
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
                        <img
                          src={r.image.url}
                          alt="Modelo de arte"
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}

                <div>
                  <p className="mb-1 text-sm font-medium">
                    Tema do evento e instruções (opcional)
                  </p>
                  <Textarea
                    value={auxiliaryPrompt}
                    onChange={(e) => setAuxiliaryPrompt(e.target.value)}
                    rows={3}
                    placeholder="Ex.: Festa Junina, bandeirinhas coloridas ao fundo, tom alegre..."
                    data-testid="input-instrucoes-adicionais"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Essas instruções entram no prompt enviado à IA apenas nesta
                    geração.
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

            {step < steps.length - 1 ? (
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
                  <Sparkles className="size-4" /> Gerar arte
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
          {" · "}
          {studentContactLine(
            student,
            student.classId ? classLabels.get(student.classId) : undefined,
          )}
          {" · "}Escola:{" "}
          <span className="font-medium text-foreground">
            {schoolBrand?.name ?? "Escola indisponível"}
          </span>
        </p>
      )}

      <GuardianVerifyDialog
        open={guardianDialogOpen}
        onOpenChange={setGuardianDialogOpen}
        student={student}
      />
    </div>
  );
}


