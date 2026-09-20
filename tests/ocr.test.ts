// Pruebas de la lectura automática de facturas.
//
// El fallo que todo esto existe para evitar: que un dato inventado o mal
// leído llegue a la liquidación de un propietario sin que nadie lo note. Un
// hueco se rellena en dos segundos; un número inventado se cuela en silencio.
//
//   npm test
//
// Ninguna llama al modelo: lo que se prueba es lo que hace el código con la
// respuesta, que es donde está la garantía.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { nifValido, normalizarNif } from "../lib/ocr/nif";
import { revisarFactura, volcar } from "../lib/ocr/validacion";
import { ESQUEMA_FACTURA, CERO_SOSPECHOSO } from "../lib/ocr/esquema";
import { leerImporte } from "../lib/money";

/** Una lectura correcta de una factura de la luz, para ir variándola. */
const buena = {
  fecha: "2026-08-18",
  num_documento: "FE26-00123",
  proveedor_literal: "Endesa Energía, S.A.U.",
  proveedor_id: null,
  nif_proveedor: "12345678Z",
  concepto: "Luz de agosto",
  base: 112.62,
  impuesto_pct: "7%",
  impuesto: 7.88,
  total: 120.5,
  vivienda_id: null,
  confianza: "alta",
  avisos: [],
};
const hoy = new Date("2026-09-20T12:00:00.000Z");
const revisar = (cambios: Record<string, unknown> = {}, ctx = {}) =>
  revisarFactura({ ...buena, ...cambios }, { hoy, ...ctx });

describe("importes escritos como los escribe la gente", () => {
  test("coma decimal y punto de miles", () => {
    assert.equal(leerImporte("120,50"), 120.5);
    assert.equal(leerImporte("1.234,56"), 1234.56);
    assert.equal(leerImporte("1.234,56 €"), 1234.56);
  });

  // El fallo real: `replace(",", ".")` dejaba «1.234.56», que es NaN. Todo
  // gasto de más de mil euros escrito con puntos era imposible de apuntar.
  test("«1.234,56» no acaba en NaN", () => {
    assert.equal(leerImporte("1.234,56"), 1234.56);
  });

  test("un único punto seguido de tres cifras es de miles", () => {
    assert.equal(leerImporte("1.234"), 1234);
    assert.equal(leerImporte("120.500"), 120500);
  });

  test("y seguido de una o dos, es decimal", () => {
    assert.equal(leerImporte("120.50"), 120.5);
    assert.equal(leerImporte("1.5"), 1.5);
  });

  // Nunca 0: un hueco genera una pregunta, un cero se contabiliza solo.
  test("lo que no es un número da null, no cero", () => {
    for (const v of ["", "   ", "N/A", "ocho euros", null, undefined, {}]) {
      assert.equal(leerImporte(v), null, String(v));
    }
  });

  test("un cero escrito sí es cero", () => {
    assert.equal(leerImporte("0"), 0);
    assert.equal(leerImporte(0), 0);
  });
});

describe("NIF, NIE y CIF", () => {
  test("el DNI de toda la vida", () => {
    assert.equal(nifValido("12345678Z"), true);
    assert.equal(nifValido("12345678A"), false);
  });

  test("con espacios y guiones también", () => {
    assert.equal(normalizarNif(" 12345678-z "), "12345678Z");
    assert.equal(nifValido(" 12345678-z "), true);
  });

  test("NIE", () => {
    // X0000000T: 0 % 23 = 0 → T.
    assert.equal(nifValido("X0000000T"), true);
    assert.equal(nifValido("X0000000A"), false);
  });

  test("CIF con control numérico", () => {
    // B1234567: pares 2+4+6=12; impares 2,6,10→1,14→5 = 14; total 26 → 4.
    assert.equal(nifValido("B12345674"), true);
    assert.equal(nifValido("B12345678"), false);
  });

  test("CIF con control en letra", () => {
    // Los tipos PQRSNW llevan letra: la 4ª de "JABCDEFGHI" es la D.
    assert.equal(nifValido("P1234567D"), true);
    assert.equal(nifValido("P1234567E"), false);
  });

  // Es lo que caza un 8 leído como B o un 0 leído como O.
  test("una cifra cambiada lo invalida", () => {
    assert.equal(nifValido("B12345674"), true);
    assert.equal(nifValido("B12335674"), false);
  });

  // Conviene saberlo: el dígito de control NO caza los rellenos de compromiso.
  // B00000000 valida (control 0 sobre siete ceros), así que un proveedor con
  // ese CIF pasa esta comprobación y hay que mirarlo por otro lado.
  test("un CIF de relleno como B00000000 valida igual", () => {
    assert.equal(nifValido("B00000000"), true);
  });

  test("lo que no tiene forma de identificador", () => {
    for (const v of ["", "N/A", "12345678", "ABC", null, undefined]) {
      assert.equal(nifValido(v), false, String(v));
    }
  });
});

