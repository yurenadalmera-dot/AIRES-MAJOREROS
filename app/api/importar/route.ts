import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { revisarVolcado, resumirImportacion } from "@/lib/importacion";
import { tokenCoincide, tokenDeLaCabecera } from "@/lib/token-importacion";

/**
 * Por donde entran los datos de Mirador.
 *
 * No lleva sesión de usuario porque quien llama es un workflow de n8n, no una
 * persona: se autentica con un token de escritura que se genera en Ajustes.
 * Ese token es lo único que hace falta proteger, y por eso aquí solo se
 * guarda su huella.
 *
 * Es **idempotente**: cada apunte se reconoce por su huella de origen, así
 * que se puede ejecutar las veces que haga falta hasta que cuadre. Y dice
 * siempre qué ha hecho — cuántos nuevos, cuántos ya estaban y qué ha
 * rechazado, con el motivo.
 */
export async function POST(request: Request) {
  const token = tokenDeLaCabecera(request.headers.get("authorization"));
  if (!token) {
    return Response.json({ error: "Falta el token." }, { status: 401 });
  }

  const ajustes = await prisma.integrationSettings.findFirst({
    where: { provider: "IMPORT" },
    select: { organizationId: true, apiKeyCifrada: true },
  });
  if (!ajustes || !tokenCoincide(token, ajustes.apiKeyCifrada)) {
    return Response.json({ error: "El token no vale." }, { status: 401 });
  }
  const organizationId = ajustes.organizationId;

  let bruto: unknown;
  try {
    bruto = await request.json();
  } catch {
    return Response.json({ error: "El cuerpo no es JSON." }, { status: 400 });
  }

  const volcado = revisarVolcado(bruto);

  // ── Propietarios ────────────────────────────────────────────────────
  // Se reconocen por el nombre: es lo estable entre los dos sistemas, y no
  // obliga a añadir una columna de referencia externa que solo serviría para
  // esto.
  const idPorPropietario = new Map<string, string>();
  for (const p of volcado.propietarios) {
    const existente = await prisma.owner.findFirst({
      where: { organizationId, name: p.nombre },
      select: { id: true },
    });
    const datos = {
      taxId: p.cif ?? null,
      address: p.direccion ?? null,
      email: p.email ?? null,
      ...(p.cuotaFija !== undefined && p.cuotaFija !== null ? { monthlyFee: p.cuotaFija } : {}),
    };
    const id = existente
      ? (await prisma.owner.update({ where: { id: existente.id }, data: datos, select: { id: true } })).id
      : (await prisma.owner.create({ data: { organizationId, name: p.nombre, ...datos }, select: { id: true } })).id;
    idPorPropietario.set(p.ref, id);
  }

  // ── Grupos ──────────────────────────────────────────────────────────
  const idPorGrupo = new Map<string, string>();
  for (const g of volcado.grupos) {
    const ownerId = idPorPropietario.get(g.propietarioRef);
    if (!ownerId) continue;
    const existente = await prisma.propertyGroup.findFirst({
      where: { organizationId, ownerId, name: g.nombre },
      select: { id: true },
    });
    const pct = g.managementPct ?? null;
    const id = existente
      ? (await prisma.propertyGroup.update({ where: { id: existente.id }, data: { managementPct: pct }, select: { id: true } })).id
      : (await prisma.propertyGroup.create({ data: { organizationId, ownerId, name: g.nombre, managementPct: pct }, select: { id: true } })).id;
    idPorGrupo.set(g.ref, id);
  }

  // ── Viviendas ───────────────────────────────────────────────────────
  // Primero por su identificador de Lodgify, que es el que no cambia; si no
  // lo tiene, por el nombre.
  const idPorVivienda = new Map<string, string>();
  for (const x of volcado.viviendas) {
    const existente = x.lodgifyId
      ? await prisma.property.findFirst({ where: { organizationId, lodgifyPropertyId: x.lodgifyId }, select: { id: true } })
      : await prisma.property.findFirst({ where: { organizationId, name: x.nombre }, select: { id: true } });

    const datos = {
      name: x.nombre,
      ownerId: x.propietarioRef ? (idPorPropietario.get(x.propietarioRef) ?? null) : null,
      groupId: x.grupoRef ? (idPorGrupo.get(x.grupoRef) ?? null) : null,
      active: x.activa ?? true,
      ...(x.plazas ? { capacity: x.plazas } : {}),
      ...(x.lodgifyId ? { lodgifyPropertyId: x.lodgifyId } : {}),
    };
    const id = existente
      ? (await prisma.property.update({ where: { id: existente.id }, data: datos, select: { id: true } })).id
      : (await prisma.property.create({ data: { organizationId, locality: "Fuerteventura", ...datos }, select: { id: true } })).id;
    idPorVivienda.set(x.ref, id);
  }

  // ── Movimientos ─────────────────────────────────────────────────────
  const huellas = volcado.movimientos.map((m) => `mirador:${m.origenHash}`);
  const yaEstaban = new Set(
    (
      await prisma.expense.findMany({
        where: { organizationId, origenHash: { in: huellas } },
        select: { origenHash: true },
      })
    ).map((e) => e.origenHash!)
  );

  for (const m of volcado.movimientos) {
    const huella = `mirador:${m.origenHash}`;
    const propertyId = m.viviendaRef ? (idPorVivienda.get(m.viviendaRef) ?? null) : null;
    const groupId = m.grupoRef ? (idPorGrupo.get(m.grupoRef) ?? null) : null;
    const ownerId = m.propietarioRef ? (idPorPropietario.get(m.propietarioRef) ?? null) : null;

    const datos = {
      propertyId,
      groupId,
      ownerId,
      type: m.tipo,
      reparto: m.reparto,
      origen: "banco",
      revisar: m.revisar,
      date: m.fecha,
      concept: m.concepto,
      supplier: m.proveedor,
      amount: m.importe,
    };

    if (yaEstaban.has(huella)) {
      await prisma.expense.updateMany({ where: { organizationId, origenHash: huella }, data: datos });
    } else {
      await prisma.expense.create({ data: { organizationId, origenHash: huella, ...datos } });
    }
  }

  const resumen = resumirImportacion(
    volcado.movimientos,
    new Set([...yaEstaban].map((h) => h.replace(/^mirador:/, "")))
  );

  revalidatePath("/rental/gastos");
  revalidatePath("/rental/properties");
  revalidatePath("/rental/reports");

  return Response.json({
    ok: true,
    propietarios: volcado.propietarios.length,
    grupos: volcado.grupos.length,
    viviendas: volcado.viviendas.length,
    movimientos: resumen,
    rechazados: volcado.rechazados,
  });
}
