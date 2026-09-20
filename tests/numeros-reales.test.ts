// ¿Salen los mismos números que le salen a Emma?
//
// Esta es la prueba que el resto no puede hacer. Las demás comprueban que el
// código hace lo que dice; esta comprueba que lo que dice es lo que pasa en
// la realidad, contrastándolo con **un informe de verdad** del sistema que
// Inversiones Brito viene recibiendo (semana del 13 al 19 de julio de 2026).
//
// Es una fuente independiente: esos números no salen de este código ni del
// Excel del que se dedujeron las comisiones. Si cuadran al céntimo, la
// configuración de comisiones es la buena.
//
// Sin nombres de huéspedes: aquí solo hacen falta las cifras.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { calculateCommissions, round2 } from "../lib/money";
import { comisionAplicable, type ComisionConfigurada } from "../lib/comisiones-canal";
import { calcularLiquidacion, liquidarPropietario } from "../lib/liquidacion";

/**
 * Las comisiones tal y como habría que configurarlas en Ajustes.
 *
 * El Apto 8206 va al 17 % en Booking y el resto al 15 %. No es un redondeo:
 * se dedujo de 41 reservas del Excel, y este informe —que no tiene nada que
 * ver con aquel— dice exactamente lo mismo.
 */
const APTO_8206 = "p-8206";
const COMISIONES: ComisionConfigurada[] = [
  { canal: "Booking.com", propertyId: APTO_8206, platformPct: 17, bankPct: 1.3 },
  { canal: "Booking.com", propertyId: null, platformPct: 15, bankPct: 1.3 },
  { canal: "Airbnb", propertyId: null, platformPct: 15.5, bankPct: 0 },
];
const POR_DEFECTO = { platformPct: 15, bankPct: 1.3 };

/** Lo que trae el informe, con las cifras que imprime. */
interface FilaDelInforme {
  apartamento: string;
  propertyId: string | null;
  canal: string;
  total: number;
  plataforma: number;
  banco: number;
  aPercibir: number;
}

// Complejo Villa Monikka.
const MONIKKA: FilaDelInforme[] = [
  { apartamento: "Beach & Ocean", propertyId: null, canal: "Booking.com", total: 612.92, plataforma: 91.94, banco: 7.97, aPercibir: 513.01 },
  { apartamento: "Sand & Beach", propertyId: null, canal: "Booking.com", total: 1039.97, plataforma: 156.0, banco: 13.52, aPercibir: 870.45 },
];

// Villa Mónica y sus apartamentos.
const VILLA_MONICA: FilaDelInforme[] = [
  { apartamento: "8241", propertyId: null, canal: "Booking.com", total: 862.77, plataforma: 129.42, banco: 11.22, aPercibir: 722.13 },
  { apartamento: "8226", propertyId: null, canal: "Booking.com", total: 521.16, plataforma: 78.17, banco: 6.78, aPercibir: 436.21 },
  { apartamento: "8206", propertyId: APTO_8206, canal: "Booking.com", total: 148.04, plataforma: 25.17, banco: 1.92, aPercibir: 120.95 },
  { apartamento: "8206", propertyId: APTO_8206, canal: "Booking.com", total: 274.76, plataforma: 46.71, banco: 3.57, aPercibir: 224.48 },
  { apartamento: "Villa Mónica", propertyId: null, canal: "Booking.com", total: 1126.51, plataforma: 168.98, banco: 14.64, aPercibir: 942.89 },
  { apartamento: "8226", propertyId: null, canal: "Booking.com", total: 172.38, plataforma: 25.86, banco: 2.24, aPercibir: 144.28 },
];

/**
 * La tercera reserva del informe: 180 € sin comisión de plataforma y 4,75 €
 * de banco, que es un 2,64 % y no el 1,3 % de las demás.
 *
 * Se deja fuera del contraste a propósito, porque no encaja con ninguna regla
 * configurable: es una reserva sin canal (directa) con una comisión bancaria
 * distinta. Está apuntada como pregunta en `docs/datos-reales.md`.
 */
