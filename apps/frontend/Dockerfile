FROM oven/bun:1.3-alpine AS build

WORKDIR /app

COPY package.json bun.lock ./
COPY apps/main-service/package.json ./apps/main-service/
COPY apps/frontend/package.json ./apps/frontend/
COPY packages/contracts/package.json ./packages/contracts/
COPY db/package.json ./db/

RUN bun install --frozen-lockfile

COPY packages ./packages
COPY apps/frontend ./apps/frontend

RUN bun run --cwd apps/frontend build

FROM nginx:alpine AS serve

COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/frontend/dist /usr/share/nginx/html

EXPOSE 80
