// La importación desde Mirador.
//
// Lo que se prueba aquí es lo que decide: qué entra, qué se rechaza y por
// qué. Una importación que se traga la mitad de las filas en silencio es
// peor que una que falla entera — sobre todo cuando lo que entra son los
// gastos que se le descuentan a un propietario.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { revisarVolcado, resumirImportacion } from "../lib/importacion";
import { generarToken, huellaDelToken, tokenCoincide, tokenDeLaCabecera } from "../lib/token-importacion";

/** Un volcado pequeño con la forma del de Mirador. */
const volcado = () => ({
  propietarios: [
    { ref: "p1", nombre: "Inversiones Brito Pérez S.L.", cif: "B35851872", direccion: "Avenida Jahn Reisen, 12" },
    { ref: "p2", nombre: "Academia Cañada del Río S.L.", cif: "B76038611", cuotaFija: 600 },
  ],
  grupos: [
    { ref: "g1", propietarioRef: "p1", nombre: "Grupo Chano", managementPct: 30 },
    { ref: "g2", propietarioRef: "p1", nombre: "Villa Monikka", managementPct: 10 },
  ],
  viviendas: [
    { ref: "v1", propietarioRef: "p1", grupoRef: "g1", nombre: "Villa Mónica", plazas: 15, lodgifyId: "641828" },
    { ref: "v2", propietarioRef: "p1", grupoRef: "g2", nombre: "Sand & Beach", plazas: 2, lodgifyId: "745283" },
  ],
  movimientos: [
    { origenHash: "h1", tipo: "gasto", fecha: "2026-07-20" as string | null, concepto: "Cofemax", importe: 33.25 as number | string, proveedor: "Cofemax", reparto: "directo", viviendaRef: "v1", propietarioRef: "p1" },
    { origenHash: "h2", tipo: "sueldo", fecha: "2026-07-20" as string | null, concepto: "Pago mes junio", importe: 1035 as number | string, reparto: "compartido", grupoRef: "g1", propietarioRef: "p1" },
  ],
});

describe("qué entra del volcado", () => {
  test("lo bueno entra entero", () => {
    const r = revisarVolcado(volcado());
    assert.equal(r.propietarios.length, 2);
    assert.equal(r.grupos.length, 2);
    assert.equal(r.viviendas.length, 2);
    assert.equal(r.movimientos.length, 2);
    assert.deepEqual(r.rechazados, []);
  });

  test("los tipos y el reparto se respetan", () => {
    const r = revisarVolcado(volcado());
    assert.equal(r.movimientos[1].tipo, "sueldo");
    assert.equal(r.movimientos[1].reparto, "compartido");
  });

  // Un traspaso no es un gasto: si se cuela como gasto resta en la
  // liquidación de alguien que no lo ha pagado.
  test("un tipo desconocido no se inventa: cae en gasto", () => {
    const v = volcado();
    v.movimientos[0].tipo = "loquesea";
    assert.equal(revisarVolcado(v).movimientos[0].tipo, "gasto");
  });

  test("los cuatro tipos de Mirador se reconocen", () => {
    for (const tipo of ["gasto", "sueldo", "traspaso", "ingreso"]) {
      const v = volcado();
      v.movimientos[0].tipo = tipo;
      assert.equal(revisarVolcado(v).movimientos[0].tipo, tipo, tipo);
    }
  });
});

describe("lo que se rechaza, y se dice", () => {
  test("un movimiento sin huella no entra: no se podría evitar duplicarlo", () => {
    const v = volcado();
    delete (v.movimientos[0] as { origenHash?: string }).origenHash;
    const r = revisarVolcado(v);
    assert.equal(r.movimientos.length, 1);
    assert.match(r.rechazados[0].porque, /huella/);
  });

  test("dos veces la misma huella en el mismo volcado solo entra una", () => {
    const v = volcado();
    v.movimientos.push({ ...v.movimientos[0] });
    const r = revisarVolcado(v);
    assert.equal(r.movimientos.length, 2);
    assert.match(r.rechazados[0].porque, /repetido/);
  });

  test("sin importe no entra", () => {
    const v = volcado();
    v.movimientos[0].importe = "no es un número";
    const r = revisarVolcado(v);
    assert.equal(r.movimientos.length, 1);
    assert.match(r.rechazados[0].porque, /no es un número/);
  });

  // Un apunte del banco de 0 € puede ser real: aquí no se aplica la regla
  // del cero, que es para lo que lee un modelo.
  test("un importe de 0 € sí entra", () => {
    const v = volcado();
    v.movimientos[0].importe = 0;
    assert.equal(revisarVolcado(v).movimientos.length, 2);
  });

  test("un grupo cuyo propietario no viene se rechaza", () => {
    const v = volcado();
    v.grupos[0].propietarioRef = "p-que-no-existe";
    const r = revisarVolcado(v);
    assert.equal(r.grupos.length, 1);
    assert.match(r.rechazados[0].porque, /propietario/);
  });

  // Mejor una vivienda suelta que perderla.
  test("una vivienda con grupo desconocido entra sin grupo", () => {
    const v = volcado();
    v.viviendas[0].grupoRef = "g-que-no-existe";
    const r = revisarVolcado(v);
    assert.equal(r.viviendas.length, 2);
    assert.equal(r.viviendas[0].grupoRef, null);
    assert.match(r.rechazados[0].porque, /entra sin grupo/);
  });

  test("no revienta con basura", () => {
    for (const basura of [null, undefined, {}, [], "texto", 42]) {
      const r = revisarVolcado(basura);
      assert.deepEqual(r.movimientos, [], String(basura));
    }
  });
});

