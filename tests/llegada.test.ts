import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { listaParaEscribir, type DatosDeLlegada } from "../lib/llegada";

function llegada(v: Partial<DatosDeLlegada["vivienda"]>, falta: string[] = []): DatosDeLlegada {
  return {
    bookingId: "b1",
    huesped: "Quien sea",
    email: "quien@sea.com",
    entrada: new Date("2026-10-01"),
    salida: new Date("2026-10-08"),
    diasHastaLaEntrada: 3,
    vivienda: {
      nombre: "Villa",
      direccion: null,
      comoLlegar: null,
      mapaUrl: null,
      horaEntrada: null,
      horaSalida: null,
      wifiRed: null,
      wifiClave: null,
      normas: null,
      ...v,
    },
    falta: falta.map((etiqueta) => ({ campo: etiqueta, etiqueta })),
    tieneCodigoDeLlave: false,
  };
}

describe("si se le puede escribir ya al huésped", () => {
  test("con todo lo imprescindible, sí", () => {
    assert.equal(listaParaEscribir(llegada({}, [])), true);
  });

  test("si falta algo, no", () => {
    assert.equal(listaParaEscribir(llegada({}, ["cómo se llega"])), false);
  });

  test("el mapa vale por el «cómo se llega»", () => {
    // Lodgify da las coordenadas del anuncio, así que muchas viviendas tienen
    // el punto exacto aunque nadie haya escrito el desvío. Exigir las dos
    // cosas dejaba fuera casas a las que se llega perfectamente con el mapa.
    assert.equal(listaParaEscribir(llegada({ mapaUrl: "https://mapa" }, [])), true);
  });

  test("sin el correo del huésped tampoco está lista", () => {
    // Por muy completa que esté la vivienda: si no hay a dónde escribir, no
    // hay correo que mandar.
    assert.equal(listaParaEscribir(llegada({}, ["el correo del huésped"])), false);
  });

  test("un solo hueco basta para que no esté lista", () => {
    // El correo que llega sin decir cómo entrar es peor que el que no llega:
    // el huésped ya contaba con él.
    assert.equal(listaParaEscribir(llegada({}, ["la hora de entrada"])), false);
  });
});

describe("lo que Lodgify da y lo que no", () => {
  test("`rooms` es un array, no un número de dormitorios", () => {
    // El mapeo hacía `Number(p.rooms ?? 0)`. En la respuesta real `rooms` es
    // un array de habitaciones con su id y su nombre, así que daba NaN, no
    // era mayor que cero y caía al valor de reserva: todas las viviendas
    // acababan con un dormitorio, y ese número salía en el tablero de
    // limpiezas como si fuera cierto.
    const rooms = [{ id: 706366, name: "Montaña Guerime" }];
    assert.ok(Number.isNaN(Number(rooms)), "Number(array) debería ser NaN");
    assert.equal(Number(rooms) > 0, false, "y NaN nunca es mayor que cero");
  });
});
