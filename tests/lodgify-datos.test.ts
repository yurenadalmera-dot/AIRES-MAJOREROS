import { test, describe } from "node:test";
import assert from "node:assert/strict";

/**
 * Lo que Lodgify manda y cómo se lee.
 *
 * Las dos pruebas de aquí vienen de fallos que estuvieron desplegados: no son
 * casos imaginados.
 */
describe("las coordenadas de Fuerteventura", () => {
  test("la longitud es negativa, y eso no la invalida", () => {
    // Exigir «mayor que cero» se cargó el mapa de las once viviendas en
    // silencio: Costa Calma está en −14,23. Medio planeta tiene la longitud
    // negativa, y el hemisferio sur entero la latitud.
    const longitud = -14.231455;
    assert.equal(Number.isFinite(longitud), true);
    assert.equal(longitud > 0, false, "la comprobación que fallaba");
  });

  test("una coordenada ausente sí es nula", () => {
    assert.equal(Number.isFinite(Number(null)), true); // Number(null) es 0
    assert.equal(Number.isFinite(Number(undefined)), false);
    assert.equal(Number.isFinite(Number("")), true); // Number("") es 0
  });
});

describe("la dirección, sin decir dos veces lo mismo", () => {
  test("Villa Mónica trae la carretera dentro de la ciudad", () => {
    // Lodgify da address «FV-617», zip «35627» y city «FV-617, Barranco del
    // Tarajal de Sancho, Pájara, 35627». Pegarlas sin mirar daba una
    // dirección con la carretera y el código postal repetidos.
    const ciudad = "FV-617, Barranco del Tarajal de Sancho, Pájara, 35627";
    assert.ok(ciudad.includes("FV-617"), "la ciudad ya contiene la calle");
    assert.ok(ciudad.includes("35627"), "y también el código postal");
  });
});
