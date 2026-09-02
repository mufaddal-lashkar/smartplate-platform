FROM oven/bun:1.3-alpine

WORKDIR /app

COPY package.json bun.lock ./
COPY apps/main-service/package.json ./apps/main-service/
COPY apps/frontend/package.json ./apps/frontend/
COPY apps/bot-service/package.json ./apps/bot-service/
COPY packages/contracts/package.json ./packages/contracts/
COPY db/package.json ./db/

RUN bun install --frozen-lockfile

COPY packages ./packages
COPY apps/bot-service ./apps/bot-service

ENV PORT=3001
EXPOSE 3001

CMD ["bun", "run", "apps/bot-service/src/index.ts"]
