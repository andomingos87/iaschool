# api-server — geração unitária de arte (Express + OpenAI + sharp). Contexto de
# build = raiz do repositório (o lockfile e o workspace ficam lá):
#   fly deploy --remote-only --ha=false
# Mesmo molde do artifacts/ingest-worker/Dockerfile: instala só o api-server e
# as dependências dele, `pnpm deploy` para a imagem final, usuário sem
# privilégio e HEALTHCHECK.

FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV CI=true
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.base.json ./
COPY artifacts/api-server/package.json artifacts/api-server/package.json
COPY lib/api-zod/package.json lib/api-zod/package.json
COPY lib/db/package.json lib/db/package.json
RUN corepack enable && corepack pnpm install --frozen-lockfile --filter "@workspace/api-server..."
COPY artifacts/api-server artifacts/api-server
COPY lib/api-zod lib/api-zod
COPY lib/db lib/db
RUN corepack pnpm --filter @workspace/api-server run build \
 && corepack pnpm --filter @workspace/api-server deploy --prod --legacy /out

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080
RUN groupadd -g 10001 api && useradd -u 10001 -g api -m api
# `pnpm deploy` deixa só o pacote e as dependências de produção (sharp com o
# binário linux-x64 pré-compilado; nada é baixado em runtime).
COPY --from=build --chown=api:api /out/node_modules ./node_modules
COPY --from=build --chown=api:api /out/dist ./dist
COPY --from=build --chown=api:api /out/package.json ./package.json
USER api
EXPOSE 8080
# bookworm-slim não tem curl: o próprio Node consulta o /api/healthz.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "dist/index.mjs"]