describe("el esquema deja decir «no lo encuentro»", () => {
  // Lo contraintuitivo: obligatorio Y anulable. Sin el null, el modelo no
  // puede callarse y escribe «N/A», un 0, o el NIF del pie de página.
  test("todo campo que puede faltar admite null", () => {
    const p = ESQUEMA_FACTURA.properties as Record<string, { type: unknown }>;
    for (const campo of ["fecha", "nif_proveedor", "base", "impuesto", "total", "vivienda_id"]) {
      assert.ok(
        Array.isArray(p[campo].type) && (p[campo].type as string[]).includes("null"),
        `${campo} tiene que admitir null`
      );
    }
  });

  test("y aun así está en required", () => {
    for (const campo of ["fecha", "nif_proveedor", "base", "total"]) {
      assert.ok((ESQUEMA_FACTURA.required as readonly string[]).includes(campo), campo);
    }
  });

  // El techo se alcanza en silencio: el esquema funciona hasta que alguien
  // añade un campo anulable razonable y la extracción entera devuelve 400,
  // con un error que no menciona el campo nuevo.
  test("no pasa de 16 tipos unión (la API responde 400 en 17)", () => {
    const union = Object.values(ESQUEMA_FACTURA.properties).filter(
      (v) => Array.isArray((v as { type: unknown }).type)
    );
    assert.ok(
      union.length <= 16,
      `Hay ${union.length} propiedades anulables. Para añadir otra hay que quitarle el null ` +
        "a una descriptiva, nunca a un identificador ni a un importe."
    );
  });

  test("todo lo del esquema está en required", () => {
    assert.deepEqual(
      Object.keys(ESQUEMA_FACTURA.properties).sort(),
      [...(ESQUEMA_FACTURA.required as readonly string[])].sort()
    );
  });
});

describe("la regla del cero", () => {
  test("un total de 0 € es un hueco, no un importe", () => {
    const r = revisar({ total: 0 });
    assert.equal(r.datos.total, 120.5); // se recupera del cuadre: 112,62 + 7,88
    assert.ok(r.avisos.some((a) => /se ha deducido/i.test(a)));
  });

  test("sin nada de donde deducirlo, queda el hueco y se reclama", () => {
    const r = revisar({ total: 0, base: null, impuesto: null });
    assert.equal(r.datos.total, null);
    assert.ok(r.avisos.some((a) => /No hemos encontrado el total/i.test(a)));
    assert.notEqual(r.confianza, "alta");
  });

  // ESTA es la prueba que caza la regresión si alguien reordena los bloques.
  // Con la regla del cero después del cuadre, `hay(0)` es true: la rama que
  // deduce no se ejecuta nunca y el dato se pierde teniéndolo al alcance.
  test("0 y null dan exactamente el mismo resultado", () => {
    for (const campo of ["base", "impuesto", "total"]) {
      const conCero = revisar({ [campo]: 0 });
      const conNull = revisar({ [campo]: null });
      assert.deepEqual(
        conCero.datos,
        conNull.datos,
        `${campo}: un 0 y un null tienen que acabar igual`
      );
      assert.equal(conCero.confianza, conNull.confianza, campo);
    }
  });

  test("la cobertura está decidida campo por campo", () => {
    assert.deepEqual(
      CERO_SOSPECHOSO.map(([c]) => c),
      ["base", "total"]
    );
  });

  // El matiz: un cero es real cuando otro campo del documento lo respalda.
  test("una cuota a cero con un 0 % impreso sí es cero", () => {
    for (const pct of ["0%", "0 %", "exento", "Exenta", "0,00%"]) {
      const r = revisar({ impuesto: 0, impuesto_pct: pct, base: 120.5, total: 120.5 });
      assert.equal(r.datos.impuesto, 0, pct);
    }
  });

  test("y sin un tipo que lo justifique, es un hueco", () => {
    const r = revisar({ impuesto: 0, impuesto_pct: "7%", base: 112.62, total: 120.5 });
    assert.equal(r.datos.impuesto, 7.88); // deducido del total menos la base
    assert.ok(r.avisos.some((a) => /deducido/i.test(a)));
  });
});

