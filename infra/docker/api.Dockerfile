FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api ./apps/api
COPY packages ./packages
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @lex/database prisma:generate
RUN pnpm --filter @lex/contracts build && pnpm --filter @lex/jurisdictions build && pnpm --filter @lex/database build && pnpm --filter @lex/api build
FROM node:24-alpine
ENV NODE_ENV=production
RUN addgroup -S lex && adduser -S lex -G lex
WORKDIR /app
COPY --from=build --chown=lex:lex /app /app
USER lex
EXPOSE 4000
CMD ["node", "apps/api/dist/main.js"]
