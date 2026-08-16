# Imagen de producción para desplegar en Easypanel (o cualquier runtime Docker).
#
# La base de datos es SQLite y debe vivir en un volumen persistente montado en
# /data, no dentro del contenedor: de lo contrario cada redespliegue borraría
# todos los datos. Ver DATABASE_URL más abajo y el README.
#
# Se usa Debian slim (no Alpine) porque el motor de Prisma necesita glibc y
# OpenSSL; además el binario se genera y se ejecuta sobre la misma imagen base,
# así que el target "native" de Prisma siempre coincide.

# ---------------------------------------------------------------------------
# Etapa 1: dependencias y compilación
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS builder

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Se copian primero los manifiestos para aprovechar la caché de capas: mientras
# no cambien las dependencias, Docker reutiliza esta capa entre builds.
COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY . .

# `next build` no se conecta a la base de datos, pero Prisma exige que la
# variable exista y tenga un formato válido. Es un valor de compilación
# desechable; en ejecución manda el DATABASE_URL real del entorno.
ENV DATABASE_URL="file:/tmp/build-placeholder.db"
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---------------------------------------------------------------------------
# Etapa 2: imagen de ejecución
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS runner

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# Ruta por defecto de la base de datos, dentro del volumen persistente.
# Easypanel puede sobrescribirla con su propia variable de entorno.
ENV DATABASE_URL="file:/data/app.db"

# Se arrastra node_modules completo (incluye la CLI de Prisma y tsx) porque el
# arranque necesita aplicar el esquema y, la primera vez, sembrar los datos.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.mjs ./next.config.mjs

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# El volumen persistente se monta aquí. Declararlo documenta la intención y
# evita que los datos acaben en la capa de escritura del contenedor.
VOLUME ["/data"]

EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
