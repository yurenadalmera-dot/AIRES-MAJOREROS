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

import { calculateCommissions, splitAmount, round2, calcularImpuesto } from "../lib/money";
import { puede } from "../lib/permisos";
import { puedeCambiarEstadoFactura } from "../lib/constants";
import { numeroSiguiente } from "../lib/numeracion";
import { computePropertyStatus } from "../lib/status";
import { casillaDelDia } from "../lib/calendario";
import { decidirCuentaAdmin } from "../lib/cuenta-admin";
import { cifrar, descifrar, enmascarar } from "../lib/secretos";
import { comisionAplicable } from "../lib/comisiones-canal";
import { leerFechas } from "../lib/fechas";
import {
  calcularLiquidacion,
  comisionDeGestionDe,
  liquidarPropietario,
  mesesDelPeriodo,
} from "../lib/liquidacion";

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

describe("cuenta de administración en cada arranque", () => {
  const decidir = (existeLaCuenta: boolean, pideRestablecer = false) =>
    decidirCuentaAdmin({ hayContrasenaEnEntorno: true, existeLaCuenta, pideRestablecer }).tipo;

  test("sin ADMIN_PASSWORD no se toca nada", () => {
    assert.equal(
      decidirCuentaAdmin({
        hayContrasenaEnEntorno: false,
        existeLaCuenta: false,
        pideRestablecer: true,
      }).tipo,
      "nada"
    );
  });

  test("si la cuenta no existe, se crea", () => {
    assert.equal(decidir(false), "crear");
  });

  // El fallo: cada arranque reescribía el hash, así que la contraseña que
  // alguien se ponía en «Mi cuenta» volvía sola a la del entorno.
  test("si ya existe, el arranque NO le toca la contraseña", () => {
    assert.equal(decidir(true), "asegurar_acceso");
  });

  test("solo se restablece cuando se pide a propósito", () => {
    assert.equal(decidir(true, true), "restablecer");
  });
});

describe("guardar una credencial ajena", () => {
  // La clave de API de Lodgify da acceso a las reservas de la clienta: un
  // volcado de la base de datos no debe bastar para leerla.
  const original = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "un-secreto-de-pruebas-largo-y-aleatorio";

  test("lo cifrado vuelve a salir igual", () => {
    const clave = "lodgify_ABC123xyz";
    assert.equal(descifrar(cifrar(clave)), clave);
  });

  test("lo guardado no contiene la clave en claro", () => {
    const guardado = cifrar("lodgify_ABC123xyz");
    assert.ok(!guardado.includes("lodgify_ABC123xyz"));
    assert.ok(!guardado.includes("ABC123"));
  });

  test("dos cifrados de lo mismo salen distintos", () => {
    assert.notEqual(cifrar("misma"), cifrar("misma"));
  });

  test("un valor manipulado no descifra: devuelve null, no un texto falso", () => {
    const guardado = cifrar("lodgify_ABC123xyz");
    const partes = guardado.split(":");
    partes[3] = Buffer.from("otra cosa").toString("base64");
    assert.equal(descifrar(partes.join(":")), null);
  });

  test("con otro AUTH_SECRET no descifra, pero tampoco revienta", () => {
    const guardado = cifrar("lodgify_ABC123xyz");
    process.env.AUTH_SECRET = "otro-secreto-distinto-del-anterior";
    assert.equal(descifrar(guardado), null);
    process.env.AUTH_SECRET = "un-secreto-de-pruebas-largo-y-aleatorio";
  });

  test("nada guardado, nada que descifrar", () => {
    assert.equal(descifrar(null), null);
    assert.equal(descifrar(""), null);
  });

  test("enmascarar deja ver solo los cuatro últimos", () => {
    const tapada = enmascarar("lodgify_ABC123xyz");
    assert.ok(tapada.endsWith("3xyz"), tapada);
    assert.ok(!tapada.includes("lodgify"), tapada);
    assert.equal(tapada.length, "lodgify_ABC123xyz".length);
  });

  process.env.AUTH_SECRET = original;
});

