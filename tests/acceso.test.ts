import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MAX_SOLICITUDES_POR_HORA,
  MINIMO_CONTRASENA,
  destinoTrasEntrar,
  enlaceUtilizable,
  esRutaPropia,
  motivoContrasenaNoValida,
  puedePedirOtroEnlace,
  puedeRecuperarPorCorreo,
} from "../lib/acceso";

/**
 * Entrar, cambiar la contraseña y recuperarla.
 *
 * Son las reglas que deciden si alguien entra o se queda fuera, y fallan en
 * silencio: una contraseña de un solo uso que no obliga a nada sigue dejando
 * entrar, y un enlace caducado que todavía abre no avisa a nadie.
 */

const fuente = (ruta: string) => readFileSync(join(import.meta.dirname, "..", ruta), "utf8");

describe("la contraseña de un solo uso", () => {
  test("quien entra con ella va a cambiarla, no a donde iba", () => {
    // Ni a su panel ni a la página que traía en la dirección: lo primero es
    // ponerse la suya.
    assert.equal(destinoTrasEntrar({ debeCambiar: true, next: "/rental/bookings", inicio: "/rental" }), "/cuenta");
    assert.equal(destinoTrasEntrar({ debeCambiar: true, next: null, inicio: "/cleaning" }), "/cuenta");
  });

  test("con su contraseña de siempre, cada quien empieza en su sitio", () => {
    assert.equal(destinoTrasEntrar({ debeCambiar: false, next: null, inicio: "/cleaning" }), "/cleaning");
    assert.equal(destinoTrasEntrar({ debeCambiar: false, next: "/rental/gastos", inicio: "/rental" }), "/rental/gastos");
    assert.equal(destinoTrasEntrar({ debeCambiar: false, next: null, inicio: undefined }), "/rental");
  });

  test("el alta y el restablecimiento la marcan, y cambiarla la desmarca", () => {
    // Las tres escrituras viven en el mismo fichero. Si una pierde la marca,
    // nada falla: simplemente la contraseña que conoce administración vuelve
    // a valer para siempre, que es lo que había antes.
    const codigo = fuente("lib/actions/usuarios.ts");
    const marcan = codigo.match(/mustChangePassword: true/g) ?? [];
    const desmarcan = codigo.match(/mustChangePassword: false/g) ?? [];
    assert.equal(marcan.length, 2, "crearUsuario y restablecerContrasena deben marcarla las dos");
    assert.equal(desmarcan.length, 1, "cambiarMiContrasena debe quitar la marca");
  });

  test("mientras no la cambie, no pasa de ninguna pantalla ni ejecuta ninguna acción", () => {
    // Las pantallas pasan todas por `requireBusinessContext` y las acciones
    // por `exigir`: son los dos únicos sitios donde hay que cerrar.
    assert.match(
      fuente("lib/business-context.ts"),
      /if \(session\.debeCambiarContrasena\) redirect\("\/cuenta"\)/
    );
    assert.match(fuente("lib/auth.ts"), /if \(session\.debeCambiarContrasena\) throw/);
  });

  test("la marca sale de la base de datos, no de la cookie", () => {
    // En la cookie duraría lo que dure la cookie: restablecerle la contraseña
    // a alguien con la sesión abierta no le obligaría a nada en un mes.
    const codigo = fuente("lib/auth.ts");
    const desde = codigo.indexOf("interface TokenPayload");
    const cookie = codigo.slice(desde, codigo.indexOf("}", desde));
    assert.match(cookie, /userId/, "no se ha encontrado lo que viaja en la cookie");
    assert.doesNotMatch(cookie, /debeCambiarContrasena|mustChangePassword/);
    assert.match(codigo, /debeCambiarContrasena: user\.mustChangePassword/);
  });
});

describe("a dónde lleva «next» después de entrar", () => {
  test("solo a rutas de esta aplicación", () => {
    // `next` lo escribe cualquiera en la dirección. Un correo falso con
    // «entra aquí» llevaría al login de verdad y, después de entrar, adonde
    // quisiera quien lo mandó.
    const deFuera = [
      "//otro-sitio.com",
      "https://otro-sitio.com",
      "/\\otro-sitio.com",
      "javascript:alert(1)",
      // El navegador quita tabuladores y saltos de línea antes de leer la
      // dirección: «barra, tabulador, barra» acaba siendo «//».
      "/\t/otro-sitio.com",
      "/\n/otro-sitio.com",
      "/\r/otro-sitio.com",
    ];
    for (const fuera of deFuera) {
      assert.equal(esRutaPropia(fuera), false, fuera);
      assert.equal(destinoTrasEntrar({ debeCambiar: false, next: fuera, inicio: "/cleaning" }), "/cleaning");
    }
    assert.equal(esRutaPropia("/rental/bookings?mes=10"), true);
  });
});

describe("la contraseña nueva", () => {
  test(`tiene que tener al menos ${MINIMO_CONTRASENA} caracteres`, () => {
    assert.ok(motivoContrasenaNoValida("a".repeat(MINIMO_CONTRASENA - 1), "a".repeat(MINIMO_CONTRASENA - 1)));
    assert.equal(motivoContrasenaNoValida("a".repeat(MINIMO_CONTRASENA), "a".repeat(MINIMO_CONTRASENA)), null);
  });

  test("y coincidir con su repetición", () => {
    assert.match(motivoContrasenaNoValida("una-contraseña-larga", "otra-contraseña-larga") ?? "", /no coinciden/);
  });
});

