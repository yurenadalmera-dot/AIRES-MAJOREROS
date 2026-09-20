/**
 * NIF, NIE y CIF: comprobación del dígito de control.
 *
 * Un identificador **inventado** lo evita el esquema, que permite decir «no
 * lo encuentro». Esto protege del **mal leído**, que es otro problema: un 8
 * que se lee B, un 0 que se lee O. Es gratis y caza lecturas malas que
 * ninguna otra comprobación ve.
 *
 * Cuando falla, el valor leído **se conserva**: quien revisa necesita ver qué
 * puso la máquina para compararlo con el papel. Borrarlo la obliga a
 * transcribir desde cero.
 */

const LETRAS_DNI = "TRWAGMYFPDXBNJZSQVHLCKE";

/** Quita espacios, guiones y puntos, y pone en mayúsculas. */
export function normalizarNif(texto: string): string {
  return texto.toUpperCase().replace(/[\s.\-/]/g, "");
}

function letraDeNumero(numero: number): string {
  return LETRAS_DNI[numero % 23];
}

/** Suma las cifras de un número: 14 → 5. */
function sumaDeCifras(n: number): number {
  return String(n)
    .split("")
    .reduce((s, c) => s + Number(c), 0);
}

/**
 * ¿Valida el dígito de control?
 *
 * `false` no quiere decir que la empresa no exista: quiere decir que lo que
 * se ha leído no puede ser un identificador correcto, así que hay una cifra
 * mal. Para un texto vacío devuelve `false` sin más.
 */
export function nifValido(texto: string | null | undefined): boolean {
  if (!texto) return false;
  const v = normalizarNif(texto);

  // DNI: 8 cifras y una letra.
  const dni = v.match(/^(\d{8})([A-Z])$/);
  if (dni) return letraDeNumero(Number(dni[1])) === dni[2];

  // NIE: X, Y o Z delante, que valen 0, 1 y 2.
  const nie = v.match(/^([XYZ])(\d{7})([A-Z])$/);
  if (nie) {
    const prefijo = "XYZ".indexOf(nie[1]);
    return letraDeNumero(Number(`${prefijo}${nie[2]}`)) === nie[3];
  }

  // CIF: letra de tipo, 7 cifras y un control que según el tipo es cifra,
  // letra, o cualquiera de los dos.
  const cif = v.match(/^([ABCDEFGHJNPQRSUVW])(\d{7})([0-9A-J])$/);
  if (cif) {
    const [, tipo, cifras, control] = cif;
    const d = cifras.split("").map(Number);
    // Posiciones pares (2ª, 4ª, 6ª) tal cual; impares, dobladas y sumadas
    // sus cifras.
    const pares = d[1] + d[3] + d[5];
    const impares = [d[0], d[2], d[4], d[6]].reduce((s, n) => s + sumaDeCifras(n * 2), 0);
    const esperado = (10 - ((pares + impares) % 10)) % 10;

    if ("PQRSNW".includes(tipo)) return control === "JABCDEFGHI"[esperado];
    if ("ABEH".includes(tipo)) return control === String(esperado);
    // Los demás admiten las dos formas.
    return control === String(esperado) || control === "JABCDEFGHI"[esperado];
  }

  return false;
}
