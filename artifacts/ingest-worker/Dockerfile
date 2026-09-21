# ingest-worker — Node 24 + sharp (spec §11). Contexto de build = raiz do
# repositório (o lockfile e o workspace ficam lá):
#   docker build -f artifacts/ingest-worker/Dockerfile -t iaschool-ingest-worker .
# Molde do Dockerfile do api-server (raiz), com usuário sem privilégio e
# HEALTHCHECK, como no scripts/spike-face/Dockerfile.

FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV CI=true
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.base.json ./
COPY artifacts/ingest-worker/package.json artifacts/ingest-worker/package.json
RUN corepack enable && corepack pnpm install --frozen-lockfile --filter @workspace/ingest-worker
COPY artifacts/ingest-worker artifacts/ingest-worker
RUN corepack pnpm --filter @workspace/ingest-worker run build \
 && corepack pnpm --filter @workspace/ingest-worker deploy --prod --legacy /out

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080
RUN groupadd -g 10001 worker && useradd -u 10001 -g worker -m worker
# `pnpm deploy` deixa só o pacote e as dependências de produção (sharp com o
# binário linux-x64 pré-compilado; nada é baixado em runtime).
COPY --from=build --chown=worker:worker /out/node_modules ./node_modules
COPY --from=build --chown=worker:worker /out/dist ./dist
COPY --from=build --chown=worker:worker /out/package.json ./package.json
USER worker
EXPOSE 8080
# bookworm-slim não tem curl: o próprio Node consulta o /health.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "dist/index.mjs"]
