FROM node:24-slim

RUN npm install -g pnpm@10

WORKDIR /app
COPY . .

RUN pnpm install --frozen-lockfile

RUN pnpm --filter @workspace/db run generate 2>/dev/null || true
RUN pnpm --filter @workspace/api-server run build

WORKDIR /app/artifacts/api-server

ENV NODE_ENV=production

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
