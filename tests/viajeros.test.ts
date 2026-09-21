/**
 * El parte de viajeros.
 *
 * Lo que se comprueba aquí es lo que evita perseguir a un huésped que ya se
 * ha ido: que el documento esté bien copiado, que no falte nadie y que de un
 * menor conste quién responde por él.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  edadEn,
  esMenor,
  problemasDelViajero,
  estadoDelParte,
  type DatosDeViajero,
} from "../lib/viajeros";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

const ADULTO: DatosDeViajero = {
  nombre: "Ana",
  apellido1: "García",
  apellido2: "López",
  tipoDocumento: "NIF",
  // DNI con letra de control correcta.
  documento: "12345678Z",
  numeroSoporte: "BMB123456",
  nacionalidad: "ESP",
  fechaNacimiento: d("1985-03-12"),
};

describe("la edad", () => {
  test("cuenta los años cumplidos, no los empezados", () => {
    assert.equal(edadEn(d("2000-06-15"), d("2026-06-14")), 25);
    assert.equal(edadEn(d("2000-06-15"), d("2026-06-15")), 26);
  });

  test("se mira en la fecha de entrada, no hoy", () => {
    // Cumple 18 justo antes de venir: en la entrada ya es mayor, aunque
    // cuando se rellenó el formulario todavía no lo fuera.
    const nacimiento = d("2008-07-01");
    assert.equal(esMenor(nacimiento, d("2026-06-30")), true);
    assert.equal(esMenor(nacimiento, d("2026-07-01")), false);
  });
});

describe("qué le falta a un viajero", () => {
  test("uno completo no tiene nada que corregir", () => {
    assert.deepEqual(problemasDelViajero(ADULTO, d("2026-07-10")), []);
  });

  test("sin nombre, sin apellido ni documento lo dice todo de una vez", () => {
    // De una en una obligaría a enviar el formulario cuatro veces.
    const fallos = problemasDelViajero({}, d("2026-07-10"));
    assert.ok(fallos.length >= 5, fallos.join(" | "));
  });

  test("caza un DNI mal copiado", () => {
    // La letra no corresponde a esas cifras: hay algo mal transcrito.
    const fallos = problemasDelViajero({ ...ADULTO, documento: "12345678A" }, d("2026-07-10"));
    assert.ok(fallos.some((f) => f.includes("no cuadra")), fallos.join(" | "));
  });

  test("un pasaporte extranjero no pasa por el dígito de control español", () => {
    const fallos = problemasDelViajero(
      { ...ADULTO, tipoDocumento: "PAS", documento: "C01X00T47", numeroSoporte: null, nacionalidad: "DEU" },
      d("2026-07-10")
    );
    assert.deepEqual(fallos, []);
  });

  test("al DNI y al NIE se les exige el número de soporte", () => {
    const fallos = problemasDelViajero({ ...ADULTO, numeroSoporte: "" }, d("2026-07-10"));
    assert.ok(fallos.some((f) => f.includes("soporte")), fallos.join(" | "));
  });

  test("de un menor hace falta saber quién responde por él", () => {
    const menor = { ...ADULTO, fechaNacimiento: d("2015-01-01"), parentesco: null };
    const fallos = problemasDelViajero(menor, d("2026-07-10"));
    assert.ok(fallos.some((f) => f.includes("parentesco")), fallos.join(" | "));

    const conParentesco = { ...menor, parentesco: "Hija" };
    assert.deepEqual(problemasDelViajero(conParentesco, d("2026-07-10")), []);
  });

  test("una fecha de nacimiento imposible no pasa", () => {
    const futuro = problemasDelViajero({ ...ADULTO, fechaNacimiento: d("2030-01-01") }, d("2026-07-10"));
    assert.ok(futuro.some((f) => f.includes("posterior")), futuro.join(" | "));

    const viejisimo = problemasDelViajero({ ...ADULTO, fechaNacimiento: d("1850-01-01") }, d("2026-07-10"));
    assert.ok(viejisimo.some((f) => f.includes("120")), viejisimo.join(" | "));
  });

  test("un correo sin arroba no es un correo", () => {
    const fallos = problemasDelViajero({ ...ADULTO, email: "ana.ejemplo.com" }, d("2026-07-10"));
    assert.ok(fallos.some((f) => f.includes("correo")), fallos.join(" | "));
  });
});

describe("en qué punto está el parte de una reserva", () => {
  const entrada = d("2026-07-10");

  test("sin nadie registrado, sin datos", () => {
    assert.equal(
      estadoDelParte({ comunicadoEl: null, viajeros: [], huespedesEsperados: 2, entrada }),
      "SIN_DATOS"
    );
  });

  test("con menos gente de la que viene, incompleto", () => {
    // Vienen cuatro y solo ha rellenado uno: faltan tres por registrar.
    assert.equal(
      estadoDelParte({ comunicadoEl: null, viajeros: [ADULTO], huespedesEsperados: 4, entrada }),
      "INCOMPLETO"
    );
  });

  test("con todos pero uno mal, incompleto", () => {
    assert.equal(
      estadoDelParte({
        comunicadoEl: null,
        viajeros: [ADULTO, { ...ADULTO, documento: "12345678A" }],
        huespedesEsperados: 2,
        entrada,
      }),
      "INCOMPLETO"
    );
  });

  test("con todos y bien, listo para comunicar", () => {
    assert.equal(
      estadoDelParte({ comunicadoEl: null, viajeros: [ADULTO, ADULTO], huespedesEsperados: 2, entrada }),
      "COMPLETO"
    );
  });

  test("una vez comunicado, ya está", () => {
    // Aunque luego se añada gente: lo comunicado, comunicado está.
    assert.equal(
      estadoDelParte({ comunicadoEl: d("2026-07-10"), viajeros: [], huespedesEsperados: 2, entrada }),
      "COMUNICADO"
    );
  });
});
