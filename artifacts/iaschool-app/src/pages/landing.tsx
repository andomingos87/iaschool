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
  Plus,
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
 * Botão primário em Azul Caderno: Faísca com texto branco dá só 3:1.
 */

const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap";

const palette = {
  "--lp-azul": "#2447D6",
  "--lp-azul-escuro": "#1B37AE",
  "--lp-tinta": "#0F1A3D",
  "--lp-faisca": "#F26B1D",
  "--lp-giz": "#FFD25A",
  "--lp-nevoa": "#E6EAF7",
  "--lp-papel": "#F8F6F1",
} as CSSProperties;

const display = "font-[Bricolage_Grotesque,ui-sans-serif,sans-serif] tracking-[-0.02em]";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--lp-azul)]";

const cta = resolveLandingCta(import.meta.env.VITE_DEMO_CONTACT_URL);

function PrimaryCta({ inverse = false }: { inverse?: boolean }) {
  const tone = inverse
    ? "bg-white text-[var(--lp-azul)] shadow-[0_10px_30px_-12px_rgba(15,26,61,0.6)] hover:bg-[var(--lp-giz)] hover:text-[var(--lp-tinta)] focus-visible:outline-white"
    : "bg-[var(--lp-azul)] text-white shadow-[0_10px_28px_-10px_rgba(36,71,214,0.75)] hover:bg-[var(--lp-azul-escuro)]";
  const className = `group inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-[15px] font-semibold transition hover:-translate-y-0.5 motion-reduce:hover:translate-y-0 ${focusRing} ${tone}`;
  const content = (
    <>
      {cta.kind === "demo" ? "Agendar demonstração" : "Acessar a plataforma"}
      <ArrowRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden />
    </>
  );
  if (cta.kind === "login") {
    return (
      <Link href={cta.href} className={className} data-testid="landing-cta">
        {content}
      </Link>
    );
  }
  return (
    <a
      href={cta.href}
      className={className}
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

/* Título de seção alinhado à esquerda, com o texto de apoio ao lado no desktop. */
function SectionHeader({ id, title, children }: { id: string; title: ReactNode; children?: ReactNode }) {
  const heading = (
    <h2 id={id} className={`${display} text-balance text-3xl font-bold leading-[1.08] sm:text-[44px]`}>
      {title}
    </h2>
  );
  if (!children) return <div className="mx-auto max-w-6xl [&>h2]:max-w-3xl">{heading}</div>;
  return (
    <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[1.15fr_0.85fr] lg:items-end lg:gap-16">
      {heading}
      <p className="max-w-xl text-pretty text-[17px] leading-relaxed text-[var(--lp-tinta)]/70 lg:pb-1.5">{children}</p>
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
          <span className="ml-3 truncate text-xs font-medium text-[var(--lp-tinta)]/65">Eventos › Festa junina 2026</span>
        </div>
        <div className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
            <div>
              <p className={`${display} text-lg font-bold text-[var(--lp-tinta)]`}>Festa junina 2026</p>
              <p className="mt-0.5 text-xs text-[var(--lp-tinta)]/65">Educação infantil · 6 turmas</p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-[#E9F7EE] px-2.5 py-1 text-[11px] font-semibold text-[#17803D]">
              <Check className="size-3" aria-hidden /> Separado por aluno
            </span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--lp-nevoa)]">
            <div className="h-full w-[86%] rounded-full bg-[var(--lp-azul)]" />
          </div>
          <div className="mt-1.5 flex justify-between gap-3 text-[11px] text-[var(--lp-tinta)]/65">
            <span>Reconhecimento concluído</span>
            <span className="text-right">Revisão em andamento</span>
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

      <div className="absolute -left-4 top-[38%] hidden w-56 rounded-2xl border border-[var(--lp-tinta)]/10 bg-white p-3.5 shadow-[0_20px_50px_-20px_rgba(15,26,61,0.5)] sm:block lg:-left-6">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-[var(--lp-nevoa)] text-[var(--lp-azul)]">
            <ScanFace className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-[var(--lp-tinta)]">3 rostos para revisar</p>
            <p className="text-[11px] text-[var(--lp-tinta)]/65">A equipe confirma antes de enviar</p>
          </div>
        </div>
      </div>

      {/* No celular o cartão desce para baixo do painel em vez de cobrir as fotos. */}
      <div className="relative -mt-6 ml-auto mr-3 w-60 rounded-2xl bg-[var(--lp-tinta)] p-4 text-white shadow-[0_24px_60px_-20px_rgba(15,26,61,0.7)] sm:absolute sm:-bottom-6 sm:-right-8 sm:mr-0 sm:mt-0">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/65">Álbum da família</p>
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

/* Fila de revisão ilustrativa: a IA sugere, a equipe confirma. */
const REVIEW_QUEUE = [
  { color: "#FFD25A", file: "IMG_0214", note: "1 aluno sugerido", done: false },
  { color: "#F9A66E", file: "IMG_0215", note: "2 alunos sugeridos", done: true },
  { color: "#7C93F0", file: "IMG_0219", note: "1 aluno sugerido", done: true },
];

function ReviewQueue() {
  return (
    <ul aria-hidden className="mt-8 space-y-2">
      {REVIEW_QUEUE.map(({ color, file, note, done }) => (
        <li key={file} className="flex items-center gap-3 rounded-2xl bg-white/[0.08] p-2.5 pr-3 ring-1 ring-white/10">
          <span className="relative size-11 shrink-0 overflow-hidden rounded-xl" style={{ background: color }}>
            <span className="absolute left-[28%] top-[22%] size-[46%] rounded-full bg-white/40" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold">{file}</span>
            <span className="block truncate text-[12px] text-white/70">{note}</span>
          </span>
          {done ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--lp-giz)] px-2.5 py-1 text-[11px] font-semibold text-[var(--lp-tinta)]">
              <Check className="size-3" /> Confirmado
            </span>
          ) : (
            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-[var(--lp-azul)]">
              <span className="sm:hidden">Pendente</span>
              <span className="hidden sm:inline">Revisão pendente</span>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

const PROBLEMS = [
  ["Horas", "abrindo foto por foto para descobrir quem aparece em cada uma."],
  ["Grupos", "e pastas abertas onde todo mundo vê a foto de todo mundo."],
  ["Dúvida", "sobre quais famílias autorizaram o uso da imagem do filho."],
] as const;

const STEPS = [
  {
    title: "Cadastro e autorização",
    text: "A escola cadastra turmas e alunos. O responsável autoriza o reconhecimento e o recebimento das fotos.",
  },
  {
    title: "Upload do evento",
    text: "Depois da festa, da formatura ou do passeio, a equipe sobe todas as fotos de uma vez.",
  },
  {
    title: "Separação e revisão",
    text: "O reconhecimento facial sugere quem está em cada foto. Uma pessoa da escola confere e confirma.",
  },
  {
    title: "Entrega à família",
    text: "Cada responsável recebe um link com as fotos aprovadas do seu filho, agrupadas por evento.",
  },
];

const LEAD_FEATURE = {
  icon: ScanFace,
  title: "Reconhecimento com revisão humana",
  text: "A IA faz o trabalho pesado de separar milhares de fotos. Nada sai da escola sem alguém conferir.",
};

const FEATURES = [
  {
    icon: FolderHeart,
    title: "Álbum por link",
    text: "Sem aplicativo para instalar. A família abre o link, filtra por evento e baixa tudo em ZIP.",
  },
  {
    icon: Sparkles,
    title: "Artes com IA por aluno",
    text: "Gere artes personalizadas por aluno e turma a partir do modelo da escola, sempre sinalizadas como imagem de IA.",
  },
  {
    icon: Users,
    title: "Turmas e eventos organizados",
    text: "Pasta de cada aluno com o histórico de fotos confirmadas, separadas por evento.",
  },
  {
    icon: History,
    title: "Trilha de auditoria",
    text: "Quem aprovou, o que foi enviado e quando o álbum foi aberto ficam registrados.",
  },
];

const TRUST = [
  { icon: FileCheck2, text: "Autorização do responsável separada por finalidade: reconhecimento e recebimento das fotos." },
  { icon: ShieldCheck, text: "Autorização revogada interrompe o acesso e o uso das referências do aluno." },
  { icon: Link2, text: "Link exclusivo por família, com sessão de prazo curto e possibilidade de revogação pela escola." },
  { icon: UserCheck, text: "Cada família vê só as fotos aprovadas do próprio filho, nunca as de outro aluno." },
  { icon: Sparkles, text: "Toda imagem gerada por IA sai identificada como tal." },
  { icon: History, text: "Registro de aprovações, envios e aberturas para a escola prestar contas." },
];

const AUDIENCES = [
  { icon: CalendarDays, who: "Direção e coordenação", what: "Visão de eventos, entregas e autorizações num só lugar, com registro de tudo." },
  { icon: CloudUpload, who: "Equipe da escola", what: "Sobe o evento inteiro de uma vez e só revisa as sugestões, sem separar foto à mão." },
  { icon: FolderHeart, who: "Famílias", what: "Recebem só as fotos do filho, num link que abre no celular, e baixam quando quiserem." },
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
          <a href="#topo" className={`shrink-0 rounded-md ${focusRing}`} aria-label={`${iaschool.brand.name}, início`}>
            <img src="/brand/aiescola-logo.svg" alt={iaschool.brand.name} className="h-8 w-auto" />
          </a>
          <nav aria-label="Seções" className="hidden items-center gap-8 text-[14px] font-medium text-[var(--lp-tinta)]/70 md:flex">
            <a href="#como-funciona" className={`rounded-sm transition hover:text-[var(--lp-tinta)] ${focusRing}`}>Como funciona</a>
            <a href="#recursos" className={`rounded-sm transition hover:text-[var(--lp-tinta)] ${focusRing}`}>Recursos</a>
            <a href="#seguranca" className={`rounded-sm transition hover:text-[var(--lp-tinta)] ${focusRing}`}>Segurança</a>
            <a href="#perguntas" className={`rounded-sm transition hover:text-[var(--lp-tinta)] ${focusRing}`}>Perguntas</a>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/entrar"
              className={`rounded-full px-4 py-2 text-[14px] font-semibold text-[var(--lp-tinta)] transition hover:bg-[var(--lp-tinta)]/5 ${focusRing}`}
              data-testid="landing-login"
            >
              Entrar
            </Link>
            {cta.kind === "demo" && (
              <a
                href={cta.href}
                {...(cta.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className={`hidden rounded-full bg-[var(--lp-tinta)] px-4 py-2 text-[14px] font-semibold text-white transition hover:bg-[var(--lp-azul)] sm:inline-flex ${focusRing}`}
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
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-10 sm:px-6 sm:pt-14 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:pb-32 lg:pt-24">
            <div>
              <h1 className={`${display} text-[40px] font-extrabold leading-[1.02] sm:text-6xl lg:text-[68px]`}>
                Cada família recebe as fotos{" "}
                <span className="relative whitespace-nowrap text-[var(--lp-azul)]">
                  do seu filho
                  <svg viewBox="0 0 300 16" className="absolute -bottom-2 left-0 h-3 w-full text-[var(--lp-giz)]" preserveAspectRatio="none" aria-hidden>
                    <path d="M3 11 Q 150 1 297 9" stroke="currentColor" strokeWidth="6" strokeLinecap="round" fill="none" />
                  </svg>
                </span>
                .
              </h1>
              <p className="mt-6 max-w-xl text-pretty text-[17px] leading-relaxed text-[var(--lp-tinta)]/72 sm:text-lg">
                A escola sobe as fotos do evento, a {iaschool.brand.name} separa por aluno com reconhecimento
                facial, a equipe confere e cada responsável recebe um álbum só com as fotos do seu filho.
                Sem planilha, sem pasta compartilhada, sem foto no grupo errado.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <PrimaryCta />
                <a
                  href="#como-funciona"
                  className={`inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-[15px] font-semibold text-[var(--lp-tinta)] ring-1 ring-[var(--lp-tinta)]/15 transition hover:bg-white ${focusRing}`}
                >
                  Ver como funciona
                </a>
              </div>
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[14px] text-[var(--lp-tinta)]/70">
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
        <section aria-labelledby="problema-titulo" className="bg-[var(--lp-tinta)] text-white">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 sm:py-20 md:grid-cols-[1fr_1.3fr] md:items-center md:gap-16">
            <h2 id="problema-titulo" className={`${display} text-balance text-3xl font-bold leading-tight sm:text-4xl`}>
              Depois do evento, começa o trabalho que ninguém vê.
            </h2>
            <dl className="divide-y divide-white/12 border-y border-white/12">
              {PROBLEMS.map(([k, v]) => (
                <div key={k} className="grid gap-1 py-5 sm:grid-cols-[8.5rem_1fr] sm:items-baseline sm:gap-6">
                  <dt className={`${display} text-3xl font-bold text-[var(--lp-giz)]`}>{k}</dt>
                  <dd className="text-[15px] leading-relaxed text-white/75">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Como funciona: a sequência importa, por isso os números ficam. */}
        <section id="como-funciona" aria-labelledby="como-funciona-titulo" className="scroll-mt-20 px-4 py-24 sm:px-6">
          <SectionHeader id="como-funciona-titulo" title="Do upload ao álbum da família em quatro passos">
            A escola mantém o controle de cada etapa. A IA faz a parte repetitiva.
          </SectionHeader>
          <ol className="mx-auto mt-14 grid max-w-6xl gap-10 md:grid-cols-4 md:gap-8">
            {STEPS.map(({ title, text }, i) => {
              const last = i === STEPS.length - 1;
              return (
                <li
                  key={title}
                  className={`relative grid grid-cols-[44px_1fr] gap-x-5 md:block ${
                    last
                      ? ""
                      : "after:absolute after:-bottom-7 after:left-[21.5px] after:top-14 after:w-px after:bg-[var(--lp-tinta)]/15 md:after:-right-5 md:after:bottom-auto md:after:left-14 md:after:top-[21.5px] md:after:h-px md:after:w-auto"
                  }`}
                >
                  <span
                    className={`${display} grid size-11 place-items-center rounded-full text-lg font-bold ${
                      last ? "bg-[var(--lp-giz)] text-[var(--lp-tinta)]" : "bg-[var(--lp-azul)] text-white"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <div className="pt-1.5 md:pt-0">
                    <h3 className={`${display} text-xl font-bold md:mt-6`}>{title}</h3>
                    <p className="mt-2 text-[15px] leading-relaxed text-[var(--lp-tinta)]/70">{text}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        {/* Recursos: um destaque e o resto em lista. */}
        <section id="recursos" aria-labelledby="recursos-titulo" className="scroll-mt-20 bg-white px-4 py-24 sm:px-6">
          <SectionHeader id="recursos-titulo" title="Tudo o que a escola precisa para entregar fotos com cuidado" />
          <div className="mx-auto mt-14 grid max-w-6xl gap-12 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-16">
            <article className="relative overflow-hidden rounded-[28px] bg-[var(--lp-azul)] p-7 text-white sm:p-9">
              <Spark className="absolute -right-8 -top-8 size-36 text-white/[0.08]" />
              <span className="grid size-11 place-items-center rounded-2xl bg-white/12 text-[var(--lp-giz)]">
                <LEAD_FEATURE.icon className="size-5" aria-hidden />
              </span>
              <h3 className={`${display} mt-6 text-2xl font-bold sm:text-[28px]`}>{LEAD_FEATURE.title}</h3>
              <p className="mt-2 max-w-md text-[15px] leading-relaxed text-white/80">{LEAD_FEATURE.text}</p>
              <ReviewQueue />
            </article>
            <ul className="divide-y divide-[var(--lp-tinta)]/10 border-y border-[var(--lp-tinta)]/10">
              {FEATURES.map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex gap-4 py-6">
                  <Icon className="mt-1 size-5 shrink-0 text-[var(--lp-azul)]" aria-hidden />
                  <div>
                    <h3 className={`${display} text-xl font-bold`}>{title}</h3>
                    <p className="mt-1.5 text-[15px] leading-relaxed text-[var(--lp-tinta)]/70">{text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Segurança */}
        <section id="seguranca" aria-labelledby="seguranca-titulo" className="scroll-mt-20 px-4 py-24 sm:px-6">
          <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start lg:gap-16">
            <div className="lg:sticky lg:top-28">
              <h2 id="seguranca-titulo" className={`${display} text-balance text-3xl font-bold leading-[1.08] sm:text-[44px]`}>
                Feita para quem cuida de imagem de criança e adolescente.
              </h2>
              <p className="mt-4 max-w-xl text-pretty text-[17px] leading-relaxed text-[var(--lp-tinta)]/70">
                A plataforma foi construída em torno da autorização do responsável e das regras do ECA Digital.
                A escola sabe quem autorizou, o que foi enviado e para quem.
              </p>
            </div>
            <ul className="grid gap-x-10 sm:grid-cols-2">
              {TRUST.map(({ icon: Icon, text }) => (
                <li key={text} className="flex gap-3.5 border-t border-[var(--lp-tinta)]/12 py-5">
                  <Icon className="mt-0.5 size-5 shrink-0 text-[var(--lp-azul)]" aria-hidden />
                  <p className="text-[15px] leading-relaxed text-[var(--lp-tinta)]/80">{text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Para quem */}
        <section aria-labelledby="para-quem-titulo" className="bg-[var(--lp-nevoa)] px-4 py-24 sm:px-6">
          <SectionHeader id="para-quem-titulo" title="Um fluxo, três pessoas mais tranquilas" />
          <div className="mx-auto mt-12 grid max-w-6xl divide-y divide-[var(--lp-tinta)]/8 rounded-[28px] bg-white md:grid-cols-3 md:divide-x md:divide-y-0">
            {AUDIENCES.map(({ icon: Icon, who, what }) => (
              <div key={who} className="p-7 sm:p-8">
                <Icon className="size-6 text-[var(--lp-faisca)]" aria-hidden />
                <h3 className={`${display} mt-5 text-xl font-bold`}>{who}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-[var(--lp-tinta)]/70">{what}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Perguntas */}
        <section id="perguntas" aria-labelledby="perguntas-titulo" className="scroll-mt-20 px-4 py-24 sm:px-6">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
            <h2 id="perguntas-titulo" className={`${display} text-balance text-3xl font-bold leading-[1.08] sm:text-[44px]`}>
              O que as escolas costumam perguntar
            </h2>
            <div className="divide-y divide-[var(--lp-tinta)]/12 border-y border-[var(--lp-tinta)]/12">
              {FAQ.map(({ q, a }) => (
                <details key={q} className="group [&_summary::-webkit-details-marker]:hidden">
                  <summary
                    className={`flex cursor-pointer list-none items-center justify-between gap-4 rounded-md py-5 text-left text-[16px] font-semibold transition hover:text-[var(--lp-azul)] ${focusRing}`}
                  >
                    {q}
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--lp-nevoa)] text-[var(--lp-azul)] transition group-open:rotate-45 motion-reduce:transition-none">
                      <Plus className="size-4" aria-hidden />
                    </span>
                  </summary>
                  <p className="-mt-1 pb-6 pr-12 text-[15px] leading-relaxed text-[var(--lp-tinta)]/70">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CTA final */}
        <section aria-labelledby="cta-titulo" className="px-4 pb-24 sm:px-6">
          <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[32px] bg-[var(--lp-azul)] px-6 py-16 text-center text-white sm:px-12 sm:py-20">
            <Spark className="absolute -left-10 -top-10 size-48 text-white/[0.08]" />
            <Spark className="absolute -bottom-12 -right-6 size-56 text-[var(--lp-giz)]/25" />
            <h2 id="cta-titulo" className={`${display} relative mx-auto max-w-2xl text-balance text-3xl font-extrabold leading-tight sm:text-5xl`}>
              Leve o próximo evento da sua escola para a {iaschool.brand.name}.
            </h2>
            <p className="relative mx-auto mt-4 max-w-xl text-pretty text-[17px] text-white/85">
              {cta.kind === "demo"
                ? "Mostramos o fluxo completo com material de demonstração, do upload ao álbum da família."
                : "Sua escola já tem acesso? Entre e crie o primeiro evento."}
            </p>
            <div className="relative mt-8 flex justify-center">
              <PrimaryCta inverse />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--lp-tinta)]/8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-center text-[13px] text-[var(--lp-tinta)]/70 sm:flex-row sm:px-6 sm:text-left">
          <img src="/brand/aiescola-logo.svg" alt={iaschool.brand.name} className="h-6 w-auto" />
          <p>© {year} {iaschool.brand.name}. Fotos da escola, entregues a cada família.</p>
          <Link href="/entrar" className={`rounded-sm font-semibold text-[var(--lp-tinta)]/75 hover:text-[var(--lp-tinta)] ${focusRing}`}>
            Acesso da escola
          </Link>
        </div>
      </footer>
    </div>
  );
}
