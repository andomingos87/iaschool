import type { CSSProperties, ReactNode } from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  CalendarDays,
  Check,
  CloudUpload,
  Download,
  FileCheck2,
  FolderHeart,
  History,
  Link2,
  ScanFace,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Users,
} from "lucide-react";
import { iaschool } from "@/config/iaschool";
import { resolveLandingCta } from "@/lib/landing";

/**
 * Landing pública da AIESCOLA (rota `/` sem sessão).
 *
 * Usa a paleta da marca direto, sem os tokens do tema do painel, e nenhuma
 * foto de pessoa: as imagens do produto são ilustrações abstratas.
 */

const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap";

const palette = {
  "--lp-azul": "#2447D6",
  "--lp-tinta": "#0F1A3D",
  "--lp-faisca": "#F26B1D",
  "--lp-giz": "#FFD25A",
  "--lp-nevoa": "#E6EAF7",
  "--lp-papel": "#F8F6F1",
} as CSSProperties;

const display = "font-[Bricolage_Grotesque,ui-sans-serif,sans-serif] tracking-[-0.02em]";

const cta = resolveLandingCta(import.meta.env.VITE_DEMO_CONTACT_URL);

function PrimaryCta({ className = "" }: { className?: string }) {
  const base =
    "group inline-flex items-center justify-center gap-2 rounded-full bg-[var(--lp-faisca)] px-6 py-3.5 text-[15px] font-semibold text-white shadow-[0_8px_24px_-8px_rgba(242,107,29,0.7)] transition hover:-translate-y-0.5 hover:bg-[#e35f12] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--lp-faisca)]/30";
  const content = (
    <>
      {cta.kind === "demo" ? "Agendar demonstração" : "Acessar a plataforma"}
      <ArrowRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden />
    </>
  );
  if (cta.kind === "login") {
    return (
      <Link href={cta.href} className={`${base} ${className}`} data-testid="landing-cta">
        {content}
      </Link>
    );
  }
  return (
    <a
      href={cta.href}
      className={`${base} ${className}`}
      data-testid="landing-cta"
      {...(cta.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {content}
    </a>
  );
}

function Spark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="currentColor" d="M12 2Q13.2 10.8 22 12Q13.2 13.2 12 22Q10.8 13.2 2 12Q10.8 10.8 12 2Z" />
    </svg>
  );
}

function SectionTitle({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-[var(--lp-azul)]">{eyebrow}</p>
      <h2 className={`${display} mt-3 text-3xl font-bold leading-[1.1] text-[var(--lp-tinta)] sm:text-[44px]`}>{title}</h2>
      {children && <p className="mt-4 text-[17px] leading-relaxed text-[var(--lp-tinta)]/70">{children}</p>}
    </div>
  );
}

/* Ilustração do painel: um evento com fotos abstratas, sem pessoas. */
const TILE_COLORS = ["#2447D6", "#FFD25A", "#F26B1D", "#E6EAF7", "#0F1A3D", "#7C93F0", "#FFE9A8", "#F9A66E"];

