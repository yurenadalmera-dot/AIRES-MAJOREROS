import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import {
  revisarVolcado,
  resumirImportacion,
  claveDeVivienda,
  seParecen,
} from "@/lib/importacion";
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
  // Los tres fallos posibles se arreglan en sitios distintos, así que hay que
  // poder distinguirlos. Un «no autorizado» a secas obliga a adivinar, y eso
  // es media tarde perdida tocando la credencial que ya estaba bien.
  const cabecera = request.headers.get("authorization");
  const token = tokenDeLaCabecera(cabecera);
  if (!token) {
    // Del valor de la cabecera solo sale la primera palabra: es lo que hace
    // falta para saber qué pasa, y no enseña ningún secreto.
    const empiezaPor = cabecera?.trim().split(/\s+/)[0]?.slice(0, 16);
    return Response.json(
      {
        error: cabecera
          ? `La cabecera Authorization llega, pero su valor empieza por «${empiezaPor}» y tiene que empezar por «Bearer ». En la credencial de n8n, el campo Value va así: Bearer imp_...`
          : "No llega ninguna cabecera Authorization. En la credencial de n8n, el campo Name tiene que decir exactamente «Authorization» (es el nombre de la cabecera, no el nombre de la credencial).",
      },
      { status: 401 }
    );
  }

  const ajustes = await prisma.integrationSettings.findFirst({
    where: { provider: "IMPORT" },
    select: { organizationId: true, apiKeyCifrada: true },
  });
  if (!ajustes) {
    return Response.json(
      { error: "Aquí no hay ningún token generado todavía. Genéralo en Ajustes → «Traerse los datos de Mirador»." },
      { status: 401 }
    );
  }
  if (!tokenCoincide(token, ajustes.apiKeyCifrada)) {
    return Response.json(
      { error: "El token llega bien formado, pero no es el que hay guardado. Genera otro en Ajustes y cópialo entero." },
      { status: 401 }
    );
  }
  const organizationId = ajustes.organizationId;

  let bruto: unknown;
  try {
    bruto = await request.json();
  } catch {
    return Response.json({ error: "El cuerpo no es JSON." }, { status: 400 });
  }

  const volcado = revisarVolcado(bruto);

  // ── Tarifas ─────────────────────────────────────────────────────────
  // Antes que los propietarios, porque cada propietario apunta a la suya.
  const idPorTarifa = new Map<string, string>();
  for (const t of volcado.tarifas) {
    const existente = await prisma.tarifa.findFirst({
      where: { organizationId, name: t.nombre },
      select: { id: true },
    });
    const id = existente
      ? (await prisma.tarifa.update({
          where: { id: existente.id },
          data: { vigenteDesde: t.vigenteDesde, vigenteHasta: t.vigenteHasta },
          select: { id: true },
        })).id
      : (await prisma.tarifa.create({
          data: { organizationId, name: t.nombre, vigenteDesde: t.vigenteDesde, vigenteHasta: t.vigenteHasta },
          select: { id: true },
        })).id;
    idPorTarifa.set(t.ref, id);

    for (const l of t.lineas) {
      await prisma.tarifaLinea.upsert({
        where: { tarifaId_servicio: { tarifaId: id, servicio: l.servicio } },
        update: { base: l.base, huespedesIncluidos: l.huespedesIncluidos, porHuespedAdicional: l.porHuespedAdicional },
        create: {
          tarifaId: id,
          servicio: l.servicio,
          base: l.base,
          huespedesIncluidos: l.huespedesIncluidos,
          porHuespedAdicional: l.porHuespedAdicional,
        },
      });
    }
  }

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
      tarifaId: p.tarifaRef ? (idPorTarifa.get(p.tarifaRef) ?? null) : null,
    };
    const id = existente
      ? (await prisma.owner.update({ where: { id: existente.id }, data: datos, select: { id: true } })).id
      : (await prisma.owner.create({ data: { organizationId, name: p.nombre, ...datos }, select: { id: true } })).id;
    idPorPropietario.set(p.ref, id);

    // Los tramos de cuota se reemplazan enteros: el volcado es la lista
    // completa, y conservar tramos viejos que ya no vienen dejaría cobrando
    // una cuota que alguien quitó. Solo se tocan si el volcado trae alguno.
    const cuotas = volcado.cuotas.get(p.ref);
    if (cuotas && cuotas.length > 0) {
      await prisma.cuotaFija.deleteMany({ where: { ownerId: id } });
      for (const c of cuotas) {
        await prisma.cuotaFija.create({
          data: { ownerId: id, importe: c.importe, desde: c.desde, hasta: c.hasta },
        });
      }
      // La vigente hoy, que es la que se enseña en Ajustes.
      const vigente = cuotas
        .filter((c) => c.desde <= new Date() && (c.hasta === null || c.hasta >= new Date()))
        .sort((a, b) => b.desde.getTime() - a.desde.getTime())[0];
      await prisma.owner.update({
        where: { id },
        data: {
          monthlyFee: vigente?.importe ?? null,
          monthlyFeeDesde: vigente?.desde ?? null,
        },
      });
    }
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
  // Emparejar bien aquí es lo que evita el problema gordo: una vivienda
  // duplicada parte en dos el histórico de reservas de un apartamento, y no se
  // nota hasta que un informe sale a la mitad.
  //
  // Tres intentos, de lo más fiable a lo menos:
  //   1. El identificador de Lodgify, que es el único que no cambia.
  //   2. El nombre, **normalizado**, entre las que todavía no tienen
  //      identificador: son las dadas de alta a mano, y lo que toca es
  //      adoptarlas —ponerles el identificador— y no crear otra al lado.
  //   3. El nombre a secas, cuando el volcado no trae identificador.
  //
  // Lo que no se hace nunca es robarle el identificador a una vivienda que ya
  // tiene otro: dos apartamentos pueden llamarse igual, y ahí el duplicado es
  // real.
  const deLaCasa = await prisma.property.findMany({
    where: { organizationId },
    select: { id: true, name: true, lodgifyPropertyId: true },
  });
  const porLodgify = new Map(
    deLaCasa.filter((p) => p.lodgifyPropertyId).map((p) => [p.lodgifyPropertyId as string, p])
  );
  const sinLodgifyPorNombre = new Map(
    deLaCasa.filter((p) => !p.lodgifyPropertyId).map((p) => [claveDeVivienda(p.name), p])
  );
  const porNombre = new Map(deLaCasa.map((p) => [claveDeVivienda(p.name), p]));

  const idPorVivienda = new Map<string, string>();
  let adoptadas = 0;
  for (const x of volcado.viviendas) {
    let existente: { id: string } | null = null;
    if (x.lodgifyId) {
      existente = porLodgify.get(x.lodgifyId) ?? null;
      if (!existente) {
        const aMano = sinLodgifyPorNombre.get(claveDeVivienda(x.nombre));
        if (aMano) {
          existente = aMano;
          adoptadas++;
          // Se saca de las adoptables para que dos viviendas del volcado con
          // el mismo nombre no acaben las dos sobre la misma ficha.
          sinLodgifyPorNombre.delete(claveDeVivienda(x.nombre));
        }
      }
    } else {
      existente = porNombre.get(claveDeVivienda(x.nombre)) ?? null;
    }

    const datos = {
      name: x.nombre,
      ownerId: x.propietarioRef ? (idPorPropietario.get(x.propietarioRef) ?? null) : null,
      groupId: x.grupoRef ? (idPorGrupo.get(x.grupoRef) ?? null) : null,
      active: x.activa ?? true,
      ...(x.plazas ? { capacity: x.plazas } : {}),
      ...(x.lodgifyId ? { lodgifyPropertyId: x.lodgifyId } : {}),
    };
    // Antes de crear una nueva: ¿no será la de al lado escrita de otra forma?
    // «Beach & Ocean» y «Beachs & Ocean» son el mismo apartamento en dos
    // papeles distintos. Unirlas solo sería peligroso —dos pisos pueden
    // llamarse casi igual y se mezclarían dos históricos—, así que se avisa.
    if (!existente) {
      for (const [, candidata] of sinLodgifyPorNombre) {
        if (seParecen(candidata.name, x.nombre)) {
          volcado.avisos.push({
            que: `vivienda ${x.nombre}`,
            porque: `entra como nueva, pero ya había «${candidata.name}» sin identificador de Lodgify. Si son la misma, únelas antes de sincronizar o saldrán dos y las reservas se repartirán entre las dos.`,
          });
          break;
        }
      }
    }

    const id = existente
      ? (await prisma.property.update({ where: { id: existente.id }, data: datos, select: { id: true } })).id
      : (await prisma.property.create({ data: { organizationId, locality: "Fuerteventura", ...datos }, select: { id: true } })).id;
    idPorVivienda.set(x.ref, id);
    // Para que la siguiente del volcado la encuentre sin volver a la base.
    if (x.lodgifyId) porLodgify.set(x.lodgifyId, { id, name: x.nombre, lodgifyPropertyId: x.lodgifyId });
    porNombre.set(claveDeVivienda(x.nombre), { id, name: x.nombre, lodgifyPropertyId: x.lodgifyId ?? null });
  }

  // ── Precios cerrados ────────────────────────────────────────────────
  for (const pc of volcado.preciosCerrados) {
    const propertyId = idPorVivienda.get(pc.viviendaRef);
    if (!propertyId) continue;
    await prisma.tarifaVivienda.upsert({
      where: { propertyId_servicio: { propertyId, servicio: pc.servicio } },
      update: { precioCerrado: pc.precio },
      create: { propertyId, servicio: pc.servicio, precioCerrado: pc.precio },
    });
  }

  // ── Comisiones de canal ─────────────────────────────────────────────
  // Después de las viviendas, porque las de un solo apartamento cuelgan de
  // una. Van antes que nada de reservas: si se sincroniza Lodgify con las
  // comisiones a medio poner, cada reserva entra con el porcentaje que no es
  // y hay que rehacerlas.
  for (const c of volcado.comisiones) {
    const propertyId = c.viviendaRef ? (idPorVivienda.get(c.viviendaRef) ?? null) : null;
    if (c.viviendaRef && !propertyId) continue;

    const datos = {
      platformPct: c.platformPct,
      bankPct: c.bankPct,
      confirmado: c.confirmado,
      nota: c.nota,
    };
    const existente = await prisma.channelCommission.findFirst({
      where: { organizationId, channel: c.canal, propertyId },
      select: { id: true },
    });
    if (existente) {
      await prisma.channelCommission.update({ where: { id: existente.id }, data: datos });
    } else {
      await prisma.channelCommission.create({
        data: { organizationId, channel: c.canal, propertyId, ...datos },
      });
    }
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
  revalidatePath("/rental/settings");

  return Response.json({
    ok: true,
    propietarios: volcado.propietarios.length,
    grupos: volcado.grupos.length,
    viviendas: volcado.viviendas.length,
    // Cuántas fichas que estaban a mano se han emparejado con su listing de
    // Lodgify en vez de crear una segunda vivienda al lado.
    viviendasAdoptadas: adoptadas,
    tarifas: volcado.tarifas.length,
    preciosCerrados: volcado.preciosCerrados.length,
    comisiones: volcado.comisiones.length,
    movimientos: resumen,
    rechazados: volcado.rechazados,
    avisos: volcado.avisos,
  });
}
