# Stage 1: Dependencies
FROM node:22-alpine AS dependencies

WORKDIR /nexus

COPY package*.json ./

RUN npm ci --omit=dev && \
    npm cache clean --force

# Stage 2: Runtime
FROM node:22-alpine AS runtime

ENV NODE_ENV=production

WORKDIR /nexus

RUN addgroup -g 1001 -S nexusgroup && \
    adduser -S nexususer -u 1001 -G nexusgroup

COPY --from=dependencies /nexus/node_modules ./node_modules
COPY --chown=nexususer:nexusgroup config ./config
COPY --chown=nexususer:nexusgroup database ./database
COPY --chown=nexususer:nexusgroup scripts ./scripts
COPY --chown=nexususer:nexusgroup src ./src
COPY --chown=nexususer:nexusgroup package.json ./

USER nexususer

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health/ready', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "scripts/start-production.js"]
