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

### Grupo Villa Mónica

| Vivienda | Entra por | Estado |
|---|---|---|
| Villa Mónica (la villa) | Lodgify | activa |
| Apto 8206 | Lodgify | activa |
| Apto 8209 | Lodgify | activa |
| Apto 8226 | Lodgify | activa |
| Apto 8241 | Lodgify | activa |
| Apto 27 | Lodgify (histórico) | **ya no está en servicio** (Emma, 20/09) |

Propietario: **Inversiones Brito**.

La villa más **cinco** apartamentos: 8206, 8209, 8226, 8241 y **27**. El 27 sigue siendo del
grupo aunque ya no se lleve — por eso está en esta tabla, no fuera: sus 21 reservas de 2026
cuentan para los números del año. Se da de alta y se marca como inactiva.

**Villa Monikka es otra cosa**: eran dos nombres distintos, no uno mal escrito, y esa era la duda
que arrastraba Emma.

### Villa Monikka — cinco apartamentos

Sand Beach · Beach Ocean · Gold View · Waves Dreams · White Sand

Propietario: **Inversiones Brito**, igual que el otro grupo.

*No aparecen en ninguno de los dos Excel. Falta saber si están en Lodgify: si no, van a mano.*

### Academia Cañada

| Vivienda | ID Booking |
|---|---|
| Apto 24 «Montaña Tirba» | 16748111 |
| Apto 25 «Montaña Tindaya» | 16747972 |

Propietario: **Academia Cañada** (Emma, 20/09).

### De Domingo Javier — a mano

**Villa Caliche** y **Villa Gregorio**. No están en Lodgify ni en los Excel de reservas. Se dan de
alta a mano, sin identificador de Lodgify, para que la sincronización no las toque nunca.

Sus limpiezas **las encarga él**: no salen de ninguna reserva. Se apuntan con «+ Nuevas
limpiezas», pegando la columna de fechas de salida de su Excel.

Propietario: **Costa Calma Express Inmobiliaria S.L.** · CIF **B35709062** · lleva factura.

### Viviendas que ya no se llevan

**Apto 27** (del Grupo Villa Mónica) y **Apto 103**. Sus reservas de 2026 cuentan para los números del año, así que hay que
darlas de alta y luego pulsar **«Marcar como inactiva»** en su ficha: desaparecen del panel, del
calendario y de las limpiezas, pero su historial se queda.

### Quién es de quién

| Propietario | Viviendas |
|---|---|
| **Inversiones Brito** | Grupo Villa Mónica (la villa + 8206, 8209, 8226, 8241 y 27) y los cinco de Villa Monikka → **11**, de las cuales el 27 inactiva |
| **Academia Cañada** | Apto 24, Apto 25 |
| **Costa Calma Express Inmobiliaria S.L.** | Villa Caliche, Villa Gregorio |

El propietario es lo que **agrupa la factura de limpiezas**: a Inversiones Brito le sale una sola
factura con las limpiezas de todas sus viviendas.

### Datos fiscales

De los PDF que pasó Yurena el 20/09 (la factura de muestra y el resumen de limpiezas).

| Quién | NIF/CIF | Domicilio |
|---|---|---|
| **Aires Majoreros SL** (emisora) | B88933890 | Calle El Tabloncillo, 3 — Bloque 3B, Puerta 1. La Lajita · 35627 Pájara (Las Palmas) |
| **Academia Cañada del Río S.L.** | B76038611 | Avda. Jhan Reisen, 12 · 35627 Costa Calma (Las Palmas) |

Los dos pasan la comprobación del dígito de control (`lib/ocr/nif.ts`), así que están bien
copiados. Hay que meterlos en **Ajustes**: sin el NIF y el domicilio de la emisora, la factura
no cumple el RD 1619/2012.

El nombre fiscal lleva **SL**, y el que hay sembrado en la aplicación dice «nombre de
demostración»: mientras no se cambie, sale impreso en las facturas y en los informes.

### Cómo está equipado cada apartamento

Del PDF de configuración. Hace falta para las limpiezas (ropa de cama, toallas, amenities).

