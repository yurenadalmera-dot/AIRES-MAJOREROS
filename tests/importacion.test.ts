// La importación desde Mirador.
//
// Lo que se prueba aquí es lo que decide: qué entra, qué se rechaza y por
// qué. Una importación que se traga la mitad de las filas en silencio es
// peor que una que falla entera — sobre todo cuando lo que entra son los
// gastos que se le descuentan a un propietario.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { revisarVolcado, resumirImportacion, seParecen, claveDeVivienda, ALIAS_DE_VIVIENDA } from "../lib/importacion";
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

describe("las tarifas de limpieza que vienen de Mirador", () => {
  const conTarifas = () => ({
    ...volcado(),
    propietarios: [
      { ref: "p1", nombre: "Inversiones Brito Pérez S.L.", tarifaRef: "t2" },
      { ref: "p2", nombre: "Academia Cañada del Río S.L.", tarifaRef: "t1", cuotaFija: 600 },
    ],
    tarifas: [
      {
        ref: "t1", nombre: "Oficial 2026", vigenteDesde: "2026-01-01" as string | null, vigenteHasta: null,
        lineas: [
          { servicio: "salida", base: 60, huespedesIncluidos: 2, porHuespedAdicional: 10 },
          { servicio: "repaso", base: 40, huespedesIncluidos: 0, porHuespedAdicional: 0 },
        ],
      },
      {
        ref: "t2", nombre: "Inversiones Brito", vigenteDesde: "2026-01-01" as string | null, vigenteHasta: null,
        lineas: [{ servicio: "salida", base: 50, huespedesIncluidos: 2, porHuespedAdicional: 10 }],
      },
    ],
    preciosCerrados: [
      { viviendaRef: "v1", servicio: "salida", precio: 120 },
    ],
  });

  test("entran las dos con sus líneas", () => {
    const r = revisarVolcado(conTarifas());
    assert.equal(r.tarifas.length, 2);
    assert.equal(r.tarifas[0].lineas.length, 2);
    assert.equal(r.tarifas[0].lineas[0].base, 60);
    assert.equal(r.tarifas[0].lineas[0].porHuespedAdicional, 10);
    assert.deepEqual(r.rechazados, []);
  });

  test("y cada propietario con la suya", () => {
    const r = revisarVolcado(conTarifas());
    assert.equal(r.propietarios[0].tarifaRef, "t2");
    assert.equal(r.propietarios[1].tarifaRef, "t1");
  });

  test("el precio cerrado de Villa Mónica entra", () => {
    const r = revisarVolcado(conTarifas());
    assert.deepEqual(r.preciosCerrados, [{ viviendaRef: "v1", servicio: "salida", precio: 120 }]);
  });

  // Una tarifa vacía dejaría las limpiezas sin precio y nadie se enteraría.
  test("una tarifa sin líneas que valgan se rechaza", () => {
    const v = conTarifas();
    v.tarifas[0].lineas = [{ servicio: "loquesea", base: 60, huespedesIncluidos: 2, porHuespedAdicional: 10 }];
    const r = revisarVolcado(v);
    assert.equal(r.tarifas.length, 1);
    assert.match(r.rechazados[0].porque, /ninguna línea/);
  });

  test("un propietario cuya tarifa no viene entra sin tarifa", () => {
    const v = conTarifas();
    v.propietarios[0].tarifaRef = "t-que-no-existe";
    const r = revisarVolcado(v);
    assert.equal(r.propietarios[0].tarifaRef, null);
    assert.match(r.rechazados[0].porque, /entra sin tarifa/);
  });

  test("un precio cerrado de una vivienda que no viene se rechaza", () => {
    const v = conTarifas();
    v.preciosCerrados[0].viviendaRef = "v-que-no-existe";
    const r = revisarVolcado(v);
    assert.deepEqual(r.preciosCerrados, []);
    assert.match(r.rechazados[0].porque, /vivienda/);
  });

  // Hay viviendas que no se facturan: un 0 es una decisión, no un hueco.
  test("un precio cerrado de 0 € sí entra", () => {
    const v = conTarifas();
    v.preciosCerrados[0].precio = 0;
    assert.equal(revisarVolcado(v).preciosCerrados[0].precio, 0);
  });

  // Mejor que valga desde siempre a que no valga nunca.
  test("una tarifa sin fecha de inicio vale desde el principio", () => {
    const v = conTarifas();
    v.tarifas[0].vigenteDesde = null;
    const r = revisarVolcado(v);
    assert.ok(r.tarifas[0].vigenteDesde < new Date("2020-01-01"));
  });

  test("sin tarifas, el volcado sigue valiendo", () => {
    const r = revisarVolcado(volcado());
    assert.deepEqual(r.tarifas, []);
    assert.deepEqual(r.preciosCerrados, []);
  });
});

