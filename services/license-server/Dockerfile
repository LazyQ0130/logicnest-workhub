FROM node:24.16.0-bookworm-slim AS base
RUN apt-get update \
  && apt-get install --yes --no-install-recommends openssl

FROM base AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts=false
COPY tsconfig.json vitest.config.ts ./
COPY prisma ./prisma
COPY src ./src
RUN npm run build
RUN npm prune --omit=dev

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN groupadd --system --gid 10001 logicnest \
  && useradd --system --uid 10001 --gid logicnest --home-dir /app --shell /usr/sbin/nologin logicnest
RUN mkdir -p /var/lib/logicnest/catalog \
  && chown -R logicnest:logicnest /var/lib/logicnest
COPY --from=build --chown=logicnest:logicnest /app/package.json ./package.json
COPY --from=build --chown=logicnest:logicnest /app/node_modules ./node_modules
COPY --from=build --chown=logicnest:logicnest /app/dist ./dist
COPY --from=build --chown=logicnest:logicnest /app/prisma ./prisma
USER logicnest
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8787/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node dist/prisma/seed.js && node dist/src/server.js"]
