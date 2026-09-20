// Pruebas de las reglas de negocio.
//
// Cada bloque fija un fallo que llegó a estar en producción. No son pruebas
// escritas por completismo: son la red que impide que esos fallos vuelvan.
//
//   npm test
//
// No necesitan base de datos ni servidor: todo lo que se prueba aquí es
// lógica pura, y por eso se sacó de donde estaba enterrada.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { addDays, addMonths, subDays } from "date-fns";

import { calculateCommissions, splitAmount, round2 } from "../lib/money";
import { puede } from "../lib/permisos";
import { puedeCambiarEstadoFactura } from "../lib/constants";
import { numeroSiguiente } from "../lib/numeracion";
import { computePropertyStatus } from "../lib/status";
import { casillaDelDia } from "../lib/calendario";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("comisiones", () => {
  test("se aplican sobre el precio total y el neto cuadra", () => {
    const r = calculateCommissions({
      totalPrice: 690,
      platformCommissionPct: 15,
      bankCommissionPct: 2.5,
    });
    assert.equal(r.platformCommissionAmt, 103.5);
    assert.equal(r.bankCommissionAmt, 17.25);
    assert.equal(r.netAmount, 569.25);
    assert.equal(round2(r.platformCommissionAmt + r.bankCommissionAmt + r.netAmount), 690);
  });

  test("sin comisiones, el neto es el total", () => {
    const r = calculateCommissions({
      totalPrice: 100,
      platformCommissionPct: 0,
      bankCommissionPct: 0,
    });
    assert.equal(r.netAmount, 100);
  });
});

describe("reparto entre socias", () => {
  // El fallo: la segunda parte se calculaba restando, así que su porcentaje se
  // ignoraba. Con un 70/20 la segunda socia cobraba el 30 %.
  test("cada socia cobra SU porcentaje, no el resto", () => {
    const r = splitAmount(1000, 70, 20);
    assert.equal(r.partnerAAmount, 700);
    assert.equal(r.partnerBAmount, 200);
  });

  test("cuando suman 100, A + B da exactamente el total", () => {
    for (const [a, b] of [
      [50, 50],
      [60, 40],
      [33.33, 66.67],
      [100, 0],
    ]) {
      const r = splitAmount(1000, a, b);
      assert.equal(round2(r.partnerAAmount + r.partnerBAmount), 1000, `${a}/${b}`);
    }
  });
});

describe("numeración de facturas", () => {
  // El fallo: el número salía de CONTAR las facturas. Al anular una, el
  // siguiente número ya existía y no se podía emitir.
  test("sale del último emitido, no de cuántas hay", () => {
    assert.equal(numeroSiguiente("AM-2026-", "AM-2026-0003"), "AM-2026-0004");
  });

  test("un hueco por anulación no reutiliza el número", () => {
    // Quedan la 0001 y la 0003 porque se anuló la 0002: la siguiente es la 0004.
    assert.equal(numeroSiguiente("AM-2026-", "AM-2026-0003"), "AM-2026-0004");
  });

  test("la primera factura del año es la 0001", () => {
    assert.equal(numeroSiguiente("AM-2026-", null), "AM-2026-0001");
  });

  test("pasa de cuatro cifras sin romperse", () => {
    assert.equal(numeroSiguiente("AM-2026-", "AM-2026-9999"), "AM-2026-10000");
  });
});

describe("estados de una factura", () => {
  // Emitir tiene efectos fiscales: lo que está mal se corrige con una
  // rectificativa, no deshaciendo la original.
  test("una factura emitida NO vuelve a borrador", () => {
    assert.equal(puedeCambiarEstadoFactura("ISSUED", "DRAFT"), false);
    assert.equal(puedeCambiarEstadoFactura("PAID", "DRAFT"), false);
  });

  test("cobrada y emitida sí se pueden corregir entre sí", () => {
    assert.equal(puedeCambiarEstadoFactura("ISSUED", "PAID"), true);
    assert.equal(puedeCambiarEstadoFactura("PAID", "ISSUED"), true);
  });

  test("un borrador sí se puede emitir", () => {
    assert.equal(puedeCambiarEstadoFactura("DRAFT", "ISSUED"), true);
  });
});

