# ============================================================
# Stage 1: Install dependencies
# ============================================================
FROM node:${NODE_VERSION:-20-alpine} AS deps

ARG NODE_VERSION
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ============================================================
# Stage 2: Production image
# ============================================================
FROM node:${NODE_VERSION:-20-alpine}

ARG APP_USER=node
ARG APP_HOME=/app
ARG PORT=3000
ARG NODE_ENV=production

ENV PORT=${PORT}
ENV NODE_ENV=${NODE_ENV}

WORKDIR ${APP_HOME}

COPY --from=deps /app/node_modules ./node_modules
COPY . .

EXPOSE ${PORT}

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:${PORT}/healthcheck || exit 1

USER ${APP_USER}

CMD ["node", "src/app.js"]