describe("IGIC en las facturas", () => {
  // En Canarias no es IVA: es IGIC, y el tipo general es el 7 %.
  test("el 7 % sobre una base redonda", () => {
    assert.deepEqual(calcularImpuesto(100, 7), { base: 100, cuota: 7, total: 107 });
  });

  test("se redondea a céntimos, no a lo que salga", () => {
    // 342,55 × 7 % = 23,9785 → 23,98
    assert.deepEqual(calcularImpuesto(342.55, 7), { base: 342.55, cuota: 23.98, total: 366.53 });
  });

  test("el total es siempre base + cuota, sin arrastrar decimales", () => {
    for (const base of [0.01, 9.99, 55, 1234.56, 7777.77]) {
      const r = calcularImpuesto(base, 7);
      assert.equal(r.total, round2(r.base + r.cuota), `base ${base}`);
    }
  });

  test("un tipo distinto al general también vale", () => {
    assert.deepEqual(calcularImpuesto(200, 3), { base: 200, cuota: 6, total: 206 });
  });

  test("sin impuesto, el total es la base", () => {
    assert.deepEqual(calcularImpuesto(80, 0), { base: 80, cuota: 0, total: 80 });
  });
});

describe("comisión según canal y vivienda", () => {
  // Salido del Excel de reservas de 2026: Airbnb 15,5 % en todas las casas y
  // sin comisión bancaria; Booking 17 % en dos pisos y 15 % en el resto, con
  // un 1,3 % de comisión bancaria.
  const APTO_27 = "id-apto-27";
  const APTO_8206 = "id-apto-8206";
  const APTO_8241 = "id-apto-8241";

  const configuradas = [
    { canal: "Airbnb", propertyId: null, platformPct: 15.5, bankPct: 0 },
    { canal: "Booking.com", propertyId: null, platformPct: 15, bankPct: 1.3 },
    { canal: "Booking.com", propertyId: APTO_27, platformPct: 17, bankPct: 1.3 },
    { canal: "Booking.com", propertyId: APTO_8206, platformPct: 17, bankPct: 1.3 },
  ];
  const porDefecto = { platformPct: 15, bankPct: 2.5 };

  test("Booking cobra el 17 % en los dos pisos que lo tienen", () => {
    assert.equal(comisionAplicable("Booking.com", APTO_27, configuradas, porDefecto).platformPct, 17);
    assert.equal(comisionAplicable("Booking.com", APTO_8206, configuradas, porDefecto).platformPct, 17);
  });

  test("y el 15 % en los demás", () => {
    assert.equal(comisionAplicable("Booking.com", APTO_8241, configuradas, porDefecto).platformPct, 15);
  });

  test("Airbnb, 15,5 % en todos y sin comisión bancaria", () => {
    for (const piso of [APTO_27, APTO_8206, APTO_8241]) {
      const r = comisionAplicable("Airbnb", piso, configuradas, porDefecto);
      assert.equal(r.platformPct, 15.5, piso);
      assert.equal(r.bankPct, 0, piso);
    }
  });

  test("la bancaria del canal manda sobre la general", () => {
    assert.equal(comisionAplicable("Booking.com", APTO_8241, configuradas, porDefecto).bankPct, 1.3);
  });

  // Lodgify no escribe siempre igual el nombre del canal.
  test("da igual cómo venga escrito el canal", () => {
    for (const forma of ["booking.com", "BOOKING.COM", "Booking .com", " booking com "]) {
      assert.equal(comisionAplicable(forma, APTO_27, configuradas, porDefecto).platformPct, 17, forma);
    }
  });

  test("un canal sin configurar usa los porcentajes generales", () => {
    const r = comisionAplicable("VRBO", APTO_27, configuradas, porDefecto);
    assert.deepEqual(r, porDefecto);
  });

  test("sin nada configurado, todo va al general — como antes", () => {
    assert.deepEqual(comisionAplicable("Booking.com", APTO_27, [], porDefecto), porDefecto);
  });

  // Los números reales del Excel, sobre una reserva concreta de Villa Mónica:
  // 1.126,51 € → 168,98 € de comisión y 14,64 € de banco → 942,89 € a percibir.
  test("reproduce una reserva real del Excel", () => {
    const aplica = comisionAplicable("Booking.com", "villa-monica", configuradas, porDefecto);
    const r = calculateCommissions({
      totalPrice: 1126.51,
      platformCommissionPct: aplica.platformPct,
      bankCommissionPct: aplica.bankPct,
    });
    assert.equal(r.platformCommissionAmt, 168.98);
    assert.equal(r.bankCommissionAmt, 14.64);
    assert.equal(r.netAmount, 942.89);
  });
});

