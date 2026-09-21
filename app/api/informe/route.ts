import { prisma } from "@/lib/prisma";
import { informeDePropietario } from "@/lib/informe-propietario";
import { tokenCoincide, tokenDeLaCabecera } from "@/lib/token-importacion";

/**
 * Los informes de un periodo, para que alguien los mande.
 *
 * El SaaS tiene los datos y sabe calcularlos; lo que no tiene es por dónde
 * sacar un correo. Eso lo hace n8n, que sí: aquí pide los números, los
 * convierte en PDF y los envía. Antes ese mismo envío leía de Airtable, donde
 * no están ni los gastos ni las comisiones contrastadas, y por eso el informe
 * de los viernes llevaba meses saliendo incompleto.
 *
 * Se autentica con el mismo token de escritura que `/api/importar`, del que
 * aquí solo se guarda la huella.
 *
 *   GET  /api/informe?start=2026-09-01&end=2026-09-30[&ownerId=...]
 *   POST /api/informe   { ownerId, start, end, destinatario, medio, nota }
 *        — deja constancia de que se ha enviado.
 */

async function organizacionDelToken(request: Request): Promise<string | Response> {
  const token = tokenDeLaCabecera(request.headers.get("authorization"));
  if (!token) {
    return Response.json(
      { error: "Falta la cabecera Authorization con «Bearer imp_…»." },
      { status: 401 }
    );
  }
  const ajustes = await prisma.integrationSettings.findFirst({
    where: { provider: "IMPORT" },
    select: { organizationId: true, apiKeyCifrada: true },
  });
  if (!ajustes) {
    return Response.json({ error: "No hay ningún token generado. Genéralo en Ajustes." }, { status: 401 });
  }
  if (!tokenCoincide(token, ajustes.apiKeyCifrada)) {
    return Response.json({ error: "Ese token no es el que hay guardado." }, { status: 401 });
  }
  return ajustes.organizationId;
}

export async function GET(request: Request) {
  const org = await organizacionDelToken(request);
  if (typeof org !== "string") return org;

  const url = new URL(request.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  if (!start || !end) {
    return Response.json({ error: "Faltan «start» y «end» (aaaa-mm-dd)." }, { status: 400 });
  }
  const soloEste = url.searchParams.get("ownerId");

  const propietarios = await prisma.owner.findMany({
    where: { organizationId: org, ...(soloEste ? { id: soloEste } : {}) },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });

  const informes = [];
  for (const p of propietarios) {
    const d = await informeDePropietario({ organizationId: org, ownerId: p.id, start, end });
    if (!d) continue;

    // Un propietario sin movimiento en el periodo no necesita informe. Mandar
    // un correo con todo a cero cada viernes es la mejor forma de que dejen de
    // abrirlos.
    const vacio = d.bookings.length === 0 && d.cleaningTasks.length === 0 && d.expenses.length === 0;

    informes.push({
      propietario: { id: p.id, nombre: p.name, email: p.email },
      periodo: { desde: start, hasta: end },
      vacio,
      cabecera: d.cabecera,
      totales: {
        ingresos: d.totals.total,
        comisionesDeVenta: d.totals.platform + d.totals.bank,
        aPercibir: d.totals.net,
        limpiezas: d.cleaningTotal,
        otrosGastos: d.expensesTotal,
        baseDeGestion: d.liquidacion.baseDeGestion,
        comisionDeGestion: d.liquidacion.comisionDeGestion,
        aLiquidar: d.liquidacion.alPropietario,
      },
      cuotaFija: d.cuotaFija,
      comisionPorGrupo: d.liquidacion.tramos.map((t) => ({
        grupo: t.nombre,
        porcentaje: t.managementPct,
        ingresos: t.ingresos,
        comisionesDeVenta: t.comisionesDeVenta,
        gastos: t.gastos,
        base: t.baseDeGestion,
        comision: t.comisionDeGestion,
      })),
      reservasPorGrupo: d.gruposDeReservas.map(([, g]) => ({
        grupo: g.nombre,
        reservas: g.reservas.map((b) => ({
          vivienda: b.property.name,
          huesped: b.guestName,
          entrada: b.checkIn.toISOString().slice(0, 10),
          salida: b.checkOut.toISOString().slice(0, 10),
          canal: b.channel,
          total: Number(b.totalPrice),
          comisionPlataforma: Number(b.platformCommissionAmt),
          comisionBanco: Number(b.bankCommissionAmt),
          neto: Number(b.netAmount),
        })),
      })),
      limpiezas: d.cleaningTasks.map((t) => ({
        vivienda: t.property.name,
        fecha: t.date.toISOString().slice(0, 10),
        servicio: t.servicio ?? "salida",
        huespedes: t.huespedes,
        importe: Number(t.price),
      })),
      gastos: d.expenses.map((g) => ({
        vivienda: g.property?.name ?? null,
        fecha: g.date ? g.date.toISOString().slice(0, 10) : null,
        concepto: g.concept,
        proveedor: g.supplier,
        importe: Number(g.amount),
      })),
    });
  }

  return Response.json({ ok: true, periodo: { desde: start, hasta: end }, informes });
}

export async function POST(request: Request) {
  const org = await organizacionDelToken(request);
  if (typeof org !== "string") return org;

  const cuerpo = (await request.json().catch(() => null)) as {
    ownerId?: string;
    start?: string;
    end?: string;
    destinatario?: string;
    medio?: string;
    nota?: string;
  } | null;

  if (!cuerpo?.ownerId || !cuerpo.start || !cuerpo.end) {
    return Response.json({ error: "Faltan «ownerId», «start» y «end»." }, { status: 400 });
  }

  const propietario = await prisma.owner.findFirst({
    where: { id: cuerpo.ownerId, organizationId: org },
    select: { id: true },
  });
  if (!propietario) return Response.json({ error: "Ese propietario no existe." }, { status: 404 });

  const envio = await prisma.envioDeInforme.create({
    data: {
      ownerId: propietario.id,
      periodStart: new Date(cuerpo.start),
      periodEnd: new Date(cuerpo.end),
      destinatario: cuerpo.destinatario ?? null,
      medio: cuerpo.medio === "MANO" ? "MANO" : "EMAIL",
      nota: cuerpo.nota ?? null,
    },
  });

  return Response.json({ ok: true, id: envio.id, enviadoEl: envio.enviadoEl });
}
