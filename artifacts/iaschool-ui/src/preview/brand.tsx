import { Guidelines } from './parts';

const BASE = import.meta.env.BASE_URL;

function LogoTile({
  src,
  label,
  surface,
}: {
  src: string;
  label: string;
  surface: string;
}) {
  return (
    <figure className="space-y-2">
      <div
        className={`flex h-40 items-center justify-center rounded-xl border p-6 ${surface}`}
      >
        <img src={src} alt={label} className="max-h-full max-w-[220px]" />
      </div>
      <figcaption className="text-sm text-muted-foreground">{label}</figcaption>
    </figure>
  );
}

export function LogoPage() {
  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <p className="max-w-2xl text-sm text-muted-foreground">
          O logotipo destaca as iniciais “IA” em verde neon, remetendo à figura
          de um gráfico — as métricas e dados fornecidos pela plataforma. Por
          isso a cor intensa e marcante fica nas iniciais, enquanto “sport” usa
          o cinza da paleta.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <LogoTile
            src={`${BASE}logo-color.png`}
            label="Principal — iniciais em verde neon"
            surface="bg-[#1c1c1c]"
          />
          <LogoTile
            src={`${BASE}logo-dark.png`}
            label="Monocromático branco — fundos escuros"
            surface="bg-[#2e2e2e]"
          />
          <LogoTile
            src={`${BASE}logo-color.png`}
            label="Principal sobre fundo claro"
            surface="bg-white"
          />
          <LogoTile
            src={`${BASE}logo-light.png`}
            label="Monocromático preto — fundos claros"
            surface="bg-white"
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Uso do logotipo</h2>
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Use a versão principal (iniciais verdes) sempre que possível — é a assinatura da marca.',
            },
            {
              kind: 'do',
              text: 'Sobre fundos escuros, use a versão com “sport” em cinza claro ou branco.',
            },
            {
              kind: 'dont',
              text: 'Não recolorir as iniciais: o verde neon nas letras “IA” é o elemento central da identidade.',
            },
            {
              kind: 'dont',
              text: 'Não aplicar o logotipo colorido sobre fundos verdes — prefira a versão monocromática.',
            },
          ]}
        />
      </section>
    </div>
  );
}