const LA_RARA = { total: 180, plataforma: 0, banco: 4.75, aPercibir: 175.25 };

const sumar = (filas: FilaDelInforme[]) =>
  filas.reduce(
    (a, f) => ({
      total: round2(a.total + f.total),
      plataforma: round2(a.plataforma + f.plataforma),
      banco: round2(a.banco + f.banco),
      aPercibir: round2(a.aPercibir + f.aPercibir),
    }),
    { total: 0, plataforma: 0, banco: 0, aPercibir: 0 }
  );

describe("las comisiones configuradas reproducen el informe real", () => {
  // Reserva a reserva: es donde se ve si un porcentaje está mal.
  for (const f of [...MONIKKA, ...VILLA_MONICA]) {
    test(`${f.apartamento} · ${f.total} €`, () => {
      const pct = comisionAplicable(f.canal, f.propertyId, COMISIONES, POR_DEFECTO);
      const r = calculateCommissions({
        totalPrice: f.total,
        platformCommissionPct: pct.platformPct,
        bankCommissionPct: pct.bankPct,
      });
      assert.equal(r.platformCommissionAmt, f.plataforma, "comisión de plataforma");
      assert.equal(r.bankCommissionAmt, f.banco, "comisión bancaria");
      assert.equal(r.netAmount, f.aPercibir, "a percibir");
    });
  }

  // El control negativo: con un único porcentaje para todos, el 8206 falla.
  // Es la razón de que la comisión sea por canal Y por vivienda.
  test("con un 15 % para todos, el 8206 no cuadra", () => {
    const f = VILLA_MONICA.find((x) => x.apartamento === "8206")!;
    const r = calculateCommissions({
      totalPrice: f.total,
      platformCommissionPct: 15,
      bankCommissionPct: 1.3,
    });
    assert.notEqual(r.platformCommissionAmt, f.plataforma);
  });
});

describe("los totales del informe, al céntimo", () => {
  test("subtotal de Villa Monikka", () => {
    // Las dos que se pueden reproducir, más la rara que se suma tal cual.
    const s = sumar(MONIKKA);
    assert.equal(round2(s.total + LA_RARA.total), 1832.89);
    assert.equal(round2(s.plataforma + LA_RARA.plataforma), 247.94);
    assert.equal(round2(s.banco + LA_RARA.banco), 26.24);
    assert.equal(round2(s.aPercibir + LA_RARA.aPercibir), 1558.71);
  });

  test("subtotal de Villa Mónica y apartamentos", () => {
    const s = sumar(VILLA_MONICA);
    assert.equal(s.total, 3105.62);
    assert.equal(s.plataforma, 474.31);
    assert.equal(s.banco, 40.37);
    assert.equal(s.aPercibir, 2590.94);
  });

  // Las cuatro cifras que el informe pone arriba del todo.
  test("las cifras de cabecera", () => {
    const m = sumar(MONIKKA);
    const v = sumar(VILLA_MONICA);
    const ingresos = round2(m.total + LA_RARA.total + v.total);
    const comisiones = round2(
      m.plataforma + m.banco + LA_RARA.plataforma + LA_RARA.banco + v.plataforma + v.banco
    );
    const aPercibir = round2(m.aPercibir + LA_RARA.aPercibir + v.aPercibir);

    assert.equal(ingresos, 4938.51, "precio total de las reservas");
    assert.equal(comisiones, 788.86, "comisiones de Booking y banco");
    assert.equal(aPercibir, 4149.65, "a percibir en cuenta");
    // Y que cuadren entre ellas, que es lo que mira el propietario.
    assert.equal(round2(ingresos - comisiones), aPercibir);
  });
});

