FROM node:22-bookworm-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da AS deps
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts && pnpm rebuild better-sqlite3 esbuild

FROM node:22-bookworm-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da AS prod-deps
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts && pnpm rebuild better-sqlite3

FROM node:22-bookworm-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN DATABASE_URL=postgres://build:build@localhost:5432/build \
  BASE_URL=https://build.invalid \
  CHIBAN_SECRET_KEYS='{"build":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="}' \
  CHIBAN_ACTIVE_KEY_ID=build \
  pnpm build && pnpm build:entrypoints

FROM node:22-bookworm-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl ghostscript ocrmypdf tesseract-ocr tesseract-ocr-eng default-jre-headless unzip \
  && install -d /usr/share/postgresql-common/pgdg \
  && curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc \
  && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends postgresql-client-16 \
  && rm -rf /var/lib/apt/lists/*
COPY docker/verapdf-auto-install.xml /tmp/verapdf-auto-install.xml
RUN curl -fsSL -o /tmp/verapdf.zip https://software.verapdf.org/releases/1.28/verapdf-greenfield-1.28.2-installer.zip \
  && echo "d1693a5f0bf0997180f6d97e8a5568b0cf39e27eee338d439c8adb58435c1e89  /tmp/verapdf.zip" | sha256sum -c - \
  && unzip -q /tmp/verapdf.zip -d /tmp/verapdf-installer \
  && java -jar /tmp/verapdf-installer/verapdf-greenfield-1.28.2/verapdf-izpack-installer-1.28.2.jar /tmp/verapdf-auto-install.xml \
  && /opt/verapdf/verapdf --version \
  && rm -rf /tmp/verapdf.zip /tmp/verapdf-installer /tmp/verapdf-auto-install.xml
ENV VERAPDF_PATH=/opt/verapdf/verapdf
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/drizzle ./drizzle
COPY --from=build --chown=node:node /app/src/features/pdf/fonts ./src/features/pdf/fonts
COPY --from=build --chown=node:node /app/src/constants/anonymousRoutes.ts ./src/constants/anonymousRoutes.ts
COPY --from=build --chown=node:node /app/src/lib/uploadLimits.ts ./src/lib/uploadLimits.ts
COPY --from=build --chown=node:node /app/package.json /app/next.config.ts ./
USER node
EXPOSE 3000
CMD ["node_modules/.bin/next", "start"]

FROM runtime AS migrate-tools
