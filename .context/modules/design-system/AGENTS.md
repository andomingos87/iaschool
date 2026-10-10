# design-system

Tokens, componentes e preview visual do IAschool. A aplicação consome este pacote; não copia componente nem valor.

## Entrada
- Pacote `@workspace/iaschool-ui`.
- Fonte visual: `artifacts/iaschool-ui/tokens.json`.
- Gerados, não editar à mão: `src/index.css`, `src/generated/tokens.tsx`.
- História de componente: `src/preview/demos/`. Registro: `src/preview/registry.tsx`.

## Depende de
- React 19 e Tailwind 4. Não depende do banco nem da API.

## Quem depende
- `app` importa `@workspace/iaschool-ui`.

## Sensível
- Mudar token sem regenerar deixa o CSS e o preview mentindo.
- Componente web novo sem história no preview fica invisível para quem consome o pacote.

## Comandos
- Regenerar tokens: `pnpm --filter @workspace/iaschool-ui run tokens`
- Dev do preview: `pnpm --filter @workspace/iaschool-ui run dev`

## Guias
- `artifacts/iaschool-ui/docs/consuming-web.md`
- `artifacts/iaschool-ui/docs/consuming-expo.md`
- `artifacts/iaschool-ui/docs/migrating-web.md`
- `artifacts/iaschool-ui/docs/migrating-expo.md`
