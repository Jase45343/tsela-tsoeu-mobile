# Build from the repository root: docker build -f apps/server/Dockerfile -t bus-ledger-api .
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/server/package.json apps/server/
RUN npm ci --workspace @busledger/server --include-workspace-root --ignore-scripts
COPY packages/core packages/core
COPY apps/server apps/server
RUN npm run build -w @busledger/server

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
# The build bundles the shared core into dist/main.js; only third-party runtime packages are needed here.
RUN echo '{"name":"bus-ledger-api","private":true,"type":"module"}' > package.json \
 && npm install --omit=dev --ignore-scripts fastify@^5.12.5 @fastify/jwt@^10.2.2 @fastify/rate-limit@^10.0.0 pg@^8.23.1 zod@^4.6.5
COPY --from=build /repo/apps/server/dist ./dist
USER node
EXPOSE 8080
CMD ["node", "dist/main.js"]