describe("apuntes sin fecha", () => {
  // En Mirador los hay: «sin fecha en el fichero». Perderlos sería peor.
  test("entran, con la fecha a nulo", () => {
    const v = volcado();
    v.movimientos[0].fecha = null;
    const r = revisarVolcado(v);
    assert.equal(r.movimientos.length, 2);
    assert.equal(r.movimientos[0].fecha, null);
    assert.deepEqual(r.rechazados, []);
  });

  test("una fecha que no se entiende entra sin fecha, y se avisa", () => {
    const v = volcado();
    v.movimientos[0].fecha = "el martes";
    const r = revisarVolcado(v);
    assert.equal(r.movimientos[0].fecha, null);
    assert.match(r.rechazados[0].porque, /no entiendo la fecha/);
  });

  test("un 31 de febrero no cuela", () => {
    const v = volcado();
    v.movimientos[0].fecha = "2026-02-31";
    assert.equal(revisarVolcado(v).movimientos[0].fecha, null);
  });

  test("la fecha se guarda a mediodía, para que ningún huso la mueva", () => {
    const r = revisarVolcado(volcado());
    assert.equal(r.movimientos[0].fecha?.toISOString(), "2026-07-20T12:00:00.000Z");
  });
});

describe("el resumen dice qué se ha hecho", () => {
  test("cuántos nuevos, cuántos ya estaban y cuántos sin fecha", () => {
    const v = volcado();
    v.movimientos[0].fecha = null;
    const r = revisarVolcado(v);
    const s = resumirImportacion(r.movimientos, new Set(["h2"]));
    assert.deepEqual(s, { nuevos: 1, repetidos: 1, sinFecha: 1 });
  });

  // Repetir la importación entera no debe crear nada.
  test("importar dos veces lo mismo no crea nada nuevo", () => {
    const r = revisarVolcado(volcado());
    const s = resumirImportacion(r.movimientos, new Set(["h1", "h2"]));
    assert.equal(s.nuevos, 0);
    assert.equal(s.repetidos, 2);
  });
});

describe("el token de importación", () => {
  test("abre con el suyo y no con otro", () => {
    const t = generarToken();
    const huella = huellaDelToken(t);
    assert.equal(tokenCoincide(t, huella), true);
    assert.equal(tokenCoincide(generarToken(), huella), false);
  });

  test("del token solo se guarda la huella", () => {
    const t = generarToken();
    assert.ok(!huellaDelToken(t).includes(t.slice(4)));
    assert.equal(huellaDelToken(t).length, 64);
  });

  test("dos tokens nunca salen iguales", () => {
    const vistos = new Set(Array.from({ length: 200 }, () => generarToken()));
    assert.equal(vistos.size, 200);
  });

  test("sin token, o con basura, no abre", () => {
    const huella = huellaDelToken(generarToken());
    for (const v of [null, undefined, "", "imp_loquesea"]) {
      assert.equal(tokenCoincide(v, huella), false, String(v));
    }
    assert.equal(tokenCoincide(generarToken(), null), false);
  });

  test("se lee de la cabecera Bearer", () => {
    assert.equal(tokenDeLaCabecera("Bearer imp_abc"), "imp_abc");
    assert.equal(tokenDeLaCabecera("bearer  imp_abc  "), "imp_abc");
    assert.equal(tokenDeLaCabecera("Basic imp_abc"), null);
    assert.equal(tokenDeLaCabecera(null), null);
  });
});
