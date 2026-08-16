#!/bin/sh
# Arranque del contenedor: prepara la base de datos antes de levantar la app.
#
#  1. Se asegura de que existe el directorio del volumen persistente.
#  2. Aplica el esquema (crea las tablas la primera vez; después no hace nada).
#  3. Siembra los datos de ejemplo SOLO si la base de datos está vacía, para no
#     pisar nunca datos reales en un redespliegue.
set -e

echo "→ Base de datos: ${DATABASE_URL}"

# Extrae la ruta del fichero de un DATABASE_URL del tipo "file:/data/app.db"
# para poder crear su directorio si aún no existe.
DB_PATH=$(printf '%s' "${DATABASE_URL}" | sed -n 's/^file://p')
if [ -n "$DB_PATH" ]; then
  DB_DIR=$(dirname "$DB_PATH")
  mkdir -p "$DB_DIR"

  # Comprobación real de escritura: el test -w no sirve, porque el contenedor
  # corre como root y root ignora los permisos del directorio. Crear un fichero
  # sí detecta un sistema de ficheros de solo lectura.
  if ! touch "$DB_DIR/.write-test" 2>/dev/null; then
    echo "✗ No se puede escribir en $DB_DIR. Revisa el volumen persistente." >&2
    exit 1
  fi
  rm -f "$DB_DIR/.write-test"

  # Aviso ante el fallo silencioso más peligroso: si no hay ningún volumen
  # montado, el directorio vive en la capa de escritura del contenedor, la
  # aplicación arranca con normalidad y los datos desaparecen en el siguiente
  # redespliegue. Comparar el dispositivo con el de "/" lo delata.
  if [ "$(stat -c %d "$DB_DIR" 2>/dev/null)" = "$(stat -c %d / 2>/dev/null)" ]; then
    echo "⚠  ATENCIÓN: $DB_DIR no parece ser un volumen persistente montado." >&2
    echo "⚠  La base de datos se perderá en el próximo redespliegue." >&2
    echo "⚠  Monta un volumen en $DB_DIR antes de usar esto en producción." >&2
  fi
fi

echo "→ Aplicando el esquema de la base de datos..."
npx prisma db push --skip-generate

if [ "${SEED_ON_FIRST_RUN:-true}" = "true" ]; then
  if [ "$(node scripts/needs-seed.mjs)" = "yes" ]; then
    echo "→ Base de datos vacía: sembrando datos de ejemplo..."
    npx tsx prisma/seed.ts
  else
    echo "→ La base de datos ya tiene datos: no se siembra nada."
  fi
fi

echo "→ Arrancando la aplicación en el puerto ${PORT}..."
exec "$@"