describe("cuadres por contraste", () => {
  test("falta la cuota y se deduce de los otros dos", () => {
    const r = revisar({ impuesto: null });
    assert.equal(r.datos.impuesto, 7.88);
    assert.equal(r.confianza, "media");
  });

  test("falta la base y se deduce", () => {
    const r = revisar({ base: null });
    assert.equal(r.datos.base, 112.62);
  });

  test("falta el total y se deduce", () => {
    const r = revisar({ total: null });
    assert.equal(r.datos.total, 120.5);
  });

  // Están los tres y no cuadran: uno se ha leído mal y no se sabe cuál. No se
  // corrige ninguno — avisar es lo único honesto.
  test("si los tres están y no cuadran, no se corrige nada", () => {
    const r = revisar({ base: 1240, impuesto: 86.8, total: 1316.8 });
    assert.equal(r.datos.base, 1240);
    assert.equal(r.datos.impuesto, 86.8);
    assert.equal(r.datos.total, 1316.8);
    assert.equal(r.confianza, "baja");
    assert.ok(r.avisos.some((a) => /no cuadran/i.test(a)));
    assert.ok(r.motivos.includes("el total no cuadra"));
  });

  test("un redondeo de un céntimo no se considera descuadre", () => {
    const r = revisar({ base: 112.62, impuesto: 7.88, total: 120.51 });
    assert.equal(r.confianza, "alta");
    assert.equal(r.motivos.length, 0);
  });
});

describe("ids que se inventa el modelo", () => {
  test("un proveedor que no está en el catálogo se deja sin asignar", () => {
    const r = revisar({ proveedor_id: "prov-inventado" }, { proveedores: ["prov-endesa"] });
    assert.equal(r.datos.proveedor_id, null);
    assert.equal(r.confianza, "baja");
  });

  test("uno que sí está se respeta", () => {
    const r = revisar({ proveedor_id: "prov-endesa" }, { proveedores: ["prov-endesa"] });
    assert.equal(r.datos.proveedor_id, "prov-endesa");
  });

  // Una factura asignada a la vivienda equivocada le descuenta el gasto a un
  // propietario que no lo pagó. Sin asignar es mucho menos malo.
  test("una vivienda inventada se deja sin asignar", () => {
    const r = revisar({ vivienda_id: "casa-que-no-existe" }, { viviendas: ["viv-1"] });
    assert.equal(r.datos.vivienda_id, null);
    assert.ok(r.avisos.some((a) => /vivienda/i.test(a)));
  });
});

describe("identificadores y fechas mal leídos", () => {
  test("un NIF que no valida se avisa pero se conserva", () => {
    const r = revisar({ nif_proveedor: "12345678A" });
    assert.equal(r.datos.nif_proveedor, "12345678A", "hay que poder compararlo con el papel");
    assert.ok(r.avisos.some((a) => /NIF/i.test(a)));
    assert.ok(r.motivos.includes("el NIF no valida"));
  });

  test("un 31 de febrero es una lectura mala", () => {
    const r = revisar({ fecha: "2026-02-31" });
    assert.equal(r.confianza, "baja");
    assert.ok(r.avisos.some((a) => /no existe/i.test(a)));
  });

  // Un año mal leído manda la factura al trimestre equivocado, en silencio.
  test("una fecha futura no cuela", () => {
    const r = revisar({ fecha: "2027-01-05" });
    assert.equal(r.confianza, "baja");
    assert.ok(r.avisos.some((a) => /futura/i.test(a)));
  });

  test("la fecha de hoy sí vale", () => {
    assert.equal(revisar({ fecha: "2026-09-20" }).confianza, "alta");
  });
});

