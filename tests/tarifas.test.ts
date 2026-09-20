// El precio de una limpieza.
//
// Lo que se comprueba aquí contra datos de verdad: el resumen de servicios de
// julio de 2026 que Aires le pasó a Academia Cañada. Dice, literalmente:
//
//   15/07  24 Montaña Tirba    Limpieza de salida (4 huéspedes)   80,00 €
//   22/07  25 Montaña Tindaya  Limpieza de salida (2 huéspedes)   60,00 €
//   27/07  25 Montaña Tindaya  Limpieza de salida (2 huéspedes)   60,00 €
//                                              TOTAL SERVICIOS   200,00 €
//
// Si la fórmula no reproduce esos tres importes, está mal.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { precioDeLimpieza, tarifaVigente, type LineaDeTarifa } from "../lib/tarifas";

/** Las dos tarifas reales de Mirador. */
const OFICIAL: Record<string, LineaDeTarifa> = {
  salida: { servicio: "salida", base: 60, huespedesIncluidos: 2, porHuespedAdicional: 10 },
  repaso: { servicio: "repaso", base: 40, huespedesIncluidos: 0, porHuespedAdicional: 0 },
};
const BRITO: Record<string, LineaDeTarifa> = {
  salida: { servicio: "salida", base: 50, huespedesIncluidos: 2, porHuespedAdicional: 10 },
  repaso: { servicio: "repaso", base: 30, huespedesIncluidos: 0, porHuespedAdicional: 0 },
};

describe("la factura real de julio a Academia Cañada", () => {
  const salida = (huespedes: number) =>
    precioDeLimpieza({ servicio: "salida", huespedes, linea: OFICIAL.salida }).precio;

  test("Apto 24 con cuatro huéspedes son 80 €", () => {
    assert.equal(salida(4), 80);
  });

  test("Apto 25 con dos huéspedes son 60 €", () => {
    assert.equal(salida(2), 60);
  });

  test("y el total de las tres limpiezas son los 200 € que dice la factura", () => {
    assert.equal(salida(4)! + salida(2)! + salida(2)!, 200);
  });

  // La misma factura: 200 € de base + 14 € de IGIC al 7 % = 214 €.
  test("con el IGIC al 7 % sale el total de 214 €", () => {
    const base = salida(4)! + salida(2)! + salida(2)!;
    assert.equal(Math.round(base * 1.07 * 100) / 100, 214);
  });
});

describe("base más huésped adicional", () => {
  test("hasta los incluidos se cobra la base", () => {
    for (const n of [0, 1, 2]) {
      assert.equal(precioDeLimpieza({ servicio: "salida", huespedes: n, linea: OFICIAL.salida }).precio, 60, String(n));
    }
  });

  test("y por encima se suma por cabeza", () => {
    assert.equal(precioDeLimpieza({ servicio: "salida", huespedes: 3, linea: OFICIAL.salida }).precio, 70);
    assert.equal(precioDeLimpieza({ servicio: "salida", huespedes: 6, linea: OFICIAL.salida }).precio, 100);
  });

  // Brito tiene su propia tarifa, más barata: es el cliente grande.
  test("la tarifa de Brito cobra 10 € menos de salida", () => {
    assert.equal(precioDeLimpieza({ servicio: "salida", huespedes: 4, linea: BRITO.salida }).precio, 70);
    assert.equal(precioDeLimpieza({ servicio: "repaso", huespedes: 4, linea: BRITO.repaso }).precio, 30);
  });

  test("el repaso no depende de cuántos vengan", () => {
    for (const n of [1, 5, 12]) {
      assert.equal(precioDeLimpieza({ servicio: "repaso", huespedes: n, linea: OFICIAL.repaso }).precio, 40, String(n));
    }
  });

  // Sin el dato, cobrar el suplemento sería cobrar de más por algo que no se
  // sabe. Se cobra la base.
  test("sin número de huéspedes se cobra la base", () => {
    assert.equal(precioDeLimpieza({ servicio: "salida", huespedes: null, linea: OFICIAL.salida }).precio, 60);
  });

  test("la explicación dice de dónde sale el número", () => {
    const r = precioDeLimpieza({ servicio: "salida", huespedes: 4, linea: OFICIAL.salida });
    assert.match(r.explicacion, /60 € de salida \(hasta 2\) \+ 2 × 10 €/);
  });
});

describe("el precio cerrado de una vivienda", () => {
  // Villa Mónica son quince plazas: se limpia entera, vengan los que vengan.
  test("gana sobre la tarifa, vengan los que vengan", () => {
    for (const n of [2, 10, 15]) {
      const r = precioDeLimpieza({ servicio: "salida", huespedes: n, precioCerrado: 120, linea: OFICIAL.salida });
      assert.equal(r.precio, 120, String(n));
      assert.match(r.explicacion, /Precio cerrado/);
    }
  });

  test("Villa Gregorio y Villa Caliche, a 100 €", () => {
    assert.equal(precioDeLimpieza({ servicio: "salida", huespedes: 8, precioCerrado: 100 }).precio, 100);
  });

  // Un precio cerrado de 0 € es una decisión, no un hueco: hay viviendas que
  // no se facturan. Tiene que respetarse.
  test("un precio cerrado de 0 € se respeta", () => {
    assert.equal(precioDeLimpieza({ servicio: "salida", huespedes: 4, precioCerrado: 0, linea: OFICIAL.salida }).precio, 0);
  });
});

describe("cuando no se puede saber el precio", () => {
  // Inventarse un precio es peor que pedirlo: una limpieza facturada de menos
  // no la reclama nadie.
  test("sin tarifa ni precio cerrado no se inventa nada", () => {
    const r = precioDeLimpieza({ servicio: "salida", huespedes: 4 });
    assert.equal(r.precio, null);
    assert.match(r.explicacion, /Ponlo a mano/);
  });

  test("una línea de otro servicio no vale", () => {
    const r = precioDeLimpieza({ servicio: "repaso", huespedes: 4, linea: OFICIAL.salida });
    assert.equal(r.precio, null);
  });
});

describe("qué tarifa estaba en vigor", () => {
  const d = (iso: string) => new Date(`${iso}T12:00:00.000Z`);
  const vieja = { nombre: "2025", vigenteDesde: d("2025-01-01"), vigenteHasta: d("2025-12-31") };
  const actual = { nombre: "Oficial 2026", vigenteDesde: d("2026-01-01"), vigenteHasta: null };

  test("la que corresponde a la fecha", () => {
    assert.equal(tarifaVigente([vieja, actual], d("2025-06-01"))?.nombre, "2025");
    assert.equal(tarifaVigente([vieja, actual], d("2026-07-15"))?.nombre, "Oficial 2026");
  });

  // Subir precios no puede cambiar lo que se facturó el mes pasado.
  test("una tarifa que empieza mañana no se aplica hoy", () => {
    const futura = { nombre: "2027", vigenteDesde: d("2027-01-01"), vigenteHasta: null };
    assert.equal(tarifaVigente([actual, futura], d("2026-07-15"))?.nombre, "Oficial 2026");
  });

  test("entre dos que solapan, gana la que empezó más tarde", () => {
    const solapa = { nombre: "Revisada", vigenteDesde: d("2026-06-01"), vigenteHasta: null };
    assert.equal(tarifaVigente([actual, solapa], d("2026-07-15"))?.nombre, "Revisada");
  });

  test("sin ninguna vigente, null", () => {
    assert.equal(tarifaVigente([vieja], d("2026-07-15")), null);
    assert.equal(tarifaVigente([], d("2026-07-15")), null);
  });
});
