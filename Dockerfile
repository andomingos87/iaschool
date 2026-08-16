FROM node:24-bookworm-slim

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.base.json ./
COPY artifacts/api-server/package.json artifacts/api-server/package.json
COPY lib/api-zod/package.json lib/api-zod/package.json
COPY lib/db/package.json lib/db/package.json

RUN corepack enable && pnpm install --frozen-lockfile

COPY artifacts/api-server artifacts/api-server
COPY lib/api-zod lib/api-zod
COPY lib/db lib/db

RUN pnpm --filter @workspace/api-server run build

ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
