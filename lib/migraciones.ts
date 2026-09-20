/* eslint-disable no-console */
//
// Cambios de esquema sobre una base que ya existe.
//
// `lib/preparar-base.ts` solo sabe crear el esquema desde cero. Para una base
// ya en marcha hace falta esto, porque aquí no hay `prisma migrate`: el build
// no alcanza la base de datos, así que los cambios tienen que aplicarse desde
// la propia aplicación al arrancar.
//
// Cada migración dice cómo saber si hace falta (`haceFalta`) antes de tocar
// nada, así que ejecutarlas mil veces da igual. Y ninguna destruye datos:
// ensanchar una columna es seguro, estrecharla no lo sería.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface Migracion {
  nombre: string;
  haceFalta: () => Promise<boolean>;
  aplicar: () => Promise<void>;
}

/** ¿Sigue esta columna siendo un VARCHAR corto? */
async function esVarchar(tabla: string, columna: string): Promise<boolean> {
  const filas = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*) AS n
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = ${tabla}
      AND column_name = ${columna}
      AND data_type = 'varchar'
  `;
  return Number(filas[0]?.n ?? 0) > 0;
}

// Campos de texto libre que en MySQL nacieron como VARCHAR(191).
//
// 191 caracteres es media línea. El resumen del sync de Lodgify lo pasaba
// siempre que hubiera una reserva sin emparejar, y la sincronización moría con
// «The provided value for the column is too long» después de haber creado ya
// las reservas. Lo mismo le habría pasado a cualquiera que escribiera una nota
// un poco larga en una reserva o en una factura.
const TEXTOS_LIBRES: [string, string][] = [
  ["IntegrationSettings", "lastSyncSummary"],
  ["Booking", "notes"],
  ["CleaningTask", "notes"],
  ["Invoice", "notes"],
  ["Owner", "notes"],
];

/** ¿Falta esta columna en la tabla? */
async function faltaColumna(tabla: string, columna: string): Promise<boolean> {
  const filas = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*) AS n
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = ${tabla}
      AND column_name = ${columna}
  `;
  return Number(filas[0]?.n ?? 0) === 0;
}

const MIGRACIONES: Migracion[] = [
  ...TEXTOS_LIBRES.map(([tabla, columna]) => ({
    nombre: `${tabla}.${columna} → TEXT`,
    haceFalta: () => esVarchar(tabla, columna),
    aplicar: async () => {
      // Nombres de tabla y columna vienen de esta lista, nunca de fuera.
      await prisma.$executeRawUnsafe(`ALTER TABLE \`${tabla}\` MODIFY \`${columna}\` TEXT NULL`);
    },
  })),

  // Donde se guarda la clave de API de Lodgify, cifrada. Antes no se guardaba
  // en ningún sitio: la que se escribía en Ajustes se tiraba, y la
  // sincronización seguía inventándose las reservas sin decir nada.
  {
    nombre: "IntegrationSettings.apiKeyCifrada",
    haceFalta: () => faltaColumna("IntegrationSettings", "apiKeyCifrada"),
    aplicar: async () => {
      await prisma.$executeRawUnsafe(
        "ALTER TABLE `IntegrationSettings` ADD COLUMN `apiKeyCifrada` TEXT NULL"
      );
    },
  },
];

/** Aplica lo que falte. Devuelve cuántas se han aplicado. */
export async function aplicarMigraciones(): Promise<number> {
  let aplicadas = 0;

  for (const m of MIGRACIONES) {
    try {
      if (!(await m.haceFalta())) continue;
      await m.aplicar();
      console.log(`🔧 Migración aplicada: ${m.nombre}`);
      aplicadas++;
    } catch (error) {
      // Una migración que falla no puede impedir que la aplicación arranque.
      console.error(
        `⚠️  No se ha podido aplicar la migración «${m.nombre}»:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  // Decirlo también cuando no hay nada que hacer: en un arranque normal esta
  // línea es la confirmación de que el esquema está al día. Sin ella, «no hay
  // mensaje» tanto puede significar «todo bien» como «no llegó a ejecutarse».
  if (aplicadas === 0) {
    console.log(`🔧 Esquema al día: ${MIGRACIONES.length} migraciones comprobadas, ninguna pendiente.`);
  }

  return aplicadas;
}