describe("fiabilidad y marcado", () => {
  test("una lectura limpia va arriba del todo", () => {
    const r = revisar();
    assert.equal(r.fiabilidad, 1);
    assert.deepEqual(r.faltantes, []);
    assert.deepEqual(r.motivos, []);
  });

  test("los motivos van con el número, no sueltos", () => {
    const r = revisar({ base: 1240, impuesto: 86.8, total: 1316.8, nif_proveedor: "B12345678" });
    assert.ok(r.fiabilidad < 0.5, String(r.fiabilidad));
    assert.ok(r.motivos.length >= 2, r.motivos.join(", "));
  });

  // Sin el ámbar, un campo vacío porque el modelo no lo encontró es
  // indistinguible de uno vacío porque no aplica, y se confirma sin rellenar.
  test("lo que la máquina no encontró se marca aparte", () => {
    const r = revisar({ fecha: null, total: null, base: null, impuesto: null });
    assert.ok(r.faltantes.includes("fecha"));
    assert.ok(r.faltantes.includes("total"));
    assert.ok(!r.rellenadosPorIa.includes("fecha"));
    assert.ok(r.rellenadosPorIa.includes("concepto"));
  });

  test("la confianza solo empeora, nunca mejora", () => {
    // El modelo dice «alta» y el código encuentra tres problemas.
    const r = revisar({
      confianza: "alta",
      base: 1240,
      impuesto: 86.8,
      total: 1316.8,
      nif_proveedor: "B12345678",
    });
    assert.equal(r.confianza, "baja");
  });

  test("y una «baja» del modelo no la sube el código", () => {
    assert.equal(revisar({ confianza: "baja" }).confianza, "baja");
  });
});

describe("respuestas raras del modelo", () => {
  // El esquema estricto lo hace improbable, pero el día que pase no debe
  // tumbar nada: el archivo ya está guardado y se rellena a mano.
  test("no revienta con basura", () => {
    for (const basura of [null, undefined, {}, [], "texto suelto", 42]) {
      const r = revisarFactura(basura, { hoy });
      assert.equal(r.datos.total, null, String(basura));
      assert.ok(r.faltantes.length > 0);
    }
  });

  test("un «N/A» de texto no se cuela como dato", () => {
    const r = revisar({ nif_proveedor: "N/A", num_documento: "  " });
    assert.equal(r.datos.num_documento, null);
    assert.ok(r.avisos.some((a) => /NIF/i.test(a)));
  });

  test("los avisos del modelo se conservan junto a los del código", () => {
    const r = revisar({ avisos: ["La factura lleva IVA y no IGIC."], base: null, impuesto: null });
    assert.ok(r.avisos.some((a) => /IVA/.test(a)), "el del modelo");
    assert.ok(r.avisos.length >= 1);
  });
});

describe("volcado al formulario", () => {
  // Si alguien empezó a rellenar a mano mientras la lectura iba por detrás,
  // su trabajo gana.
  test("no pisa lo que ya escribió una persona", () => {
    const { formulario, rellenados } = volcar(
      { concepto: "Lo que escribí yo", total: "" },
      { concepto: "Luz de agosto", total: 120.5 }
    );
    assert.equal(formulario.concepto, "Lo que escribí yo");
    assert.equal(formulario.total, 120.5);
    assert.deepEqual(rellenados, ["total"]);
  });

  test("un null del modelo nunca borra nada", () => {
    const { formulario } = volcar({ concepto: "Agua" }, { concepto: null });
    assert.equal(formulario.concepto, "Agua");
  });
});