// ── Las comisiones de canal ───────────────────────────────────────────
//
// Es la parte más delicada del volcado, porque Mirador trae ahí dos números
// que él mismo marca como supuestos y que aquí están comprobados contra
// papeles reales. Si el supuesto pisa al dato, la diferencia no se ve: sale
// directamente en la liquidación de alguien.

/** Los cuatro canales tal como están en `tarifas_canal` de Mirador. */
const conComisiones = () => ({
  ...volcado(),
  viviendas: [
    ...volcado().viviendas,
    { ref: "v3", propietarioRef: "p1", grupoRef: "g1", nombre: "Apto 8206", plazas: 3, lodgifyId: "639390" },
  ],
  comisiones: [
    { canal: "BookingCom", platformPct: 15 as number | string, confirmado: false, nota: "SUPUESTO." },
    { canal: "AirbnbIntegration", platformPct: 15 as number | string, confirmado: false, nota: "SUPUESTO." },
    { canal: "OH", platformPct: 0 as number | string, confirmado: true, nota: "Reserva directa: sin comision de canal." },
    { canal: "Manual", platformPct: 0 as number | string, confirmado: true, nota: "Reserva metida a mano." },
  ],
});

const del = (r: ReturnType<typeof revisarVolcado>, canal: string, viviendaRef: string | null = null) =>
  r.comisiones.find((c) => c.canal === canal && c.viviendaRef === viviendaRef);

