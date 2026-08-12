import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

const PHRASES = [
  "Analisando a referência...",
  "Aplicando as cores do clube...",
  "Recortando a foto do atleta...",
  "Posicionando as métricas...",
  "Ajustando a tipografia da marca...",
  "Adicionando o brilho final...",
  "Quase lá, preparando o post...",
];

/** Animação de espera durante a geração (frases rotativas em pt-BR). */
export function GenerationLoader() {
  const [phraseIndex, setPhraseIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setPhraseIndex((i) => (i + 1) % PHRASES.length);
    }, 1400);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center gap-8 py-12 text-center">
      <div className="relative flex size-40 items-center justify-center">
        {/* anéis pulsantes */}
        <span className="absolute inline-flex size-40 animate-ping rounded-full bg-primary/10 [animation-duration:2s]" />
        <span className="absolute inline-flex size-28 animate-ping rounded-full bg-primary/20 [animation-duration:2.4s]" />
        <span
          className="absolute size-32 rounded-full border-2 border-primary/40 border-t-primary"
          style={{ animation: "spin 1.1s linear infinite" }}
        />
        <div className="relative flex size-20 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
          <Sparkles className="size-9 animate-pulse" />
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-lg font-bold">Gerando sua imagem</h3>
        <p
          key={phraseIndex}
          className="animate-in fade-in slide-in-from-bottom-1 text-sm text-primary duration-500"
          data-testid="text-generation-phrase"
        >
          {PHRASES[phraseIndex]}
        </p>
      </div>

      {/* barra de progresso indeterminada */}
      <div className="h-1.5 w-64 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full w-1/3 rounded-full bg-primary"
          style={{ animation: "r9-slide 1.6s ease-in-out infinite" }}
        />
      </div>

      <style>{`
        @keyframes r9-slide {
          0% { transform: translateX(-120%); }
          100% { transform: translateX(320%); }
        }
      `}</style>
    </div>
  );
}
