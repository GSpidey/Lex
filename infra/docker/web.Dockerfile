FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /app
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/web ./apps/web
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @lex/web build
FROM node:24-alpine
ENV NODE_ENV=production
RUN addgroup -S lex && adduser -S lex -G lex
WORKDIR /app
COPY --from=build --chown=lex:lex /app/apps/web/.next/standalone ./
COPY --from=build --chown=lex:lex /app/apps/web/.next/static ./apps/web/.next/static
USER lex
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
