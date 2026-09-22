import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { listaParaEscribir, type DatosDeLlegada } from "../lib/llegada";

function llegada(v: Partial<DatosDeLlegada["vivienda"]>, falta: string[] = []): DatosDeLlegada {
  return {
    bookingId: "b1",
    huesped: "Quien sea",
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

  test("un solo hueco basta para que no esté lista", () => {
    // El correo que llega sin decir cómo entrar es peor que el que no llega:
    // el huésped ya contaba con él.
    assert.equal(listaParaEscribir(llegada({}, ["la hora de entrada"])), false);
  });
});
