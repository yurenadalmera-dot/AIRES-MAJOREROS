import { prisma } from "./prisma";

/**
 * Las cuentas del equipo, creadas al arrancar.
 *
 * No se pueden dar de alta desde fuera: la base de datos solo acepta
 * conexiones desde el propio servidor de hosting, así que la única vía para
 * crear estas cuentas sin estar delante de la aplicación es el arranque, igual
 * que la de administración.
 *
 * Aquí va el **hash** de la contraseña, nunca la contraseña. El hash no sirve
 * para entrar: se generó fuera y la contraseña se entregó a cada persona por
 * otro canal. Es exactamente lo que hace una siembra de datos de toda la vida.
 *
 * Solo se crea lo que falta. Una cuenta que ya existe no se toca: ni la
 * contraseña, ni el rol, ni si está activa. Así, cuando cada persona cambie la
 * suya desde «Mi cuenta», esto no se la revierte, y desactivar a alguien no se
 * deshace en el siguiente despliegue.
 *
 * Cuando todo el mundo haya entrado y cambiado su contraseña, esta lista puede
 * vaciarse: ya no hace nada. Se deja porque también recrea las cuentas si
 * algún día hubiera que levantar la base de datos desde cero.
 */
export const ALTAS_INICIALES: {
  name: string;
  email: string;
  role: string;
  passwordHash: string;
}[] = [
  {
    name: "Emma",
    email: "emma@airesmajoreros.pro",
    role: "RENTAL_MANAGER",
    passwordHash: "$2a$10$l1dck/t7fNZKe7q5LIJ0H.FjDBd5QC8XiQP..IX0Qa/3M6iRUahxO",
  },
  {
    name: "Alejandra",
    email: "alejandra@airesmajoreros.pro",
    role: "PARTNER",
    passwordHash: "$2a$10$jYbGjwzjwl3uh6Rfy1QyLOBdMyOSBDRF8fdwfwergaHeJeanSYWF.",
  },
  {
    name: "Equipo de limpieza",
    email: "limpieza@airesmajoreros.pro",
    role: "STAFF",
    passwordHash: "$2a$10$RdqbfWGJwlF/szrnTWubsOeOPC8xdZNuIjU22Adg89tVGeg1Afpe2",
  },
];

/** Crea las cuentas de `ALTAS_INICIALES` que todavía no existan. */
export async function crearAltasIniciales(altas = ALTAS_INICIALES) {
  if (altas.length === 0) return;

  const org = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
  if (!org) return;

  const correos = altas.map((a) => a.email);
  const existentes = new Set(
    (
      await prisma.user.findMany({
        where: { email: { in: correos } },
        select: { email: true },
      })
    ).map((u) => u.email)
  );

  const pendientes = altas.filter((a) => !existentes.has(a.email));
  if (pendientes.length === 0) {
    console.log(`👥 Equipo: ${altas.length} cuentas, todas ya existían.`);
    return;
  }

  await prisma.user.createMany({
    data: pendientes.map((a) => ({
      organizationId: org.id,
      name: a.name,
      email: a.email,
      passwordHash: a.passwordHash,
      role: a.role,
      active: true,
    })),
    skipDuplicates: true,
  });

  console.log(`👥 Equipo: ${pendientes.length} cuentas creadas — ${pendientes.map((a) => a.email).join(", ")}`);
}