describe("las comisiones de canal", () => {
  test("los canales que Mirador da por buenos entran tal cual", () => {
    const r = revisarVolcado(conComisiones());
    assert.equal(del(r, "OH")?.platformPct, 0);
    assert.equal(del(r, "Manual")?.platformPct, 0);
    assert.equal(del(r, "OH")?.confirmado, true);
  });

  // A nulo caería en la comisión bancaria general, que es un 2,5 % que no es
  // el suyo: sería inventarle un cargo a una reserva directa y pagarle de
  // menos al propietario.
  test("un canal de Mirador sin comisión bancaria entra a cero, no a nulo", () => {
    const r = revisarVolcado(conComisiones());
    assert.equal(del(r, "OH")?.bankPct, 0);
    assert.match(del(r, "OH")?.nota ?? "", /no recoge comisión bancaria/);
    assert.match(del(r, "OH")?.nota ?? "", /Reserva directa/, "y no se pierde lo que decía Mirador");
  });

  // El caso que importa: el supuesto no puede pisar al dato comprobado.
  test("el 15 % supuesto de Airbnb no pisa al 15,5 % comprobado", () => {
    const r = revisarVolcado(conComisiones());
    const airbnb = del(r, "AirbnbIntegration");
    assert.equal(airbnb?.platformPct, 15.5);
    assert.equal(airbnb?.confirmado, true);
    assert.equal(airbnb?.bankPct, 0, "Airbnb no lleva comisión bancaria");
    assert.ok(
      r.rechazados.some((x) => /AirbnbIntegration/.test(x.que) && /supuesto/.test(x.porque)),
      "y se dice por qué se ha descartado"
    );
  });

  // Booking coincide en el porcentaje, pero lo de aquí además lleva el 1,3 %
  // del banco, que Mirador no contempla. Quedarse con el suyo perdería eso.
  test("de Booking se queda lo comprobado, que sí trae la comisión bancaria", () => {
    const r = revisarVolcado(conComisiones());
    const booking = del(r, "BookingCom");
    assert.equal(booking?.platformPct, 15);
    assert.equal(booking?.bankPct, 1.3);
  });

  test("el Apto 8206 entra con su 17 %, no con el 15 % general", () => {
    const r = revisarVolcado(conComisiones());
    assert.equal(del(r, "BookingCom", "v3")?.platformPct, 17);
    assert.equal(del(r, "BookingCom")?.platformPct, 15, "y la general no se contagia");
  });

  // El 17 % del Excel está escrito a nombre de «Apto 27», que es como se
  // llamaba Montaña Guerime. Si el alias no llegara hasta aquí, ese piso se
  // liquidaría al 15 % sin que nadie lo notara.
  test("el 17 % del «Apto 27» acaba en Montaña Guerime", () => {
    const v = conComisiones();
    v.viviendas.push({ ref: "v4", propietarioRef: "p1", grupoRef: "g1", nombre: "Montaña Guerime", plazas: 3, lodgifyId: "639389" });
    const r = revisarVolcado(v);
    assert.equal(del(r, "BookingCom", "v4")?.platformPct, 17);
    assert.equal(del(r, "BookingCom")?.platformPct, 15, "y las demás siguen al 15 %");
  });

  // Callárselo dejaría un porcentaje comprobado sin aplicar y nadie se
  // enteraría.
  test("una vivienda contrastada que no viene en el volcado se dice", () => {
    const r = revisarVolcado(conComisiones());
    assert.ok(
      r.avisos.some((x) => /Apto 27/.test(x.que) && /no viene en el volcado/.test(x.porque)),
      "y sale como aviso, no como rechazo: nadie nos lo mandó"
    );
  });

  test("un porcentaje que no es un número se rechaza con su motivo", () => {
    const v = conComisiones();
    v.comisiones.push({ canal: "Expedia", platformPct: "ni idea", confirmado: true, nota: null as never });
    const r = revisarVolcado(v);
    assert.equal(del(r, "Expedia"), undefined);
    assert.ok(r.rechazados.some((x) => /Expedia/.test(x.que) && /porcentaje/.test(x.porque)));
  });

  test("un 120 % no es un porcentaje", () => {
    const v = conComisiones();
    v.comisiones.push({ canal: "Expedia", platformPct: 120, confirmado: true, nota: null as never });
    assert.equal(del(revisarVolcado(v), "Expedia"), undefined);
  });

  // Guardarla como general la aplicaría a todas las viviendas, que es lo
  // contrario de lo que dice.
  test("una comisión de una vivienda que no viene no se guarda como general", () => {
    const v = conComisiones();
    (v.comisiones as unknown[]).push({ canal: "BookingCom", viviendaRef: "v-fantasma", platformPct: 25 });
    const r = revisarVolcado(v);
    assert.equal(del(r, "BookingCom")?.platformPct, 15);
    assert.ok(r.rechazados.some((x) => /su vivienda no viene/.test(x.porque)));
  });

  // Sin esto, un canal nuevo de Mirador entraría con el porcentaje por
  // defecto y sin que nadie lo mirara.
  test("un canal que aquí no está contrastado entra de Mirador", () => {
    const v = conComisiones();
    (v.comisiones as unknown[]).push({ canal: "Expedia", platformPct: 18, confirmado: false, nota: "SUPUESTO." });
    const r = revisarVolcado(v);
    assert.equal(del(r, "Expedia")?.platformPct, 18);
    assert.equal(del(r, "Expedia")?.confirmado, false, "y entra marcado como lo que es");
  });

  // Un volcado viejo, sin comisiones, no puede dejar la aplicación sin
  // ninguna: las contrastadas entran igual.
  test("sin comisiones en el volcado, entran las contrastadas", () => {
    const r = revisarVolcado(volcado());
    assert.ok(r.comisiones.length >= 2);
    assert.ok(r.comisiones.every((c) => c.confirmado));
  });
});

