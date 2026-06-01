FROM node:24-slim

RUN npm install -g pnpm@10

WORKDIR /app
COPY . .

RUN pnpm install --frozen-lockfile

RUN pnpm --filter @workspace/api-server run build

ENV NODE_ENV=production

COPY start.sh /start.sh
RUN chmod +x /start.sh

CMD ["/start.sh"]
