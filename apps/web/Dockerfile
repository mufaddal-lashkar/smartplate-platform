FROM oven/bun:1.3-alpine AS build

WORKDIR /app

COPY package.json bun.lock ./
COPY apps/main-service/package.json ./apps/main-service/
COPY apps/web/package.json ./apps/web/
COPY packages/contracts/package.json ./packages/contracts/

RUN bun install --frozen-lockfile

COPY packages ./packages
COPY apps/web ./apps/web

RUN bun run --cwd apps/web build

FROM nginx:alpine AS serve

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80