// ── Viviendas que son la misma escrita de dos formas ──────────────────
//
// El peligro no es cosmético: si «Beach & Ocean» y «Beachs & Ocean» acaban
// siendo dos viviendas, las reservas de ese apartamento se reparten entre las
// dos y el informe del propietario sale a la mitad sin que nada falle.

describe("¿son la misma vivienda escrita de otra forma?", () => {
  test("la misma con una letra de más", () => {
    assert.ok(seParecen("Beach & Ocean", "Beachs & Ocean"));
  });

  test("el mismo piso con y sin «Apto»", () => {
    assert.ok(seParecen("8226", "Apto 8226"));
  });

  test("da igual la tilde, la coma y las mayúsculas", () => {
    assert.ok(seParecen("Villa Mónica", "VILLA MONICA"));
    assert.ok(seParecen("24, Montaña Tirba", "24 Montaña Tirba"));
  });

  // Este es el que importa de verdad: unir dos apartamentos distintos
  // mezclaría el histórico de dos propietarios, y eso no lo arregla nadie
  // después.
  test("dos apartamentos consecutivos NO son el mismo", () => {
    assert.equal(seParecen("Apto 8226", "Apto 8241"), false);
    assert.equal(seParecen("24, Montaña Tirba", "25, Montaña Tindaya"), false);
    assert.equal(seParecen("Villa Caliche", "Villa Gregorio"), false);
    assert.equal(seParecen("Sand & Beach", "White Sand"), false);
  });

  // Media cartera se llama por su número. Dos letras de diferencia entre
  // «Apto 8226» y «Apto 8241» no son una errata: son dos pisos distintos.
  test("si los números no coinciden, no son la misma", () => {
    assert.equal(seParecen("24", "25"), false);
    assert.equal(seParecen("Apto 8206", "Apto 8209"), false);
    assert.equal(seParecen("Villa Mónica", "Villa Mónica 2"), false);
  });

  test("un nombre vacío no se parece a nada", () => {
    assert.equal(seParecen("", "Villa Mónica"), false);
  });
});

// ── Los alias confirmados ─────────────────────────────────────────────
//
// «Beachs & Ocean» y «Beach & Ocean» son el mismo apartamento: lo confirmó
// Yurena el 20/09. Un alias confirmado ya no es un parecido que se avisa, es
// una vivienda que se empareja — si no, el histórico de ese piso sale partido
// en dos y el informe del propietario a la mitad.

describe("los alias de vivienda confirmados", () => {
  test("Beachs & Ocean es Beach & Ocean", () => {
    assert.equal(claveDeVivienda("Beachs & Ocean"), claveDeVivienda("Beach & Ocean"));
  });

  test("la clave no depende de tildes ni mayúsculas", () => {
    assert.equal(claveDeVivienda("BEACHS & OCEAN"), claveDeVivienda("Beach & Ocean"));
  });

  test("Apto 27 es Montaña Guerime", () => {
    assert.equal(claveDeVivienda("Apto 27"), claveDeVivienda("Montaña Guerime"));
  });

  test("lo que no es alias no se toca", () => {
    assert.notEqual(claveDeVivienda("Apto 8226"), claveDeVivienda("Apto 8241"));
    assert.equal(claveDeVivienda("Villa Mónica"), "villamonica");
  });

  // Un alias sin saber quién lo dijo es un alias que nadie se atreve a borrar
  // dentro de un año.
  test("cada alias dice quién lo confirmó", () => {
    assert.ok(ALIAS_DE_VIVIENDA.length > 0);
    for (const a of ALIAS_DE_VIVIENDA) {
      assert.ok(a.quien.trim().length > 0, `${a.nombre} no dice quién lo confirmó`);
      assert.notEqual(claveDeVivienda(a.nombre), normalizarClave(a.nombre));
    }
  });
});

/** El nombre normalizado sin pasar por los alias, para la prueba de arriba. */
function normalizarClave(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}