describe("la liquidación sobre esa misma semana", () => {
  const GASTOS_DE_LA_SEMANA = [400, 23.9, 1035, 400]; // los del informe
  const reservas = [...MONIKKA, ...VILLA_MONICA].map((f) => ({
    totalPrice: f.total,
    platformCommissionAmt: f.plataforma,
    bankCommissionAmt: f.banco,
  }));
  const conLaRara = [
    ...reservas,
    { totalPrice: LA_RARA.total, platformCommissionAmt: 0, bankCommissionAmt: LA_RARA.banco },
  ];

  test("el total de gastos es el que dice el informe", () => {
    assert.equal(round2(GASTOS_DE_LA_SEMANA.reduce((a, b) => a + b, 0)), 1858.9);
  });

  test("lo que queda tras comisiones y gastos", () => {
    const r = calcularLiquidacion({
      reservas: conLaRara,
      gastos: GASTOS_DE_LA_SEMANA,
      managementPct: null,
      cuotaFijaMensual: null,
    });
    assert.equal(r.ingresos, 4938.51);
    assert.equal(r.comisionesDeVenta, 788.86);
    assert.equal(r.gastos, 1858.9);
    assert.equal(r.baseDeGestion, 2290.75); // 4.149,65 − 1.858,90
  });

  // El informe semanal dice al pie: «el cálculo de tu comisión de gestión y
  // la liquidación final se consolidan en el cierre mensual». Es decir, el
  // semanal NO lleva comisión de gestión — y este tampoco, si no se le pone.
  test("sin porcentaje, no se cobra gestión: el semanal no la lleva", () => {
    const r = calcularLiquidacion({
      reservas: conLaRara,
      gastos: GASTOS_DE_LA_SEMANA,
      managementPct: null,
      cuotaFijaMensual: null,
    });
    assert.equal(r.comisionDeGestion, 0);
    assert.equal(r.alPropietario, 2290.75);
  });

  // Y en el cierre mensual, cada grupo con el suyo: Villa Monikka al 10 % y
  // el grupo de Villa Mónica al 30 %.
  test("en el cierre mensual, cada grupo con su porcentaje", () => {
    const r = liquidarPropietario({
      tramos: [
        {
          nombre: "Villa Monikka",
          managementPct: 10,
          reservas: [
            ...MONIKKA.map((f) => ({
              totalPrice: f.total,
              platformCommissionAmt: f.plataforma,
              bankCommissionAmt: f.banco,
            })),
            { totalPrice: LA_RARA.total, platformCommissionAmt: 0, bankCommissionAmt: LA_RARA.banco },
          ],
          gastos: [],
        },
        {
          nombre: "Grupo Villa Mónica",
          managementPct: 30,
          reservas: VILLA_MONICA.map((f) => ({
            totalPrice: f.total,
            platformCommissionAmt: f.plataforma,
            bankCommissionAmt: f.banco,
          })),
          gastos: GASTOS_DE_LA_SEMANA,
        },
      ],
      cuotaFijaMensual: null,
    });

    assert.equal(r.ingresos, 4938.51, "los ingresos no cambian");
    assert.equal(r.comisionesDeVenta, 788.86);
    assert.equal(r.tramos[0].comisionDeGestion, 155.87); // 10 % de 1.558,71
    assert.equal(r.tramos[1].comisionDeGestion, 219.61); // 30 % de 732,04
    assert.equal(r.comisionDeGestion, 375.48);
    assert.equal(r.alPropietario, 1915.27);

    // Con un único porcentaje para los dos grupos saldría otra cosa muy
    // distinta: es lo que justifica el desglose por grupo del informe.
    const deGolpe = calcularLiquidacion({
      reservas: conLaRara,
      gastos: GASTOS_DE_LA_SEMANA,
      managementPct: 30,
      cuotaFijaMensual: null,
    });
    assert.equal(deGolpe.comisionDeGestion, 687.23);
    assert.ok(deGolpe.comisionDeGestion - r.comisionDeGestion > 300);
  });
});