| Apartamento | Dobles | Individuales | Baños | Capacidad | Notas |
|---|---|---|---|---|---|
| Sand & Beach | 1 | 0 | 1 | 2 | |
| Beach & Ocean | 1 | 0 | 1 | 2 | |
| White Sand | 2 | 0 | 2 | 6 | 1 sofá cama doble |
| Waves & Dreams | 1 | 0 | 1 | 4 | 1 sofá cama doble |
| Gold View | 1 | 0 | 1 | 4 | 1 sofá cama doble |
| Villa Mónica | 7 | 1 | 2 baños + 1 aseo | 15 | |
| Apto 8241 | 1 | 1 | 1 | 5 | 1 sofá cama doble |
| Apto 8206 | 1 | 1 | 1 | 3 | |
| Apto 27 | 1 | 1 | 1 | 3 | 1 sofá cama doble |
| Apto 8209 | 1 | 0 | 1 | 4 | 1 sofá cama doble |
| Apto 8226 | 1 | 1 | 1 | 5 | 1 sofá cama doble |
| 24 Montaña Tirba | 1 | 0 | 1 | 4 | 1 sofá cama doble |
| 25 Montaña Tindaya | 1 | 0 | 1 | 4 | 1 sofá cama doble |
| Villa Caliche | 1 | 4 | 1 baño + 1 aseo | 6 | |
| Villa Gregorio | 4 | 0 | 4 | 8 | |

El **Apto 103** aparece tachado: «este alojamiento se elimina, no existe ya».

### Pendiente

- **CIF y domicilio de Inversiones Brito Pérez, S.L.** Sin ellos su factura no es válida, y es
  el cliente más grande. Es lo único fiscal que falta.
- Si los cinco de **Villa Monikka** están en Lodgify o hay que darlos de alta a mano.
- De quién era el **Apto 103**, para su histórico.
- **Cómo se llama de verdad el grupo grande.** En el PDF de configuración pone «GRUPO CHANO»;
  Emma lo llamó «Grupo Villa Mónica»; el informe del sistema anterior lo titula «Villa Mónica y
  apartamentos». Son los mismos seis, pero conviene fijar un nombre: es el que va a salir en el
  informe al propietario.
- «Beach & Ocean» aparece también como «**Beachs & Ocean**» en el informe semanal. Es el mismo
  apartamento escrito de dos formas; si entra así desde Lodgify saldrán dos viviendas.

## El informe del sistema anterior

Yurena pasó el informe semanal que Inversiones Brito viene recibiendo (Mirador de Sotavento ·
Innova IA Systems). Es la referencia de lo que espera ver el propietario:

- Cuatro cifras arriba: precio total de reservas, a percibir en cuenta, comisiones
  (Booking + banco) y gastos de la semana.
- Las reservas **separadas por complejo**, con subtotal de cada uno — que es justo lo que aquí
  hace el desglose por grupo.
- Una tabla de gastos con fecha, proveedor, uso e importe.
- Y al pie: «el cálculo de tu comisión de gestión y la liquidación final se consolidan en el
  cierre mensual». Es decir, **el semanal no lleva comisión de gestión**; la lleva el mensual.
  Coincide con cómo está montado aquí.

La reserva de Villa Mónica del 17 al 19 de julio (1.126,51 € / 168,98 € / 14,64 € / 942,89 €)
cuadra al céntimo con el Excel. Los dos orígenes dicen lo mismo.

### Contrastado: salen los mismos números

`tests/numeros-reales.test.ts` reproduce ese informe entero a partir de las comisiones
configuradas aquí. **Las nueve reservas cuadran al céntimo**, y con ellas los dos subtotales y
las cuatro cifras de cabecera:

| | Informe de Brito | Lo que calcula esto |
|---|---|---|
| Precio total de reservas | 4.938,51 € | 4.938,51 € |
| Comisiones (Booking + banco) | 788,86 € | 788,86 € |
| A percibir en cuenta | 4.149,65 € | 4.149,65 € |
| Gastos de la semana | 1.858,90 € | 1.858,90 € |

Importa porque es una **fuente independiente**: ese informe no sale de este código ni del Excel
del que se dedujeron las comisiones. Confirma por separado lo que decía el Excel, incluido lo
que más raro parecía — que el **Apto 8206 va al 17 %** en Booking y los demás al 15 %. Con un
único porcentaje para todos, esa reserva falla.

Si algún día dejan de cuadrar, esa prueba lo dice antes de que llegue a un informe.

### La reserva que no encaja

Una de las nueve no se puede reproducir con ninguna regla configurable:

> 15 jul → 16 jul · Beach & Ocean · 180,00 € · **0,00 € de Booking** · 4,75 € de banco

Sin comisión de plataforma (parece una reserva directa) pero con **4,75 € de banco, que es un
2,64 %**, no el 1,3 % de todas las demás. Es la única así en la semana.

**Para preguntar a Emma:** ¿qué es esa reserva y de dónde sale ese 2,64 %? Si es lo normal en
las directas, hay que configurar el canal «Directo» con su propia comisión bancaria; si es un
caso suelto, se mete a mano y ya.

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
