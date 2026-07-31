FROM oven/bun:1.3-alpine

WORKDIR /app

COPY package.json bun.lock ./
COPY apps/main-service/package.json ./apps/main-service/
COPY apps/frontend/package.json ./apps/frontend/
COPY packages/contracts/package.json ./packages/contracts/

RUN bun install --frozen-lockfile

COPY packages ./packages
COPY apps/main-service ./apps/main-service

ENV PORT=3000
EXPOSE 3000

CMD ["bun", "run", "apps/main-service/src/index.ts"]