function ProductMock() {
  return (
    <div className="relative mx-auto w-full max-w-[560px]">
      <div className="absolute -inset-6 -z-10 rounded-[40px] bg-[radial-gradient(60%_60%_at_70%_30%,rgba(36,71,214,0.22),transparent),radial-gradient(50%_50%_at_20%_80%,rgba(255,210,90,0.35),transparent)] blur-2xl" />
      <div className="overflow-hidden rounded-3xl border border-[var(--lp-tinta)]/10 bg-white shadow-[0_30px_80px_-30px_rgba(15,26,61,0.45)]">
        <div className="flex items-center gap-2 border-b border-[var(--lp-tinta)]/8 bg-[var(--lp-papel)] px-4 py-3">
          <span className="size-2.5 rounded-full bg-[#F26B1D]/70" />
          <span className="size-2.5 rounded-full bg-[#FFD25A]" />
          <span className="size-2.5 rounded-full bg-[#2447D6]/50" />
          <span className="ml-3 truncate text-xs font-medium text-[var(--lp-tinta)]/50">Eventos › Festa junina 2026</span>
        </div>
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={`${display} text-lg font-bold text-[var(--lp-tinta)]`}>Festa junina 2026</p>
              <p className="mt-0.5 text-xs text-[var(--lp-tinta)]/55">Educação infantil · 6 turmas</p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-[#E9F7EE] px-2.5 py-1 text-[11px] font-semibold text-[#17803D]">
              <Check className="size-3" aria-hidden /> Separado por aluno
            </span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--lp-nevoa)]">
            <div className="h-full w-[86%] rounded-full bg-[var(--lp-azul)]" />
          </div>
          <div className="mt-1.5 flex justify-between text-[11px] text-[var(--lp-tinta)]/55">
            <span>Reconhecimento concluído</span>
            <span>Revisão da equipe em andamento</span>
          </div>
          <div className="mt-4 grid grid-cols-4 gap-2">
            {TILE_COLORS.map((color, i) => (
              <div key={color} className="relative aspect-square overflow-hidden rounded-xl" style={{ background: color }}>
                <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/15 to-transparent" />
                <div
                  className="absolute rounded-full bg-white/35"
                  style={{ width: "46%", height: "46%", left: `${18 + (i % 3) * 8}%`, top: `${14 + (i % 2) * 10}%` }}
                />
                {i === 2 && (
                  <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-white text-[var(--lp-azul)] shadow">
                    <Check className="size-3" aria-hidden />
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="absolute -left-4 top-[38%] hidden w-56 rounded-2xl border border-[var(--lp-tinta)]/10 bg-white p-3.5 shadow-[0_20px_50px_-20px_rgba(15,26,61,0.5)] sm:block lg:-left-14">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-[var(--lp-nevoa)] text-[var(--lp-azul)]">
            <ScanFace className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-[var(--lp-tinta)]">3 rostos para revisar</p>
            <p className="text-[11px] text-[var(--lp-tinta)]/55">A equipe confirma antes de enviar</p>
          </div>
        </div>
      </div>

      <div className="absolute -bottom-6 -right-3 w-60 rounded-2xl bg-[var(--lp-tinta)] p-4 text-white shadow-[0_24px_60px_-20px_rgba(15,26,61,0.7)] sm:-right-8">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/60">Álbum da família</p>
          <Spark className="size-4 text-[var(--lp-giz)]" />
        </div>
        <p className={`${display} mt-1.5 text-[17px] font-bold`}>12 fotos prontas</p>
        <div className="mt-3 flex items-center gap-2 text-[12px] text-white/75">
          <Link2 className="size-3.5" aria-hidden /> Link exclusivo do responsável
        </div>
        <div className="mt-1.5 flex items-center gap-2 text-[12px] text-white/75">
          <Download className="size-3.5" aria-hidden /> Baixar uma a uma ou em ZIP
        </div>
      </div>
    </div>
  );
}

const STEPS = [
  {
    icon: UserCheck,
    title: "Cadastro e autorização",
    text: "A escola cadastra turmas e alunos. O responsável autoriza o reconhecimento e o recebimento das fotos.",
  },
  {
    icon: CloudUpload,
    title: "Upload do evento",
    text: "Depois da festa, da formatura ou do passeio, a equipe sobe todas as fotos de uma vez.",
  },
  {
    icon: ScanFace,
    title: "Separação e revisão",
    text: "O reconhecimento facial sugere quem está em cada foto. Uma pessoa da escola confere e confirma.",
  },
  {
    icon: FolderHeart,
    title: "Entrega à família",
    text: "Cada responsável recebe um link com as fotos aprovadas do seu filho, agrupadas por evento.",
  },
];

const FEATURES = [
  {
    icon: ScanFace,
    title: "Reconhecimento com revisão humana",
    text: "A IA faz o trabalho pesado de separar milhares de fotos. Nada sai da escola sem alguém conferir.",
    wide: true,
    tone: "azul",
  },
  {
    icon: FolderHeart,
    title: "Álbum por link",
    text: "Sem aplicativo para instalar. A família abre o link, filtra por evento e baixa tudo em ZIP.",
    tone: "papel",
  },
  {
    icon: Sparkles,
    title: "Artes com IA por aluno",
    text: "Gere artes personalizadas por aluno e turma a partir do modelo da escola, sempre sinalizadas como imagem de IA.",
    tone: "papel",
  },
  {
    icon: Users,
    title: "Turmas e eventos organizados",
    text: "Pasta de cada aluno com o histórico de fotos confirmadas, separadas por evento.",
    tone: "papel",
  },
  {
    icon: History,
    title: "Trilha de auditoria",
    text: "Quem aprovou, o que foi enviado e quando o álbum foi aberto ficam registrados.",
    tone: "tinta",
  },
] as const;

const TRUST = [
  { icon: FileCheck2, text: "Autorização do responsável separada por finalidade: reconhecimento e recebimento das fotos." },
  { icon: ShieldCheck, text: "Autorização revogada interrompe o acesso e o uso das referências do aluno." },
  { icon: Link2, text: "Link exclusivo por família, com sessão de prazo curto e possibilidade de revogação pela escola." },
  { icon: UserCheck, text: "Cada família vê só as fotos aprovadas do próprio filho, nunca as de outro aluno." },
  { icon: Sparkles, text: "Toda imagem gerada por IA sai identificada como tal." },
  { icon: History, text: "Registro de aprovações, envios e aberturas para a escola prestar contas." },
];

const FAQ = [
  {
    q: "A família precisa instalar algum aplicativo?",
    a: "Não. O responsável recebe um link e abre no navegador do celular ou do computador. Dali dá para ver, filtrar por evento e baixar as fotos.",
  },
  {
    q: "O reconhecimento facial decide sozinho quem está na foto?",
    a: "Não. Ele sugere, e uma pessoa da escola revisa e confirma antes de qualquer foto ser entregue.",
  },
  {
    q: "E se o responsável não autorizar?",
    a: "Sem a autorização, o aluno não entra no reconhecimento e a família não recebe fotos pela plataforma. A autorização pode ser retirada depois.",
  },
  {
    q: "Uma família pode ver fotos de outro aluno?",
    a: "Não. Cada link mostra só as fotos aprovadas para aquele responsável e aquela escola.",
  },
  {
    q: "Serve para qualquer etapa de ensino?",
    a: "Sim. Educação infantil, fundamental e médio: festas, formaturas, passeios e qualquer evento com fotos.",
  },
];

export default function LandingPage() {
  const year = new Date().getFullYear();
  return (
    <div
      style={palette}
      className="min-h-[100dvh] bg-[var(--lp-papel)] font-[Plus_Jakarta_Sans,ui-sans-serif,sans-serif] text-[var(--lp-tinta)] antialiased selection:bg-[var(--lp-giz)]"
    >
      <link rel="stylesheet" href={FONTS_HREF} precedence="default" />
      <title>{`${iaschool.brand.name} — fotos da escola, entregues a cada família`}</title>

      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2"
      >
        Pular para o conteúdo
      </a>

      {/* Cabeçalho */}
      <header className="sticky top-0 z-40 border-b border-[var(--lp-tinta)]/8 bg-[var(--lp-papel)]/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <a href="#topo" className="shrink-0" aria-label={`${iaschool.brand.name}, início`}>
            <img src="/brand/aiescola-logo.svg" alt={iaschool.brand.name} className="h-8 w-auto" />
          </a>
          <nav aria-label="Seções" className="hidden items-center gap-8 text-[14px] font-medium text-[var(--lp-tinta)]/70 md:flex">
            <a href="#como-funciona" className="transition hover:text-[var(--lp-tinta)]">Como funciona</a>
            <a href="#recursos" className="transition hover:text-[var(--lp-tinta)]">Recursos</a>
            <a href="#seguranca" className="transition hover:text-[var(--lp-tinta)]">Segurança</a>
            <a href="#perguntas" className="transition hover:text-[var(--lp-tinta)]">Perguntas</a>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/entrar"
              className="rounded-full px-4 py-2 text-[14px] font-semibold text-[var(--lp-tinta)] transition hover:bg-[var(--lp-tinta)]/5"
              data-testid="landing-login"
            >
              Entrar
            </Link>
            {cta.kind === "demo" && (
              <a
                href={cta.href}
                {...(cta.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="hidden rounded-full bg-[var(--lp-tinta)] px-4 py-2 text-[14px] font-semibold text-white transition hover:bg-[var(--lp-azul)] sm:inline-flex"
              >
                Agendar demonstração
              </a>
            )}
          </div>
        </div>
      </header>

      <main id="conteudo">
        {/* Hero */}
        <section id="topo" className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(15,26,61,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(15,26,61,0.045)_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(70%_60%_at_50%_0%,black,transparent)]" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pb-24 pt-14 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:pb-32 lg:pt-20">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-[var(--lp-azul)]/20 bg-white px-3 py-1.5 text-[13px] font-semibold text-[var(--lp-azul)]">
                <Spark className="size-3.5 text-[var(--lp-faisca)]" />
                Fotos escolares com IA e autorização da família
              </p>
              <h1 className={`${display} mt-6 text-[42px] font-extrabold leading-[1.02] sm:text-6xl lg:text-[68px]`}>
                Cada família recebe as fotos{" "}
                <span className="relative whitespace-nowrap text-[var(--lp-azul)]">
                  do seu filho
                  <svg viewBox="0 0 300 16" className="absolute -bottom-2 left-0 h-3 w-full text-[var(--lp-giz)]" preserveAspectRatio="none" aria-hidden>
                    <path d="M3 11 Q 150 1 297 9" stroke="currentColor" strokeWidth="6" strokeLinecap="round" fill="none" />
                  </svg>
                </span>
                .
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-[var(--lp-tinta)]/72">
                A escola sobe as fotos do evento, a {iaschool.brand.name} separa por aluno com reconhecimento
                facial, a equipe confere e cada responsável recebe um álbum só com as fotos do seu filho.
                Sem planilha, sem pasta compartilhada, sem foto no grupo errado.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <PrimaryCta />
                <a
                  href="#como-funciona"
                  className="inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-[15px] font-semibold text-[var(--lp-tinta)] ring-1 ring-[var(--lp-tinta)]/15 transition hover:bg-white"
                >
                  Ver como funciona
                </a>
              </div>
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[14px] text-[var(--lp-tinta)]/65">
                {["Revisão humana antes de enviar", "Sem app para a família", "Autorização registrada"].map((t) => (
                  <li key={t} className="flex items-center gap-1.5">
                    <Check className="size-4 text-[var(--lp-azul)]" aria-hidden /> {t}
                  </li>
                ))}
              </ul>
            </div>
            <ProductMock />
          </div>
        </section>

        {/* Problema */}
        <section className="bg-[var(--lp-tinta)] text-white">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-[1fr_1.4fr] md:items-center">
            <h2 className={`${display} text-3xl font-bold leading-tight sm:text-4xl`}>
              Depois do evento, começa o trabalho que ninguém vê.
            </h2>
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                ["Horas", "abrindo foto por foto para descobrir quem aparece em cada uma."],
                ["Grupos", "e pastas abertas onde todo mundo vê a foto de todo mundo."],
                ["Dúvida", "sobre quais famílias autorizaram o uso da imagem do filho."],
              ].map(([k, v]) => (
                <div key={k} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                  <p className={`${display} text-2xl font-bold text-[var(--lp-giz)]`}>{k}</p>
                  <p className="mt-2 text-[14px] leading-relaxed text-white/70">{v}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Como funciona */}
        <section id="como-funciona" className="scroll-mt-20 px-4 py-24 sm:px-6">
          <SectionTitle eyebrow="Como funciona" title="Do upload ao álbum da família em quatro passos">
            A escola mantém o controle de cada etapa. A IA faz a parte repetitiva.
          </SectionTitle>
          <ol className="mx-auto mt-14 grid max-w-6xl gap-5 md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="relative rounded-3xl border border-[var(--lp-tinta)]/8 bg-white p-6 shadow-[0_1px_0_rgba(15,26,61,0.04)]">
                <div className="flex items-center justify-between">
                  <span className="grid size-11 place-items-center rounded-2xl bg-[var(--lp-nevoa)] text-[var(--lp-azul)]">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className={`${display} text-4xl font-extrabold text-[var(--lp-tinta)]/8`}>0{i + 1}</span>
                </div>
                <h3 className={`${display} mt-5 text-xl font-bold`}>{title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-[var(--lp-tinta)]/68">{text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Recursos */}
        <section id="recursos" className="scroll-mt-20 bg-white px-4 py-24 sm:px-6">
          <SectionTitle eyebrow="Recursos" title="Tudo o que a escola precisa para entregar fotos com cuidado" />
          <div className="mx-auto mt-14 grid max-w-6xl gap-5 md:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text, tone, ...rest }) => {
              const wide = "wide" in rest && rest.wide;
              const tones = {
                azul: "bg-[var(--lp-azul)] text-white",
                tinta: "bg-[var(--lp-tinta)] text-white",
                papel: "bg-[var(--lp-papel)] text-[var(--lp-tinta)]",
              } as const;
              const muted = tone === "papel" ? "text-[var(--lp-tinta)]/68" : "text-white/75";
              const iconBox = tone === "papel" ? "bg-white text-[var(--lp-azul)]" : "bg-white/12 text-[var(--lp-giz)]";
              return (
                <article
                  key={title}
                  className={`relative overflow-hidden rounded-3xl p-7 ${tones[tone]} ${wide ? "md:col-span-2" : ""}`}
                >
                  {tone !== "papel" && <Spark className="absolute -right-6 -top-6 size-32 text-white/[0.07]" />}
                  <span className={`grid size-11 place-items-center rounded-2xl ${iconBox}`}>
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <h3 className={`${display} mt-6 text-2xl font-bold`}>{title}</h3>
                  <p className={`mt-2 max-w-md text-[15px] leading-relaxed ${muted}`}>{text}</p>
                </article>
              );
            })}
          </div>
        </section>

        {/* Segurança */}
        <section id="seguranca" className="scroll-mt-20 px-4 py-24 sm:px-6">
          <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div className="lg:sticky lg:top-28">
              <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-[var(--lp-azul)]">Segurança e autorização</p>
              <h2 className={`${display} mt-3 text-3xl font-bold leading-[1.1] sm:text-[44px]`}>
                Feita para quem cuida de imagem de criança e adolescente.
              </h2>
              <p className="mt-4 text-[17px] leading-relaxed text-[var(--lp-tinta)]/70">
                A plataforma foi construída em torno da autorização do responsável e das regras do ECA Digital.
                A escola sabe quem autorizou, o que foi enviado e para quem.
              </p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {TRUST.map(({ icon: Icon, text }) => (
                <li key={text} className="flex gap-3.5 rounded-2xl border border-[var(--lp-tinta)]/8 bg-white p-5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--lp-nevoa)] text-[var(--lp-azul)]">
                    <Icon className="size-[18px]" aria-hidden />
                  </span>
                  <p className="text-[14.5px] leading-relaxed text-[var(--lp-tinta)]/80">{text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Para quem */}
        <section className="bg-[var(--lp-nevoa)] px-4 py-24 sm:px-6">
          <SectionTitle eyebrow="Para quem" title="Um fluxo, três pessoas mais tranquilas" />
          <div className="mx-auto mt-14 grid max-w-6xl gap-5 md:grid-cols-3">
            {[
              { icon: CalendarDays, who: "Direção e coordenação", what: "Visão de eventos, entregas e autorizações num só lugar, com registro de tudo." },
              { icon: CloudUpload, who: "Equipe da escola", what: "Sobe o evento inteiro de uma vez e só revisa as sugestões, sem separar foto à mão." },
              { icon: FolderHeart, who: "Famílias", what: "Recebem só as fotos do filho, num link que abre no celular, e baixam quando quiserem." },
            ].map(({ icon: Icon, who, what }) => (
              <div key={who} className="rounded-3xl bg-white p-7">
                <Icon className="size-6 text-[var(--lp-faisca)]" aria-hidden />
                <h3 className={`${display} mt-5 text-xl font-bold`}>{who}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-[var(--lp-tinta)]/68">{what}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Perguntas */}
        <section id="perguntas" className="scroll-mt-20 px-4 py-24 sm:px-6">
          <SectionTitle eyebrow="Perguntas frequentes" title="O que as escolas costumam perguntar" />
          <div className="mx-auto mt-12 max-w-3xl divide-y divide-[var(--lp-tinta)]/10 rounded-3xl border border-[var(--lp-tinta)]/8 bg-white">
            {FAQ.map(({ q, a }) => (
              <details key={q} className="group px-6 py-5 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-[16px] font-semibold">
                  {q}
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--lp-nevoa)] text-[var(--lp-azul)] transition group-open:rotate-45">
                    <span aria-hidden className="text-lg leading-none">+</span>
                  </span>
                </summary>
                <p className="mt-3 pr-10 text-[15px] leading-relaxed text-[var(--lp-tinta)]/70">{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA final */}
        <section className="px-4 pb-24 sm:px-6">
          <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[32px] bg-[var(--lp-azul)] px-6 py-16 text-center text-white sm:px-12">
            <Spark className="absolute -left-10 -top-10 size-48 text-white/[0.08]" />
            <Spark className="absolute -bottom-12 -right-6 size-56 text-[var(--lp-giz)]/25" />
            <h2 className={`${display} relative mx-auto max-w-2xl text-3xl font-extrabold leading-tight sm:text-5xl`}>
              Leve o próximo evento da sua escola para a {iaschool.brand.name}.
            </h2>
            <p className="relative mx-auto mt-4 max-w-xl text-[17px] text-white/80">
              {cta.kind === "demo"
                ? "Mostramos o fluxo completo com material de demonstração, do upload ao álbum da família."
                : "Sua escola já tem acesso? Entre e crie o primeiro evento."}
            </p>
            <div className="relative mt-8 flex justify-center">
              <PrimaryCta />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--lp-tinta)]/8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-[13px] text-[var(--lp-tinta)]/55 sm:flex-row sm:px-6">
          <img src="/brand/aiescola-logo.svg" alt={iaschool.brand.name} className="h-6 w-auto opacity-80" />
          <p>© {year} {iaschool.brand.name}. Fotos da escola, entregues a cada família.</p>
          <Link href="/entrar" className="font-semibold text-[var(--lp-tinta)]/70 hover:text-[var(--lp-tinta)]">
            Acesso da escola
          </Link>
        </div>
      </footer>
    </div>
  );
}
