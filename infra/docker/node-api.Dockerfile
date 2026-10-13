FROM node:24-bookworm-slim AS build
WORKDIR /lex
RUN corepack enable && corepack prepare pnpm@11.16.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/jurisdictions/package.json packages/jurisdictions/package.json
COPY packages/platform-core/package.json packages/platform-core/package.json
COPY apps/node-api/package.json apps/node-api/package.json
RUN pnpm install --frozen-lockfile --filter @lex/node-api...
COPY packages/contracts packages/contracts
COPY packages/jurisdictions packages/jurisdictions
COPY packages/platform-core packages/platform-core
COPY apps/node-api apps/node-api
RUN pnpm --filter @lex/contracts build && pnpm --filter @lex/jurisdictions build && pnpm --filter @lex/platform-core build && pnpm --filter @lex/node-api build
RUN pnpm --filter @lex/node-api --prod deploy --legacy /runtime

FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /runtime/node_modules ./node_modules
COPY --from=build --chown=node:node /lex/apps/node-api/dist ./dist
COPY --from=build --chown=node:node /lex/apps/node-api/migrations ./migrations
USER node
EXPOSE 4000
CMD ["node", "dist/server.mjs"]
