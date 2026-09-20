# Datos reales: lo confirmado y lo que falta

Lo que se sabe de la cartera y de los números, para no perderlo por el camino. Sale de los dos
Excel de reservas de 2026 y de lo que han ido confirmando Yurena y Emma.

## El camino, por orden

1. Pegar la clave de Lodgify en **Alquileres → Ajustes → Integración con Lodgify**.
2. Configurar las **comisiones por canal y vivienda** (ver más abajo). Antes de sincronizar: así
   las reservas entran ya con el porcentaje bueno.
3. Vaciar lo de demostración en **Ajustes → Datos de la aplicación → Empezar de cero**.
4. **Sincronizar**: entran las viviendas de Lodgify con sus reservas y sus limpiezas.
5. Dar de alta a mano las que **no** están en Lodgify (Villa Caliche y Villa Gregorio).
6. **Propietarios**, y asignar cada vivienda al suyo.
7. **Precio de limpieza** de cada vivienda. Al guardarlo se aplica también a sus limpiezas
   todavía no facturadas.

Sincronizar dos veces no duplica nada. Lo que se rellena a mano —propietario, precio, estado— no
lo pisa una sincronización posterior, y una vivienda dada de alta a mano (sin identificador de
Lodgify) no la toca nunca.

## La cartera

| Vivienda | Entra por | Propietario |
|---|---|---|
| Apto 27, Apto 27 A, Apto 8206, Apto 8209, Apto 8226, Apto 8241 | Lodgify | *pendiente* |
| Villa Mónica (la villa) | Lodgify | **Inversiones Brito** |
| Apto 24 «Montaña Tirba», Apto 25 «Montaña Tindaya» (la academia) | Lodgify | *pendiente* |
| **Villa Caliche, Villa Gregorio** | **a mano** | **Costa Calma Express Inmobiliaria S.L.** |

- **Grupo Villa Monika** son **cinco apartamentos**; **Villa Mónica** es **la villa**, una sola
  casa. Eran dos cosas distintas, no un nombre mal escrito — era la duda que tenía Emma.
  *Falta saber cuáles de los códigos de arriba son los cinco del grupo, y de quién son.*
- **Costa Calma Express Inmobiliaria S.L.** · CIF **B35709062** · lleva factura. Es «Domingo
  Javier».
- **Inversiones Brito**: falta CIF y domicilio si sus casas también se facturan.

### Las limpiezas de Domingo Javier

No salen de ninguna reserva: **las encarga él**. Sus casas no están en Lodgify. Se apuntan con
**«+ Nueva limpieza»** en la pantalla de limpiezas, que las crea al precio de la vivienda.

## Comisiones reales (de las 152 reservas de 2026)

| Canal | Plataforma | Bancaria |
|---|---|---|
| **Airbnb** | **15,5 %** en todas las viviendas | **ninguna** |
| **Booking** · Apto 27 y Apto 8206 | **17 %** | 1,3 % |
| **Booking** · el resto | **15 %** | 1,3 % |

No es redondeo: 21 de 21 reservas en el Apto 27 y 20 de 20 en el Apto 8206, todas al 17 %. Y el
15 % es 17 de 17, 27 de 27, 27 de 28 en los demás.

Los valores que traía la aplicación por defecto (15 % de plataforma, **2,5 %** de banco) no son
los vuestros: la bancaria real es **1,3 %**.

## Lo que dicen los dos Excel

| | Reservas | Facturado | Comisión | Banco | A percibir |
|---|---|---|---|---|---|
| Reservas 2026 | 152 | 109.259,49 € | 15.872,65 € | 1.379,05 € | 91.940,66 € |
| Academia Cañada | 7 | 5.434,72 € | 815,20 € | 70,64 € | 4.548,88 € |

### Cosas a revisar en el Excel grande

- **Once reservas donde «a percibir» no sale de restar**, 157,35 € de diferencia en total. Las
  gordas: dos de enero en el Apto 8241 (+50 € cada una), una de agosto en el 8226 (−60 €) y una
  de octubre en el 8206 (**+98,42 €**). El resto son céntimos de redondeo. ¿Ajustes a mano o
  errores?
- El mismo apartamento escrito de varias formas: `27`, `27 A`, `Apto 27`; `8226` y `Apto 8226`.
- Un **«Apto 103»** con una sola reserva que no aparece en la tabla de equivalencias.
- Las seis filas de agosto con importes de 639.000 € **no son reservas**: es la tabla de
  equivalencias del pie de la hoja.

## VeriFactu

Una factura emitida ya no vuelve a borrador: la ley no permite modificar ni anular una factura
emitida, solo rectificarla con otra. Eso está hecho, y las facturas llevan ya base imponible,
**IGIC al 7 %** y los datos fiscales de las dos partes.

El resto del reglamento —encadenado de huellas, registro de eventos, QR y envío a la AEAT— es un
trabajo aparte. Conviene que la asesoría confirme **qué os aplica y desde cuándo**.
