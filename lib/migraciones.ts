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

  // Datos que faltaban para que una factura sea válida: el domicilio fiscal
  // de quien la emite y de quien la recibe, y el impuesto repercutido. Hasta
  // ahora la factura no llevaba ninguno de los tres, así que no servía para
  // mandársela a nadie.
  ...([
    ["Business", "address", "TEXT NULL"],
    ["Business", "taxRate", "DECIMAL(65,30) NOT NULL DEFAULT 7"],
    ["Invoice", "billedToAddress", "TEXT NULL"],
    ["Invoice", "taxRate", "DECIMAL(65,30) NOT NULL DEFAULT 7"],
    ["Invoice", "taxAmount", "DECIMAL(65,30) NOT NULL DEFAULT 0"],
  ] as [string, string, string][]).map(([tabla, columna, tipo]) => ({
    nombre: `${tabla}.${columna}`,
    haceFalta: () => faltaColumna(tabla, columna),
    aplicar: async () => {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE \`${tabla}\` ADD COLUMN \`${columna}\` ${tipo}`
      );
    },
  })),

  // La tabla de comisiones por canal. Antes había un único porcentaje para
  // todo, y no es así: Airbnb se lleva el 15 % y Booking.com el 18 %.
  {
    nombre: "ChannelCommission",
    haceFalta: async () => {
      const filas = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*) AS n FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = 'ChannelCommission'
      `;
      return Number(filas[0]?.n ?? 0) === 0;
    },
    aplicar: async () => {
      await prisma.$executeRawUnsafe(
        "CREATE TABLE `ChannelCommission` (" +
          "`id` VARCHAR(191) NOT NULL," +
          "`organizationId` VARCHAR(191) NOT NULL," +
          "`channel` VARCHAR(191) NOT NULL," +
          "`platformPct` DECIMAL(65, 30) NOT NULL DEFAULT 0," +
          "`createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)," +
          "UNIQUE INDEX `ChannelCommission_organizationId_channel_key`(`organizationId`, `channel`)," +
          "INDEX `ChannelCommission_organizationId_idx`(`organizationId`)," +
          "PRIMARY KEY (`id`)" +
          ") DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
      );
    },
  },

  // La comisión no depende solo del canal: Booking cobra un 17 % a dos de los
  // pisos y un 15 % al resto. Y la bancaria es del canal (1,3 % en Booking,
  // ninguna en Airbnb), no un número único para todo.
  ...([
    ["ChannelCommission", "propertyId", "VARCHAR(191) NULL"],
    ["ChannelCommission", "bankPct", "DECIMAL(65,30) NULL"],
  ] as [string, string, string][]).map(([tabla, columna, tipo]) => ({
    nombre: `${tabla}.${columna}`,
    haceFalta: () => faltaColumna(tabla, columna),
    aplicar: async () => {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE \`${tabla}\` ADD COLUMN \`${columna}\` ${tipo}`
      );
    },
  })),

  // La clave única pasa a incluir la vivienda: sin esto, no se podría tener a
  // la vez «Booking en general» y «Booking en el Apto 27».
  {
    nombre: "ChannelCommission: clave única con la vivienda",
    haceFalta: async () => {
      const filas = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*) AS n FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name = 'ChannelCommission'
          AND index_name = 'ChannelCommission_organizationId_channel_key'
      `;
      return Number(filas[0]?.n ?? 0) > 0;
    },
    aplicar: async () => {
      await prisma.$executeRawUnsafe(
        "ALTER TABLE `ChannelCommission` DROP INDEX `ChannelCommission_organizationId_channel_key`"
      );
      await prisma.$executeRawUnsafe(
        "CREATE UNIQUE INDEX `ChannelCommission_organizationId_channel_propertyId_key` " +
          "ON `ChannelCommission`(`organizationId`, `channel`, `propertyId`)"
      );
      await prisma.$executeRawUnsafe(
        "CREATE INDEX `ChannelCommission_propertyId_idx` ON `ChannelCommission`(`propertyId`)"
      );
    },
  },

  // Comisión de gestión y gastos. La comisión de Aires se calcula sobre lo
  // que queda después de las comisiones de venta y de los gastos, así que sin
  // gastos el número sale siempre alto.
  ...([
    ["Property", "managementPct", "DECIMAL(65,30) NULL"],
    ["Owner", "monthlyFee", "DECIMAL(65,30) NULL"],
    ["Owner", "taxId", "VARCHAR(191) NULL"],
    ["Owner", "address", "TEXT NULL"],
  ] as [string, string, string][]).map(([tabla, columna, tipo]) => ({
    nombre: `${tabla}.${columna}`,
    haceFalta: () => faltaColumna(tabla, columna),
    aplicar: async () => {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE \`${tabla}\` ADD COLUMN \`${columna}\` ${tipo}`
      );
    },
  })),

  // Los grupos de viviendas. Inversiones Brito tiene dos y cobran distinto:
  // Grupo Villa Mónica al 30 % y Villa Monikka al 10 %.
  {
    nombre: "PropertyGroup",
    haceFalta: async () => {
      const filas = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*) AS n FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = 'PropertyGroup'
      `;
      return Number(filas[0]?.n ?? 0) === 0;
    },
    aplicar: async () => {
      await prisma.$executeRawUnsafe("CREATE TABLE `PropertyGroup` ( `id` VARCHAR(191) NOT NULL, `organizationId` VARCHAR(191) NOT NULL, `ownerId` VARCHAR(191) NOT NULL, `name` VARCHAR(191) NOT NULL, `managementPct` DECIMAL(65, 30) NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), INDEX `PropertyGroup_organizationId_idx`(`organizationId`), INDEX `PropertyGroup_ownerId_idx`(`ownerId`), PRIMARY KEY (`id`) ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    },
  },

  {
    nombre: "Property.groupId",
    haceFalta: () => faltaColumna("Property", "groupId"),
    aplicar: async () => {
      await prisma.$executeRawUnsafe("ALTER TABLE `Property` ADD COLUMN `groupId` VARCHAR(191) NULL");
      await prisma.$executeRawUnsafe("CREATE INDEX `Property_groupId_idx` ON `Property`(`groupId`)");
    },
  },

  {
    nombre: "Expense",
    haceFalta: async () => {
      const filas = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*) AS n FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = 'Expense'
      `;
      return Number(filas[0]?.n ?? 0) === 0;
    },
    aplicar: async () => {
      await prisma.$executeRawUnsafe("CREATE TABLE `Expense` ( `id` VARCHAR(191) NOT NULL, `organizationId` VARCHAR(191) NOT NULL, `propertyId` VARCHAR(191) NULL, `ownerId` VARCHAR(191) NULL, `date` DATETIME(3) NOT NULL, `concept` VARCHAR(191) NOT NULL, `supplier` VARCHAR(191) NULL, `amount` DECIMAL(65, 30) NOT NULL DEFAULT 0, `notes` TEXT NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL, INDEX `Expense_organizationId_idx`(`organizationId`), INDEX `Expense_propertyId_idx`(`propertyId`), INDEX `Expense_date_idx`(`date`), PRIMARY KEY (`id`) ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    },
  },

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
  // Donde caen las facturas de gasto que lee la máquina, antes de que nadie
  // las confirme. Nada de lo que devuelve el modelo entra directo en
  // `Expense`: un total mal leído se descontaría en la liquidación de un
  // propietario sin que nadie lo notara.
  {
    nombre: "DocumentoOcr",
    haceFalta: async () => {
      const filas = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*) AS n FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = 'DocumentoOcr'
      `;
      return Number(filas[0]?.n ?? 0) === 0;
    },
    aplicar: async () => {
      await prisma.$executeRawUnsafe("CREATE TABLE `DocumentoOcr` (\n    `id` VARCHAR(191) NOT NULL,\n    `organizationId` VARCHAR(191) NOT NULL,\n    `subidoPorId` VARCHAR(191) NULL,\n    `estado` VARCHAR(191) NOT NULL DEFAULT 'pendiente',\n    `archivoNombre` VARCHAR(191) NOT NULL,\n    `archivoMime` VARCHAR(191) NOT NULL,\n    `archivoBytes` INTEGER NOT NULL,\n    `archivoHash` VARCHAR(191) NOT NULL,\n    `contenido` LONGBLOB NOT NULL,\n    `datosIa` TEXT NULL,\n    `confianzaIa` VARCHAR(191) NULL,\n    `fiabilidad` DECIMAL(65, 30) NULL,\n    `motivos` TEXT NULL,\n    `avisos` TEXT NULL,\n    `datosRevisados` TEXT NULL,\n    `revisadoPorId` VARCHAR(191) NULL,\n    `revisadoEn` DATETIME(3) NULL,\n    `modelo` VARCHAR(191) NULL,\n    `promptVersion` VARCHAR(191) NULL,\n    `tokensEntrada` INTEGER NULL,\n    `tokensSalida` INTEGER NULL,\n    `tokensCache` INTEGER NULL,\n    `errorLectura` TEXT NULL,\n    `expenseId` VARCHAR(191) NULL,\n    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),\n\n    INDEX `DocumentoOcr_organizationId_idx`(`organizationId`),\n    INDEX `DocumentoOcr_estado_idx`(`estado`),\n    INDEX `DocumentoOcr_archivoHash_idx`(`archivoHash`),\n    PRIMARY KEY (`id`)\n) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    },
  },
  // Lo que hacía falta para poder traerse los movimientos de Mirador sin
  // perder nada: un gasto puede ser de un grupo y no de una vivienda, puede
  // ser un sueldo o un traspaso —que no es un gasto y no puede restar en la
  // liquidación—, y puede venir del banco o de una factura leída. `origenHash`
  // impide importar dos veces el mismo apunte.
  {
    nombre: "Expense · movimientos completos",
    haceFalta: () => faltaColumna("Expense", "origenHash"),
    aplicar: async () => {
      for (const sql of [
        "ALTER TABLE `Expense` ADD COLUMN `groupId` VARCHAR(191) NULL",
        "ALTER TABLE `Expense` ADD COLUMN `type` VARCHAR(191) NOT NULL DEFAULT 'gasto'",
        "ALTER TABLE `Expense` ADD COLUMN `reparto` VARCHAR(191) NOT NULL DEFAULT 'directo'",
        "ALTER TABLE `Expense` ADD COLUMN `origen` VARCHAR(191) NULL",
        "ALTER TABLE `Expense` ADD COLUMN `origenHash` VARCHAR(191) NULL",
        "ALTER TABLE `Expense` ADD COLUMN `revisar` TEXT NULL",
        "CREATE UNIQUE INDEX `Expense_origenHash_key` ON `Expense`(`origenHash`)",
        "CREATE INDEX `Expense_groupId_idx` ON `Expense`(`groupId`)",
        "CREATE INDEX `Expense_type_idx` ON `Expense`(`type`)",
        // La fecha pasa a admitir nulos: hay apuntes del banco que llegan sin
        // ella («sin fecha en el fichero»), y perderlos es peor que tenerlos
        // marcados para revisar.
        "ALTER TABLE `Expense` MODIFY `date` DATETIME(3) NULL",
      ]) {
        await prisma.$executeRawUnsafe(sql);
      }
    },
  },
  // Las tarifas de limpieza. Aquí el precio era uno fijo por vivienda; en los
  // datos reales es base más tanto por huésped adicional, y eso cambia el
  // importe: una salida de cuatro huéspedes cuesta 80 € donde una de dos
  // cuesta 60. Con el precio fijo, todas las de cuatro se facturaban de menos.
  {
    nombre: "Tarifas de limpieza",
    haceFalta: async () => {
      const filas = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*) AS n FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = 'Tarifa'
      `;
      return Number(filas[0]?.n ?? 0) === 0;
    },
    aplicar: async () => {
      for (const sql of [
        "CREATE TABLE `Tarifa` (\n    `id` VARCHAR(191) NOT NULL,\n    `organizationId` VARCHAR(191) NOT NULL,\n    `name` VARCHAR(191) NOT NULL,\n    `vigenteDesde` DATETIME(3) NOT NULL,\n    `vigenteHasta` DATETIME(3) NULL,\n    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),\n\n    INDEX `Tarifa_organizationId_idx`(`organizationId`),\n    PRIMARY KEY (`id`)\n) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
        "CREATE TABLE `TarifaLinea` (\n    `id` VARCHAR(191) NOT NULL,\n    `tarifaId` VARCHAR(191) NOT NULL,\n    `servicio` VARCHAR(191) NOT NULL,\n    `base` DECIMAL(65, 30) NOT NULL DEFAULT 0,\n    `huespedesIncluidos` INTEGER NOT NULL DEFAULT 0,\n    `porHuespedAdicional` DECIMAL(65, 30) NOT NULL DEFAULT 0,\n\n    UNIQUE INDEX `TarifaLinea_tarifaId_servicio_key`(`tarifaId`, `servicio`),\n    PRIMARY KEY (`id`)\n) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
        "CREATE TABLE `TarifaVivienda` (\n    `id` VARCHAR(191) NOT NULL,\n    `propertyId` VARCHAR(191) NOT NULL,\n    `servicio` VARCHAR(191) NOT NULL,\n    `precioCerrado` DECIMAL(65, 30) NOT NULL,\n\n    UNIQUE INDEX `TarifaVivienda_propertyId_servicio_key`(`propertyId`, `servicio`),\n    PRIMARY KEY (`id`)\n) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
        "ALTER TABLE `Owner` ADD COLUMN `tarifaId` VARCHAR(191) NULL",
      ]) {
        await prisma.$executeRawUnsafe(sql);
      }
    },
  },
  // Un supuesto y un dato comprobado no valen lo mismo. Mirador traía sus
  // comisiones de canal marcadas «SUPUESTO, pendiente de contrastar con una
  // factura real», y al traerlas aquí esa advertencia no se puede perder: un
  // porcentaje supuesto que nadie distingue del comprobado acaba liquidado.
  // Una cuota fija sin fecha de inicio se cobra desde siempre. La de Academia
  // Cañada empezó el 1 de agosto de 2026, así que un informe de enero a
  // septiembre le cobraba nueve meses donde le tocan dos: 5.400 € en vez de
  // 1.200 €.
  {
    nombre: "Desde cuándo se cobra la cuota fija",
    haceFalta: () => faltaColumna("Owner", "monthlyFeeDesde"),
    aplicar: async () => {
      await prisma.$executeRawUnsafe(
        "ALTER TABLE `Owner` ADD COLUMN `monthlyFeeDesde` DATETIME(3) NULL"
      );
    },
  },
  // La cuota fija no es un número, es una escalera: a Academia Cañada se le
  // empezó cobrando 400 €, luego 500 y luego 600. Con un solo importe, un
  // informe del año entero cobra el último también por los meses en que se
  // cobraba menos.
  {
    nombre: "El histórico de cuotas fijas",
    haceFalta: async () => {
      const filas = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*) AS n FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = 'CuotaFija'
      `;
      return Number(filas[0]?.n ?? 0) === 0;
    },
    aplicar: async () => {
      await prisma.$executeRawUnsafe(
        "CREATE TABLE `CuotaFija` (" +
          "`id` VARCHAR(191) NOT NULL," +
          "`ownerId` VARCHAR(191) NOT NULL," +
          "`importe` DECIMAL(65, 30) NOT NULL," +
          "`desde` DATETIME(3) NOT NULL," +
          "`hasta` DATETIME(3) NULL," +
          "INDEX `CuotaFija_ownerId_idx`(`ownerId`)," +
          "PRIMARY KEY (`id`)" +
          ") DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
      );
      // La cuota que ya hubiera puesta pasa a ser el primer tramo, para que
      // nadie se quede sin cuota por el camino. Sin fecha de inicio se toma
      // el principio de los tiempos: es lo que hacía antes.
      await prisma.$executeRawUnsafe(
        "INSERT INTO `CuotaFija` (`id`, `ownerId`, `importe`, `desde`, `hasta`) " +
          "SELECT CONCAT('cuota-', `id`), `id`, `monthlyFee`, " +
          "COALESCE(`monthlyFeeDesde`, '2000-01-01 12:00:00'), NULL " +
          "FROM `Owner` WHERE `monthlyFee` IS NOT NULL"
      );
    },
  },
  {
    nombre: "De dónde sale cada comisión de canal",
    haceFalta: () => faltaColumna("ChannelCommission", "confirmado"),
    aplicar: async () => {
      for (const sql of [
        "ALTER TABLE `ChannelCommission` ADD COLUMN `confirmado` BOOLEAN NOT NULL DEFAULT true",
        "ALTER TABLE `ChannelCommission` ADD COLUMN `nota` TEXT NULL",
      ]) {
        await prisma.$executeRawUnsafe(sql);
      }
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