describe("leer fechas pegadas de un Excel", () => {
  test("acepta como se escribe aquí una fecha", () => {
    const { fechas, invalidas } = leerFechas("04/09/2026\n4-9-2026\n04.09.2026\n2026-09-04");
    assert.equal(invalidas.length, 0);
    // Las cuatro son el mismo día: no se repite.
    assert.equal(fechas.length, 1);
    assert.equal(fechas[0].toISOString().slice(0, 10), "2026-09-04");
  });

  test("una columna entera del Excel, en orden y sin repetir", () => {
    const { fechas } = leerFechas("21/09/2026\n04/09/2026\n08/09/2026\n04/09/2026\n");
    assert.deepEqual(
      fechas.map((f) => f.toISOString().slice(0, 10)),
      ["2026-09-04", "2026-09-08", "2026-09-21"]
    );
  });

  test("día primero, no mes primero", () => {
    // 04/09 es 4 de septiembre, no 9 de abril.
    const { fechas } = leerFechas("04/09/2026");
    assert.equal(fechas[0].getUTCMonth(), 8);
    assert.equal(fechas[0].getUTCDate(), 4);
  });

  test("lo que no se entiende se devuelve, no se inventa", () => {
    const { fechas, invalidas } = leerFechas("04/09/2026\nseptiembre\n31/02/2026\n99/99/2026");
    assert.equal(fechas.length, 1);
    assert.deepEqual(invalidas, ["septiembre", "31/02/2026", "99/99/2026"]);
  });

  test("las líneas en blanco no estorban", () => {
    const { fechas, invalidas } = leerFechas("\n\n04/09/2026\n\n  \n08/09/2026\n");
    assert.equal(fechas.length, 2);
    assert.equal(invalidas.length, 0);
  });

  // La fecha se guarda a mediodía para que ningún huso la mueva al día antes.
  test("una fecha no se corre de día", () => {
    const { fechas } = leerFechas("01/01/2026");
    assert.equal(fechas[0].toISOString().slice(0, 10), "2026-01-01");
    assert.equal(fechas[0].getUTCHours(), 12);
  });
});

describe("liquidación al propietario", () => {
  // La reserva de Villa Mónica que sale en el Excel de Emma.
  const villaMonica = [{ totalPrice: 1126.51, platformCommissionAmt: 168.98, bankCommissionAmt: 14.64 }];

  test("sin gastos, el 30 % va sobre lo que queda tras Booking y banco", () => {
    const r = calcularLiquidacion({
      reservas: villaMonica, gastos: [], managementPct: 30, cuotaFijaMensual: null,
    });
    assert.equal(r.ingresos, 1126.51);
    assert.equal(r.comisionesDeVenta, 183.62);
    assert.equal(r.baseDeGestion, 942.89);
    assert.equal(r.comisionDeGestion, 282.87);
    assert.equal(r.alPropietario, 660.02);
  });

  // Lo que cambia de verdad al tener gastos: la base baja y la comisión también.
  test("con gastos, la comisión baja", () => {
    const r = calcularLiquidacion({
      reservas: villaMonica, gastos: [120.5, 45], managementPct: 30, cuotaFijaMensual: null,
    });
    assert.equal(r.gastos, 165.5);
    assert.equal(r.baseDeGestion, 777.39);
    assert.equal(r.comisionDeGestion, 233.22);
    assert.equal(r.alPropietario, 544.17);
  });

  test("Villa Monikka va al 10 %", () => {
    const r = calcularLiquidacion({
      reservas: villaMonica, gastos: [], managementPct: 10, cuotaFijaMensual: null,
    });
    assert.equal(r.comisionDeGestion, 94.29);
  });

  test("Academia paga 600 € al mes, no un porcentaje", () => {
    const r = calcularLiquidacion({
      reservas: villaMonica, gastos: [], managementPct: 30, cuotaFijaMensual: 600,
    });
    assert.equal(r.comisionDeGestion, 600);
    assert.match(r.detalleDeLaComision, /Cuota fija mensual/);
  });

  test("y 1.800 € en un trimestre", () => {
    const r = calcularLiquidacion({
      reservas: villaMonica, gastos: [], managementPct: null, cuotaFijaMensual: 600, meses: 3,
    });
    assert.equal(r.comisionDeGestion, 1800);
  });

  // A las de Domingo Javier solo se les gestiona la limpieza.
  test("sin porcentaje ni cuota, no se cobra gestión", () => {
    const r = calcularLiquidacion({
      reservas: villaMonica, gastos: [80], managementPct: null, cuotaFijaMensual: null,
    });
    assert.equal(r.comisionDeGestion, 0);
    assert.equal(r.alPropietario, 862.89);
    assert.match(r.detalleDeLaComision, /Sin comisión/);
  });

  // Un mes malo no genera comisión: genera pérdida.
  test("si los gastos se comen los ingresos, no se cobra comisión", () => {
    const r = calcularLiquidacion({
      reservas: villaMonica, gastos: [2000], managementPct: 30, cuotaFijaMensual: null,
    });
    assert.ok(r.baseDeGestion < 0, String(r.baseDeGestion));
    assert.equal(r.comisionDeGestion, 0);
  });

  test("un periodo sin reservas no revienta", () => {
    const r = calcularLiquidacion({
      reservas: [], gastos: [], managementPct: 30, cuotaFijaMensual: null,
    });
    assert.deepEqual(
      [r.ingresos, r.baseDeGestion, r.comisionDeGestion, r.alPropietario],
      [0, 0, 0, 0]
    );
  });
});