describe("el enlace de «he olvidado mi contraseña»", () => {
  const ahora = new Date("2026-10-05T12:00:00Z");
  const dentroDeDiez = new Date("2026-10-05T12:10:00Z");
  const haceUnMinuto = new Date("2026-10-05T11:59:00Z");

  test("vale mientras no caduque", () => {
    assert.equal(enlaceUtilizable({ caducaEl: dentroDeDiez, usadaEl: null, usuarioActivo: true }, ahora), true);
  });

  test("caducado no abre nada, ni por un segundo", () => {
    assert.equal(enlaceUtilizable({ caducaEl: haceUnMinuto, usadaEl: null, usuarioActivo: true }, ahora), false);
    assert.equal(enlaceUtilizable({ caducaEl: ahora, usadaEl: null, usuarioActivo: true }, ahora), false);
  });

  test("sirve una sola vez", () => {
    // Usado y sin caducar: quien encuentre el correo después no puede volver
    // a cambiar la contraseña con él.
    assert.equal(enlaceUtilizable({ caducaEl: dentroDeDiez, usadaEl: haceUnMinuto, usuarioActivo: true }, ahora), false);
  });

  test("una petición que todavía no ha salido por correo no abre nada", () => {
    // Sin fecha de caducidad es que el enlace aún no existe. Si esto diera
    // `true`, una petición sin enviar sería una llave sin fecha de fin.
    assert.equal(enlaceUtilizable({ caducaEl: null, usadaEl: null, usuarioActivo: true }, ahora), false);
  });

  test("a quien se ha dado de baja no le devuelve el acceso", () => {
    assert.equal(enlaceUtilizable({ caducaEl: dentroDeDiez, usadaEl: null, usuarioActivo: false }, ahora), false);
  });

  test("no se puede pedir sin parar", () => {
    assert.equal(puedePedirOtroEnlace(0), true);
    assert.equal(puedePedirOtroEnlace(MAX_SOLICITUDES_POR_HORA - 1), true);
    assert.equal(puedePedirOtroEnlace(MAX_SOLICITUDES_POR_HORA), false);
  });

  test("la cuenta de administración no se recupera por correo", () => {
    // El enlace se le entrega a n8n, que lo recoge con el token de Ajustes.
    // Si pudiera ser el de administración, ese token abriría la aplicación
    // entera a quien lo tuviera, sin que saliera un solo correo.
    assert.equal(puedeRecuperarPorCorreo("ADMIN"), false);
    for (const rol of ["RENTAL_MANAGER", "PARTNER", "STAFF"]) {
      assert.equal(puedeRecuperarPorCorreo(rol), true, rol);
    }
    // Y se comprueba en los tres momentos: al pedirlo, al entregarlo y al usarlo.
    const codigo = fuente("lib/recuperacion.ts");
    assert.equal((codigo.match(/puedeRecuperarPorCorreo\(/g) ?? []).length, 2);
    assert.match(codigo, /role: \{ not: "ADMIN" \}/);
  });

  test("pedirlo contesta lo mismo exista o no la cuenta", () => {
    // La ruta no puede devolver nada que dependa de lo que encuentre: ni un
    // «ese correo no está», ni un código distinto.
    const ruta = fuente("app/api/auth/recuperar/route.ts");
    assert.match(ruta, /await pedirRecuperacion\(parsed\.data\.email\);\s+return NextResponse\.json\(\{ ok: true \}, \{ headers: SIN_CACHE \}\);/);
    assert.match(fuente("lib/recuperacion.ts"), /export async function pedirRecuperacion\(correo: string\): Promise<void>/);
  });

  test("en la base queda la huella del enlace, nunca el enlace", () => {
    const codigo = fuente("lib/recuperacion.ts");
    assert.match(codigo, /huella: huellaDelToken\(token\)/);
    assert.doesNotMatch(codigo, /data: \{[^}]*\btoken\b[,\s}]/);
  });
});

describe("lo que se puede abrir sin sesión", () => {
  const middleware = fuente("middleware.ts");

  test("pedir el enlace y usarlo, que son de quien no puede entrar", () => {
    for (const ruta of ['"/recuperar"', '"/api/auth/recuperar"', '"/api/recuperaciones"', '"/restablecer/"']) {
      assert.ok(middleware.includes(ruta), `${ruta} tiene que estar abierta: si no, quien ha olvidado la contraseña acaba en el login.`);
    }
  });

  test("pero «Mi cuenta» no", () => {
    assert.doesNotMatch(middleware, /"\/cuenta"/);
  });
});

describe("restablecerle la contraseña a alguien", () => {
  test("a una misma no: se quedaría fuera sin haber visto la nueva", () => {
    // La contraseña nueva se enseña en Ajustes, pero al marcarla como de un
    // solo uso Ajustes manda a «Mi cuenta» antes de que se llegue a ver.
    const accion = fuente("lib/actions/usuarios.ts");
    const cuerpo = accion.slice(accion.indexOf("export async function restablecerContrasena"), accion.indexOf("export async function setUsuarioActivo"));
    assert.match(cuerpo, /session\?\.userId === userId/);
    assert.match(fuente("components/GestionUsuarios.tsx"), /disabled=\{pending \|\| u\.esYo\}[\s\S]{0,200}restablecerContrasena/);
  });
});

describe("las cuentas que crea el arranque", () => {
  test("no recrean a quien ya tiene su correo de verdad", () => {
    // El arranque crea las cuentas de esta lista que no encuentre por correo.
    // Con Emma y Alejandra en ella, cambiarles el correo en Ajustes las haría
    // reaparecer en el siguiente despliegue con su contraseña inicial.
    const codigo = fuente("lib/altas-iniciales.ts");
    const lista = codigo.slice(codigo.indexOf("}[] = ["), codigo.indexOf("];"));
    assert.doesNotMatch(lista, /emma@|alejandra@/);
  });
});
