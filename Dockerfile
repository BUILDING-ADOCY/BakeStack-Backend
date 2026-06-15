# syntax=docker/dockerfile:1

# ---- Builder: install all deps, generate Prisma client, compile ----
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl

COPY package.json package-lock.json ./
RUN npm ci

COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY prisma ./prisma
COPY src ./src

RUN npm run prisma:generate
RUN npm run build

# ---- Runner: runtime artifacts only, non-root ----
FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
ENV NODE_ENV=production

# node_modules carries the Prisma CLI (migrate deploy) and tsx (db seed) used by
# the migrate/seed compose services, plus @prisma/client for the running app.
COPY package.json package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

RUN addgroup -S app && adduser -S -G app app && chown -R app:app /app
USER app

EXPOSE 3010

CMD ["npm", "run", "start"]
