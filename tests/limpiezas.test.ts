/**
 * La regla de salida o repaso.
 *
 * Copiada del workflow «Generar limpiezas» de n8n, que es el que viene
 * generándolas de verdad. Estas pruebas están para que, cuando aquel se
 * apague, se pueda demostrar que aquí se cobra exactamente lo mismo.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  servicioDeLaSalida,
  siguienteEntrada,
  huespedesDe,
  DIAS_PARA_REPASO,
} from "../lib/limpiezas";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("salida o repaso, según el hueco", () => {
  test("sin siguiente entrada es una salida, que es la cara", () => {
    // Suponer un repaso porque todavía no hay nadie apuntado sería cobrar de
    // menos por una casa que a lo mejor se alquila la semana que viene.
    assert.equal(servicioDeLaSalida(d("2026-07-10"), null), "salida");
  });

  test("entra otro el mismo día: salida", () => {
    assert.equal(servicioDeLaSalida(d("2026-07-10"), d("2026-07-10")), "salida");
  });

  test("seis días de hueco: todavía salida", () => {
    assert.equal(servicioDeLaSalida(d("2026-07-10"), d("2026-07-16")), "salida");
  });

  test("siete días justos: repaso", () => {
    // El límite es «>= 7», igual que en n8n. Que esté en el borde importa:
    // son 20 € de diferencia por limpieza.
    assert.equal(servicioDeLaSalida(d("2026-07-10"), d("2026-07-17")), "repaso");
  });

  test("un mes de hueco: repaso", () => {
    assert.equal(servicioDeLaSalida(d("2026-07-10"), d("2026-08-10")), "repaso");
  });

  test("la hora del día no cambia la cuenta", () => {
    // Las fechas de Lodgify llegan con hora; si se restaran en crudo, un
    // check-out a las 11:00 y una entrada a las 16:00 darían 6,79 días en vez
    // de 7 y la limpieza cambiaría de precio por la hora.
    const salida = new Date("2026-07-10T11:00:00Z");
    const entrada = new Date("2026-07-17T16:00:00Z");
    assert.equal(servicioDeLaSalida(salida, entrada), "repaso");
  });

  test("el umbral es el que dice la constante", () => {
    assert.equal(DIAS_PARA_REPASO, 7);
  });
});

describe("cuál es la siguiente entrada", () => {
  const reservas = [
    { checkIn: d("2026-07-01"), checkOut: d("2026-07-10") },
    { checkIn: d("2026-07-20"), checkOut: d("2026-07-27") },
    { checkIn: d("2026-07-12"), checkOut: d("2026-07-15") },
  ];

  test("la primera que empieza en la fecha de salida o después", () => {
    const sig = siguienteEntrada(reservas, d("2026-07-10"));
    assert.deepEqual(sig?.checkIn, d("2026-07-12"));
  });

  test("no cuenta la que se está yendo", () => {
    const seVa = reservas[0];
    const sig = siguienteEntrada(reservas, d("2026-07-10"), seVa);
    assert.deepEqual(sig?.checkIn, d("2026-07-12"));
  });

  test("una entrada anterior a la salida no vale", () => {
    const sig = siguienteEntrada(reservas, d("2026-07-28"));
    assert.equal(sig, null);
  });

  test("sin reservas, null", () => {
    assert.equal(siguienteEntrada([], d("2026-07-10")), null);
  });

  test("una que entra el mismo día de la salida sí cuenta", () => {
    // El encadenado del mismo día es el caso que más urge limpiar.
    const sig = siguienteEntrada([{ checkIn: d("2026-07-10"), checkOut: d("2026-07-14") }], d("2026-07-10"));
    assert.deepEqual(sig?.checkIn, d("2026-07-10"));
  });
});

describe("con cuántos huéspedes se cobra", () => {
  test("adultos más niños", () => {
    // Los niños cuentan: ensucian igual. Es lo que hace n8n («Adultos» +
    // «Niños») y lo que sale impreso en la factura.
    assert.equal(huespedesDe({ adults: 2, children: 2 }), 4);
  });

  test("sin niños", () => {
    assert.equal(huespedesDe({ adults: 2, children: 0 }), 2);
  });
});
