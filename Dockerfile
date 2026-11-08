FROM node:22-alpine AS builder

WORKDIR /app

# Copy root and package dependency manifests
COPY package.json package-lock.json ./
COPY packages/core-contracts/package.json ./packages/core-contracts/
COPY tools/mcp-servers/package.json ./tools/mcp-servers/
COPY apps/receptor-desktop/package.json ./apps/receptor-desktop/

# Install all dependencies (including devDependencies for tsc)
RUN npm ci

# Copy full source trees
COPY packages/core-contracts/ ./packages/core-contracts/
COPY tools/mcp-servers/ ./tools/mcp-servers/
COPY apps/receptor-desktop/ ./apps/receptor-desktop/

# Build TypeScript contracts and MCP tools
RUN npm run build

# Production runner stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy node_modules and built packages
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/core-contracts ./packages/core-contracts
COPY --from=builder /app/tools/mcp-servers ./tools/mcp-servers
COPY --from=builder /app/apps/receptor-desktop ./apps/receptor-desktop

EXPOSE 3000

USER node

CMD ["node", "apps/receptor-desktop/src/server.js"]