describe("de dónde sale la comisión de gestión", () => {
  test("del grupo de la vivienda", () => {
    assert.equal(
      comisionDeGestionDe({ managementPct: null, group: { managementPct: 30 } }),
      30
    );
    assert.equal(
      comisionDeGestionDe({ managementPct: null, group: { managementPct: 10 } }),
      10
    );
  });

  // El grupo manda: si no, habría dos sitios donde mirar y acabarían diciendo
  // cosas distintas.
  test("el grupo manda sobre lo puesto en la vivienda", () => {
    assert.equal(
      comisionDeGestionDe({ managementPct: 99, group: { managementPct: 30 } }),
      30
    );
  });

  test("una vivienda suelta puede llevar el suyo", () => {
    assert.equal(comisionDeGestionDe({ managementPct: 12, group: null }), 12);
  });

  // Las de Domingo Javier: solo se les gestiona la limpieza.
  test("sin grupo y sin porcentaje, no se cobra gestión", () => {
    assert.equal(comisionDeGestionDe({ managementPct: null, group: null }), null);
  });

  test("un grupo sin porcentaje no fuerza el de la vivienda", () => {
    assert.equal(
      comisionDeGestionDe({ managementPct: 12, group: { managementPct: null } }),
      12
    );
  });
});

describe("liquidación de un propietario con varios grupos", () => {
  // El caso real de Inversiones Brito: dos grupos suyos, con comisiones
  // distintas, dentro del mismo informe.
  const villaMonica = {
    nombre: "Grupo Villa Mónica",
    managementPct: 30,
    reservas: [{ totalPrice: 1126.51, platformCommissionAmt: 168.98, bankCommissionAmt: 14.64 }],
    gastos: [],
  };
  const villaMonikka = {
    nombre: "Villa Monikka",
    managementPct: 10,
    reservas: [{ totalPrice: 500, platformCommissionAmt: 50, bankCommissionAmt: 5 }],
    gastos: [],
  };

  test("cada grupo lleva su porcentaje y luego se suman", () => {
    const r = liquidarPropietario({
      tramos: [villaMonica, villaMonikka],
      cuotaFijaMensual: null,
    });
    assert.equal(r.ingresos, 1626.51);
    assert.equal(r.comisionesDeVenta, 238.62);
    assert.equal(r.baseDeGestion, 1387.89);
    assert.equal(r.comisionDeGestion, 327.37); // 282,87 del 30 % + 44,50 del 10 %
    assert.equal(r.alPropietario, 1060.52);
  });

  // Lo que se evita: un solo porcentaje sobre el total le cobraría 416,37 €,
  // casi 90 € de más, porque Villa Monikka va al 10 %.
  test("no es lo mismo que aplicar el 30 % a todo", () => {
    const deGolpe = calcularLiquidacion({
      reservas: [...villaMonica.reservas, ...villaMonikka.reservas],
      gastos: [], managementPct: 30, cuotaFijaMensual: null,
    });
    const porGrupos = liquidarPropietario({
      tramos: [villaMonica, villaMonikka], cuotaFijaMensual: null,
    });
    assert.equal(deGolpe.comisionDeGestion, 416.37);
    assert.ok(porGrupos.comisionDeGestion < deGolpe.comisionDeGestion);
  });

  test("el desglose explica de dónde sale cada parte", () => {
    const r = liquidarPropietario({
      tramos: [villaMonica, villaMonikka], cuotaFijaMensual: null,
    });
    assert.equal(r.tramos.length, 2);
    assert.equal(r.tramos[0].comisionDeGestion, 282.87);
    assert.equal(r.tramos[1].comisionDeGestion, 44.5);
    assert.match(r.detalleDeLaComision, /Grupo Villa Mónica/);
    assert.match(r.detalleDeLaComision, /Villa Monikka/);
  });

  // Los gastos son de su grupo: solo bajan la comisión de ese grupo.
  test("los gastos bajan la comisión del grupo al que pertenecen", () => {
    const r = liquidarPropietario({
      tramos: [villaMonica, { ...villaMonikka, gastos: [100] }],
      cuotaFijaMensual: null,
    });
    assert.equal(r.gastos, 100);
    assert.equal(r.tramos[0].comisionDeGestion, 282.87); // el 30 % no se entera
    assert.equal(r.tramos[1].comisionDeGestion, 34.5); // 10 % sobre 345
  });

  // Academia Cañada: paga cuota, así que no hay nada que repartir por grupos.
  test("con cuota fija no se reparte por grupos", () => {
    const r = liquidarPropietario({
      tramos: [{ ...villaMonica, nombre: "Academia Cañada", managementPct: null }],
      cuotaFijaMensual: 600,
    });
    assert.equal(r.comisionDeGestion, 600);
    assert.deepEqual(r.tramos, []);
  });

  test("la cuota fija manda aunque el grupo tenga porcentaje", () => {
    const r = liquidarPropietario({ tramos: [villaMonica], cuotaFijaMensual: 600 });
    assert.equal(r.comisionDeGestion, 600);
  });

  // Domingo Javier: solo se le gestiona la limpieza.
  test("sin porcentaje ni cuota, se liquida todo lo que queda", () => {
    const r = liquidarPropietario({
      tramos: [{ nombre: "Villa Caliche", managementPct: null, reservas: villaMonica.reservas, gastos: [80] }],
      cuotaFijaMensual: null,
    });
    assert.equal(r.comisionDeGestion, 0);
    assert.equal(r.alPropietario, 862.89);
    assert.match(r.detalleDeLaComision, /Sin comisión/);
  });

  test("un propietario sin viviendas no revienta", () => {
    const r = liquidarPropietario({ tramos: [], cuotaFijaMensual: null });
    assert.deepEqual([r.ingresos, r.comisionDeGestion, r.alPropietario], [0, 0, 0]);
  });
});

describe("meses que cubre un periodo", () => {
  test("un mes natural es un mes", () => {
    assert.equal(mesesDelPeriodo(d("2026-01-01"), d("2026-01-31")), 1);
  });

  // Los 600 € de Academia son mensuales: un trimestre son 1.800 €.
  test("un trimestre son tres", () => {
    assert.equal(mesesDelPeriodo(d("2026-01-01"), d("2026-03-31")), 3);
  });

  test("cuenta meses tocados, no días", () => {
    assert.equal(mesesDelPeriodo(d("2026-01-28"), d("2026-02-03")), 2);
  });

  test("un solo día sigue siendo un mes", () => {
    assert.equal(mesesDelPeriodo(d("2026-01-15"), d("2026-01-15")), 1);
  });

  test("cruza el año", () => {
    assert.equal(mesesDelPeriodo(d("2025-11-01"), d("2026-02-28")), 4);
  });
});