describe("permisos", () => {
  // El fallo: `role` solo pintaba una etiqueta. Cualquiera podía todo.
  test("una socia no toca los datos fiscales ni las reservas", () => {
    assert.equal(puede("PARTNER", "administracion"), false);
    assert.equal(puede("PARTNER", "operativa.alquiler"), false);
    assert.equal(puede("PARTNER", "facturacion"), true);
  });

  test("la gestora del alquiler no factura", () => {
    assert.equal(puede("RENTAL_MANAGER", "facturacion"), false);
    assert.equal(puede("RENTAL_MANAGER", "operativa.alquiler"), true);
  });

  test("quien limpia solo marca su trabajo", () => {
    assert.equal(puede("STAFF", "operativa.estado_tarea"), true);
    assert.equal(puede("STAFF", "facturacion"), false);
    assert.equal(puede("STAFF", "operativa.alquiler"), false);
  });

  test("un rol desconocido no puede nada", () => {
    assert.equal(puede("LO_QUE_SEA", "operativa.estado_tarea"), false);
  });
});

describe("estado de una vivienda", () => {
  const hoy = new Date("2026-06-15T12:00:00.000Z");
  const tarea = (tipo: string, estado: string, fecha: Date) => ({
    type: tipo,
    status: estado,
    date: fecha,
  });

  test("sin nada pendiente está libre", () => {
    assert.equal(computePropertyStatus(null, [], [], hoy), "AVAILABLE");
  });

  // El fallo: cualquier mantenimiento pendiente la bloqueaba, aunque fuera
  // dentro de seis meses — y eso descuadraba los contadores del panel.
  test("un mantenimiento futuro NO la bloquea hoy", () => {
    const futuro = [tarea("MAINTENANCE", "PENDING", addMonths(hoy, 6))];
    assert.equal(computePropertyStatus(null, [], futuro, hoy), "AVAILABLE");
  });

  test("uno de hoy o atrasado sí la bloquea", () => {
    assert.equal(
      computePropertyStatus(null, [], [tarea("MAINTENANCE", "PENDING", hoy)], hoy),
      "MAINTENANCE"
    );
    assert.equal(
      computePropertyStatus(null, [], [tarea("MAINTENANCE", "PENDING", subDays(hoy, 10))], hoy),
      "MAINTENANCE"
    );
  });

  test("uno en curso la bloquea sea cual sea su fecha", () => {
    const enCurso = [tarea("MAINTENANCE", "IN_PROGRESS", addMonths(hoy, 6))];
    assert.equal(computePropertyStatus(null, [], enCurso, hoy), "MAINTENANCE");
  });

  test("ocupada mientras dura la reserva, libre el día de salida", () => {
    const reserva = [{ status: "CONFIRMED", checkIn: subDays(hoy, 2), checkOut: addDays(hoy, 2) }];
    assert.equal(computePropertyStatus(null, reserva, [], hoy), "OCCUPIED");
  });

  test("una reserva cancelada no ocupa", () => {
    const reserva = [{ status: "CANCELLED", checkIn: subDays(hoy, 2), checkOut: addDays(hoy, 2) }];
    assert.equal(computePropertyStatus(null, reserva, [], hoy), "AVAILABLE");
  });

  test("el estado manual manda sobre todo lo demás", () => {
    const reserva = [{ status: "CONFIRMED", checkIn: subDays(hoy, 2), checkOut: addDays(hoy, 2) }];
    assert.equal(computePropertyStatus("MAINTENANCE", reserva, [], hoy), "MAINTENANCE");
  });
});

describe("calendario semanal", () => {
  const ana = { guestName: "Ana", checkIn: d("2027-06-10"), checkOut: d("2027-06-17") };
  const bruno = { guestName: "Bruno", checkIn: d("2027-06-17"), checkOut: d("2027-06-24") };

  test("el día de entrada lo dice", () => {
    assert.equal(casillaDelDia([ana], d("2027-06-10")).etiqueta, "Entrada");
  });

  // El fallo: el día de salida caía fuera del rango pintado, así que salía
  // como casilla vacía. Justo el día en que hay que limpiar.
  test("el día de salida se ve, y avisa de que toca limpiar", () => {
    const c = casillaDelDia([ana], d("2027-06-17"));
    assert.equal(c.etiqueta, "Salida · limpieza");
    assert.equal(c.reserva?.guestName, "Ana");
  });

  test("si ese día se va uno y entra otro, lo dice y manda quien entra", () => {
    const c = casillaDelDia([ana, bruno], d("2027-06-17"));
    assert.equal(c.etiqueta, "Salida y entrada · limpieza");
    assert.equal(c.reserva?.guestName, "Bruno");
  });

  test("el día siguiente a la salida está libre", () => {
    assert.equal(casillaDelDia([ana], d("2027-06-18")).reserva, null);
  });

  test("los días de en medio son de quien ocupa", () => {
    const c = casillaDelDia([ana], d("2027-06-13"));
    assert.equal(c.reserva?.guestName, "Ana");
    assert.equal(c.etiqueta, "—");
  });
});
