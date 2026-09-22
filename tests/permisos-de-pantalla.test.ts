import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { puede } from "../lib/permisos";

/**
 * Ninguna pantalla puede quedarse sin decir quién entra.
 *
 * `requireBusinessContext()` acepta el permiso como opcional, que es cómodo y
 * es justo el fallo: tres fichas —una reserva, una vivienda y una factura— se
 * quedaron sin él. Los listados sí lo pedían, así que desde fuera parecía
 * cerrado, pero escribiendo la dirección a mano se llegaba igual. Y la ficha
 * de la reserva lleva documentos de identidad de los huéspedes.
 *
 * Esta prueba no comprueba un caso: comprueba que no queda ninguno.
 */
function pantallas(dir: string, encontradas: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) pantallas(ruta, encontradas);
    else if (entrada === "page.tsx") encontradas.push(ruta);
  }
  return encontradas;
}

describe("toda pantalla dice quién puede verla", () => {
  const raiz = join(import.meta.dirname, "..", "app");

  for (const negocio of ["rental", "cleaning"]) {
    for (const ruta of pantallas(join(raiz, negocio))) {
      const relativa = ruta.slice(raiz.length + 1);
      test(relativa, () => {
        const codigo = readFileSync(ruta, "utf8");
        const llamada = codigo.match(/requireBusinessContext\(([^)]*)\)/);
        assert.ok(llamada, `${relativa} no comprueba la sesión.`);
        assert.notEqual(
          llamada[1].trim(),
          "",
          `${relativa} deja entrar a cualquiera con sesión: le falta el permiso.`
        );
      });
    }
  }
});

describe("quién es quién", () => {
  test("Emma (alquiler) puede completar los datos del propietario que da de alta", () => {
    // Podía crear un propietario y no ponerle el NIF: se creaba a medias y
    // el dato acababa en un papel.
    assert.equal(puede("RENTAL_MANAGER", "operativa.alquiler"), true);
  });

  test("Emma no toca el reparto entre las socias ni las cuentas", () => {
    assert.equal(puede("RENTAL_MANAGER", "administracion"), false);
    assert.equal(puede("RENTAL_MANAGER", "facturacion"), false);
  });

  test("las socias de limpiezas no ven la operativa de alquiler", () => {
    // Las reservas, los propietarios y sus ingresos son de la otra empresa.
    assert.equal(puede("PARTNER", "operativa.alquiler"), false);
  });

  test("quien limpia solo puede mover el estado de su trabajo", () => {
    assert.equal(puede("STAFF", "operativa.estado_tarea"), true);
    assert.equal(puede("STAFF", "facturacion"), false);
    assert.equal(puede("STAFF", "operativa.alquiler"), false);
    assert.equal(puede("STAFF", "operativa.limpiezas"), false);
  });
});
