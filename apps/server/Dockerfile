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
COPY apps/server/package.json ./
RUN npm install --omit=dev --ignore-scripts fastify @fastify/jwt @fastify/rate-limit pg zod
COPY --from=build /repo/apps/server/dist ./dist
USER node
EXPOSE 8080
CMD ["node", "dist/main.js"]
