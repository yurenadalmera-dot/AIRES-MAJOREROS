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
| Apto 27 → **Montaña Guerime** | Lodgify | activa; era el nombre lo que dejó de usarse (Yurena, 20/09) |

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

~~**Apto 27**~~ (resultó ser Montaña Guerime, que sigue activa) y **Apto 103**. Sus reservas de 2026 cuentan para los números del año, así que hay que
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
- ~~«Beach & Ocean» aparece también como «**Beachs & Ocean**» en el informe semanal.~~
  **Resuelto (Yurena, 20/09):** son el mismo apartamento. Está en `ALIAS_DE_VIVIENDA` y la
  importación las une sola.

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

## Mirador: lo que ya existe en n8n + Supabase

**Esto no lo sabía hasta el 20/09 y cambia el mapa.** Además de este SaaS hay un sistema en
marcha —n8n + una base Supabase llamada `mirador-operativa`— que ya hace buena parte de lo
mismo, con datos reales dentro.

Ojo con el nombre: cuando aquí se dijo «no hay Supabase» era cierto **de este SaaS** (MySQL en
Hostinger). El Supabase es el de Mirador, que es otro sistema.

### Lo que hay montado

| Workflow | Qué hace |
|---|---|
| `Mirador · cargar reservas Lodgify` | **Activo, cada 3 horas.** Trae *todas* las reservas de Lodgify paginando y las vuelca en `reservas` con `on conflict`. Idempotente. |
| `Mirador · consola SQL` | La única vía de acceso a la base. Se edita el SQL del nodo «Verificar» y se ejecuta a mano. |
| `Mirador · panel de Emma` | Sirve el panel; el HTML vive en `app_ui`. |
| `Mirador · disponibilidad para la web` | Endpoint público de solo lectura para los calendarios. |
| `Informe semanal propietarios` | Viernes 17:00. Agrupa por Villa Monikka, Grupo Chano y Academia. |
| `Generar limpiezas` / `Facturar limpiezas` | Día 1 de cada mes. La numeración de facturas arranca en 2026-005. |

La base tiene `reservas`, `viviendas`, `propietarios`, `grupos_liquidacion`,
`reglas_liquidacion`, `tarifas_canal`, `movimientos` (gastos), `limpiezas`, `liquidaciones` +
`liquidaciones_detalle`, y vistas (`v_comision_reserva`, `v_liquidacion_grupo_mes`,
`v_coste_grupo_mes`, `v_limpieza_teorica`).

### Lo que ya está cargado de Lodgify (20/09/2026)

| Año | Confirmadas | Ventas |
|---|---|---|
| 2025 | 163 | 118.500 € |
| **2026** | **330** | **291.581 €** |
| 2027 | 17 | 34.019 € |

Los dos Excel que se analizaron traían 152 reservas de 2026: **eran parciales**. Lo bueno es
que las comisiones que salieron de ellos se confirmaron después contra el informe semanal real,
así que el análisis vale igual.

### Datos fiscales: completos

| Quién | CIF | Domicilio |
|---|---|---|
| **Inversiones Brito Pérez S.L.** | **B35851872** | Avenida Jahn Reisen, 12 · 35627 Costa Calma - Pájara (Las Palmas) |
| Academia Cañada del Río S.L. | B76038611 | Avda. Jhan Reisen, 12 · 35627 Costa Calma (Las Palmas) |
| Aires Majoreros SL (emisora) | B88933890 | Calle El Tabloncillo, 3 — Bloque 3B, Puerta 1. La Lajita · 35627 Pájara |

Los tres pasan la comprobación del dígito de control. **Ya no falta ningún dato fiscal.**

Domingo Javier no tiene CIF ni domicilio y está marcado `facturable: false`: a él solo se le
pasa resumen, no factura. Coincide con lo que ya se sabía.

Un detalle menor: la calle de Brito y la de Academia son la misma con dos grafías, «Jahn
Reisen» y «Jhan Reisen». Conviene fijar una.

### La cartera, como está de verdad

| Grupo | Propietario | Viviendas |
|---|---|---|
| **Grupo Chano** | Inversiones Brito Pérez | Villa Mónica, 8206, 8209, 8226, 8241, **Montaña Guerime**, y el 103 (inactivo) |
| **Villa Monikka** | Inversiones Brito Pérez | Sand & Beach, Beach & Ocean, Gold View, Waves & Dreams, White Sand |
| **Academia** | Academia Cañada del Río | 24 Montaña Tirba, 25 Montaña Tindaya, **59 Montaña Pico de la Zarza** |
| — | Domingo Javier | Villa Caliche, Villa Gregorio |

Dos cosas que aquí no se tenían: **Montaña Guerime** pertenece al Grupo Chano, y Academia tiene
**tres** viviendas, no dos. El grupo grande se llama **Grupo Chano** — se acabó la duda de los
tres nombres.

Y responde otra pregunta que estaba abierta: los cinco de Villa Monikka **sí están en Lodgify**
(listings 7452xx). Las de Academia y las de Domingo Javier **no** — hay que darlas de alta a
mano, como ya se suponía.

### La cuota de Academia Cañada es una escalera: 400 → 500 → 600

Lo dijo Yurena el 21/09 y lo confirma el briefing de Mirador: *«Academia importe fijo
escalonado (400 → 500 → 600 €)»*.

**No está en los Excel.** Los dos que hay son hojas de reservas y no tienen ni una celda con
400, 500 o 600. En los movimientos del banco tampoco: los importes redondos de ahí son sueldos
de Malik y de Mohamed. Y Mirador solo guarda **el último tramo**, 600 € desde el 01/08/2026.

Por qué importa: con un único importe, un informe de todo el año cobra 600 € también por los
meses en que se cobraban 400. Sobre enero–septiembre son **1.000 € de más**.

Así que la cuota se guarda por tramos (`CuotaFija`: importe, desde, hasta) y se cobra **mes a
mes al importe que estuviera en vigor el día 1**. En Ajustes se ven los tramos y se añade uno
nuevo con su fecha: el anterior se cierra solo el día antes, sin pisar lo ya cobrado.

**Faltan las dos fechas:** cuándo pasó de 400 a 500 y de 500 a 600 (esta última, si es el
01/08/2026 que dice Mirador, ya está). Hasta saberlas no se puede liquidar bien el año, y no me
las invento: se cobra de menos o de más a un cliente real.

### Resuelto: el 10 % de Villa Monikka va sobre el beneficio

Las reglas de liquidación, ya con el criterio bueno:

| Grupo | Regla | Desde |
|---|---|---|
| Academia | 600 € fijos al mes | 01/08/2026 |
| Grupo Chano | 30 % sobre beneficio | 01/01/2026 |
| **Villa Monikka** | **10 % sobre beneficio** | 01/01/2026 |

Estaba puesta en Mirador como `pct_ventas`, y **eso le cobraba de más a
Inversiones Brito**. Sobre el borrador de enero a julio de 2026:

| | |
|---|---|
| Ventas de Villa Monikka | 95.376 € |
| Beneficio (tras costes y comisiones) | ~63.400 € |
| 10 % sobre ventas — lo que decía el borrador | **9.537,58 €** |
| 10 % sobre beneficio — lo que toca | **~6.340 €** |
| **De más** | **~3.200 €** |

Yurena lo confirmó el 20/09 («sobre el beneficio pon el 10%») y la regla ya
está corregida en Mirador. Los dos sistemas dicen ahora lo mismo, y la
importación se trae el 10 % sola.

### El borrador, regenerado (21/09)

Hecho. La función `fn_generar_liquidacion` de Mirador ya manejaba bien
`pct_beneficio`; lo único que pasaba es que el borrador se había generado
antes de corregir la regla. Vuelto a generar para Inversiones Brito,
enero–julio de 2026:

| Grupo | Antes | Ahora | Base |
|---|---|---|---|
| Grupo Chano · 30 % | 13.538,09 € | 13.538,09 € | beneficio 45.126,98 € |
| **Villa Monikka · 10 %** | **9.537,58 €** (sobre ventas) | **6.339,63 €** (sobre beneficio) | beneficio 63.396,33 € |
| **Total** | **23.075,67 €** | **19.877,72 €** | |

**3.197,95 € menos**, que es lo que se le venía cobrando de más.

`tests/numeros-reales.test.ts` reproduce esas cifras **al céntimo** con
`liquidarPropietario`: los dos sistemas calculan ahora sobre la misma base
—ingresos menos comisiones de venta menos gastos— y si alguien los separa
otra vez, salta la prueba antes de que llegue a una factura.

Una diferencia a favor del SaaS: si un grupo cierra el mes en pérdidas, aquí
la comisión es **cero**; Mirador multiplicaría la base negativa por el
porcentaje y le pasaría al propietario una comisión en negativo.

#### Lo que ese borrador sigue teniendo de más: 438,54 €

No es la regla, son las comisiones de venta. Mirador las calcula con sus
supuestos —Booking y Airbnb al 15 %, sin comisión bancaria— y eso **infla el
beneficio**, que es la base del porcentaje:

| | Con lo supuesto (Mirador) | Con lo contrastado |
|---|---|---|
| Comisiones de venta | 24.306 € | 26.471 € |
| Grupo Chano · 30 % | 13.538,09 € | 13.205,05 € |
| Villa Monikka · 10 % | 6.339,63 € | 6.234,13 € |
| **Total** | **19.877,72 €** | **19.439,18 €** |

Mirador **no puede** llegar a esa cifra: `tarifas_canal` no tiene ni comisión
bancaria ni porcentaje por vivienda, así que no sabe expresar el 1,3 % del
banco ni el 17 % del 8206 y de Guerime. El SaaS sí.

**Conclusión práctica:** el borrador regenerado ya no tiene el error gordo,
pero **no conviene facturar de él**. La cifra buena —19.439,18 €— sale del
SaaS en cuanto entren los datos.

### Revisión completa de la base de Mirador (20/09, de noche)

Las 17 tablas con sus filas, para saber exactamente qué se pierde al apagarla:

| Tabla | Filas | ¿Se trae? |
|---|---|---|
| `reservas` | **815** | **No**: vienen de Lodgify |
| `movimientos` | 267 | Sí |
| `viviendas` | 17 | Sí |
| `propietarios` · `grupos_liquidacion` · `reglas_liquidacion` | 3 · 3 · 3 | Sí |
| `tarifas` · `tarifa_lineas` · `tarifa_vivienda` | 2 · 4 · 3 | Sí |
| `tarifas_canal` | 4 | Sí (ver abajo) |
| `liquidaciones` + `liquidaciones_detalle` | 1 + 2 | No: es el borrador con la regla vieja |
| `app_ui` | 1 (9,2 KB) | No: es el HTML del panel de Emma |
| `limpiezas` · `perfiles` · `documentos_ocr` · `app_ui_versiones` | **0** | Nada que traer |

Cinco vistas (`v_comision_reserva`, `v_coste_grupo_mes`, `v_limpieza_teorica`,
`v_liquidacion_grupo_mes`, `v_ventas_grupo_mes`) y cinco funciones
(`fn_generar_liquidacion`, `fn_versionar_app_ui`, `fn_propietario_actual`, `fn_rol_actual`,
`confirmar_documento_ocr`). No se traen: son cálculo, y el cálculo ya vive aquí en código
probado.

**Lo único que se pierde de verdad al apagar Mirador es el panel de Emma** (`app_ui`), y el
borrador de liquidación, que de todas formas está calculado con la regla equivocada.

### Las reservas: sólo de Lodgify

Confirmado en los datos: las 815 reservas llevan el canal en `origen` con los nombres que manda
Lodgify, y **ninguna** trae comisión guardada.

| Canal (`origen`) | Reservas | Ventas |
|---|---|---|
| BookingCom | 421 confirmadas (+235 rechazadas) | 367.104 € |
| AirbnbIntegration | 76 confirmadas, 55 abiertas | 65.931 € / 65.214 € |
| OH (directa) | 12 | 11.457 € |
| Manual | 2 confirmadas, 5 abiertas | 701 € / 2.867 € |

`reservas.comision` está **vacía en las 815**. O sea: Mirador no tiene ni una comisión real
guardada; las calcula al vuelo con los porcentajes de `tarifas_canal`, dos de los cuales él mismo
marca como supuestos. No hay nada que contrastar ahí, y por eso las reservas entran de Lodgify y
las comisiones se aplican con lo que sí está comprobado.

### Las comisiones de canal: aquí están contrastadas y allí no

`tarifas_canal` de Mirador tiene Booking al 15 % y Airbnb al 15 %, las dos con
`confirmado: false` y una nota que dice «SUPUESTO… pendiente de contrastar con una factura
real». No contempla comisión bancaria ni porcentaje distinto por vivienda.

Lo de aquí sí está contrastado, dos veces (los Excel y el informe semanal real):

| Canal | Plataforma | Bancaria |
|---|---|---|
| Airbnb | 15,5 % | ninguna |
| Booking · Apto 8206 y Apto 27 | **17 %** | 1,3 % |
| Booking · el resto | 15 % | 1,3 % |

Los nombres de canal que devuelve Lodgify son `BookingCom`, `AirbnbIntegration`, `Manual` y
`OH` (directa). Comprobado en las 815 reservas.

#### Resuelto: las comisiones también se traen, y lo comprobado manda

La importación se trae `tarifas_canal` entera, pero **no deja que un supuesto pise un dato
comprobado**. Así queda después de importar, y así se ha comprobado de punta a punta contra el
volcado real:

| Canal | Plataforma | Banco | De dónde sale |
|---|---|---|---|
| AirbnbIntegration | **15,5 %** | 0 % | contrastado aquí (el 15 % de Mirador era supuesto) |
| BookingCom · todas | 15 % | **1,3 %** | contrastado dos veces; Mirador no contempla el banco |
| BookingCom · Apto 8206 | **17 %** | 1,3 % | contrastado: 20 de 20 reservas |
| BookingCom · Montaña Guerime | **17 %** | 1,3 % | contrastado: 21 de 21 (es el «Apto 27» del Excel) |
| OH (directa) | 0 % | 0 % | **de Mirador**, que lo da por bueno |
| Manual | 0 % | 0 % | **de Mirador**, que lo da por bueno |

Los dos canales al 0 % hacían falta y no se tenían: sin ellos, una reserva directa entraba con
el 15 % por defecto de plataforma.

La comisión bancaria de esos dos entra **a cero, no a nulo**, a propósito: a nulo caería en la
general del 2,5 %, que no es la vuestra, y eso sería inventarle un cargo a una reserva directa
—unos 375 € sobre las 19 que hay— y pagarle de menos al propietario. Entre inventar de más e
inventar de menos, se inventa de menos y se deja dicho en la nota.

En Ajustes, **una comisión sin contrastar sale marcada en ámbar** con su nota. En cuanto alguien
escribe el porcentaje a mano deja de estarlo: escribirlo es una decisión, no una herencia.

#### Resuelto: el «Apto 27» del Excel es Montaña Guerime

Confirmado por Yurena el 20/09, y encaja con los datos:

- El Grupo Chano tiene **siete** viviendas en Mirador: Villa Mónica, 8206, 8209, 8226, 8241,
  Montaña Guerime y el 103 (inactivo). En el Excel estaban las mismas menos Guerime, y con un
  «Apto 27» que allí no existe. Es el único par que quedaba sin emparejar.
- «Ya no está en servicio» era el **nombre**, no el apartamento: Guerime tiene reservas hasta
  febrero de 2027 y 40 en 2026.
- Las 21 reservas de 2026 del Excel caben dentro de esas 40: aquel Excel era parcial (152 de 330).

Con el alias puesto, **su 17 % de Booking se aplica solo** y la importación ya no deja ningún
aviso pendiente. Importa: sobre las ventas de 2026 de ese piso (17.910 €), la diferencia entre
el 15 % y el 17 % son unos **358 €** que estaban mal repartidos, más lo de 2025.

### La pregunta que sigue abierta

La reserva de 180 € del 15 al 16 de julio (Beach & Ocean, huésped Gigliola Scatola) sin
comisión de Booking pero con 4,75 € de banco —un 2,64 %—. Con `OH` al 0 % de canal, ese cargo
tiene que venir de otro sitio. Sigue sin explicar.

## El panel de Emma, traído al SaaS

Era lo único de Mirador que no tenía sitio aquí. Está en **Alquileres → La semana y el año**
(`/rental/panel`), y no repite el «Panel del día», que mira solo a hoy:

- **Los próximos siete días**, una línea por entrada y por salida, con huésped, número de
  huéspedes y canal. Es lo que hace falta para cuadrar limpiezas y llaves con tiempo.
- **Lo que se liquidaría hoy**, por propietario y por grupo, con el desglose de dónde sale cada
  euro.
- **La cartera por lo que produce**: reservas, noches y ventas de cada vivienda, de más a menos.
- Cuatro cifras arriba, incluida **cuántas viviendas no están en Lodgify** y hay que llevar a
  mano.

Dos diferencias a propósito con el de Mirador:

1. Los totales son **del año en curso**. Aquel sumaba 2025, 2026 y 2027 en la misma cifra, y una
   venta que mezcla tres años no sirve para decidir nada.
2. La liquidación **se calcula al abrir la página**, no se lee de un borrador guardado. Es
   exactamente lo que falló en Mirador: el borrador se generó antes de corregir la regla del
   10 % y siguió enseñando 3.197,95 € de más hasta que se regeneró a mano.

## La mudanza de Mirador al SaaS

Decidido el 20/09: los datos se traen aquí y ese Supabase queda libre para otro proyecto.

### Cómo se hace

n8n alcanza airesmajoreros.pro (yo no, el proxy lo bloquea), así que empuja él:

1. **En el SaaS**: Alquileres → Ajustes → «Traerse los datos de Mirador» → **Generar el token**.
   Se enseña una sola vez; aquí solo queda su huella.
2. **En n8n**: workflow **«Mirador → SaaS · traer cartera y movimientos»**. En el nodo «Empujar
   al SaaS», crear la credencial de cabecera con `Authorization` = `Bearer imp_...`.
3. Ejecutar. El último nodo da el parte: cuántos entran, cuántos ya estaban, cuántos se han
   **perdido por el camino** y el motivo de cada rechazo.

Se puede repetir las veces que haga falta: cada apunte va con su huella y no se duplica.

### Lo que se mueve, comprobado contra los datos reales

| | |
|---|---|
| Propietarios | 3 |
| Grupos | 3 |
| Viviendas | 17 (12 con listing de Lodgify) |
| Tarifas de limpieza | 2, con 4 líneas y 3 precios cerrados |
| Comisiones de canal | 4 de Mirador → **5** aquí (ver arriba) |
| Movimientos | 267 — 184 gastos, **41 sueldos**, **40 traspasos**, 2 ingresos |

### Ojo con los duplicados: dónde está el riesgo de verdad

**Las reservas no se pueden duplicar.** `lodgifyBookingId` es único en la tabla y la
sincronización busca por él antes de crear nada: sincronizar dos veces actualiza, no repite.

El riesgo está una capa más abajo, en las **viviendas**. Si el SaaS ya tiene «Villa Mónica» dada
de alta a mano —sin identificador de Lodgify— y la importación trae la suya con el listing
641828, crear una segunda partiría en dos el histórico de ese apartamento. Y no fallaría nada:
simplemente el informe del propietario saldría a la mitad.

Por eso la importación empareja en tres pasos:

1. Por el **identificador de Lodgify**, que es el único que no cambia.
2. Si no, por el **nombre normalizado** entre las que todavía no tienen identificador: esa ficha
   se **adopta** —conserva lo que se escribió a mano, como el precio de limpieza, y gana el
   identificador—. El parte dice cuántas han sido.
3. Si el volcado no trae identificador, por el nombre a secas.

Probado: con «Villa Mónica» puesta a mano antes de importar, se adopta y **no** aparece una
segunda; conserva sus 120 €.

**Lo que no hace es unir por su cuenta dos nombres parecidos.** «Apto 8226» y «Apto 8241» no son
el mismo piso, y mezclarlos revolvería el histórico de dos propietarios sin arreglo posible. Así
que avisa y lo decide una persona:

> vivienda **X** → entra como nueva, pero ya había «Y» sin identificador de Lodgify. Si son la
> misma, únelas antes de sincronizar o saldrán dos y las reservas se repartirán entre las dos.

Cuando alguien lo confirma, deja de ser una sospecha y pasa a `ALIAS_DE_VIVIENDA`, con quién lo
dijo y cuándo. De momento hay uno:

| Escrito así | Es en realidad | Quién lo confirmó |
|---|---|---|
| Beachs & Ocean | **Beach & Ocean** | Yurena, 20/09/2026 |
| Apto 27 | **Montaña Guerime** | Yurena, 20/09/2026 |

Ahí la importación **une de verdad**: probado con «Beachs & Ocean» dada de alta a mano y con una
reserva suya dentro, quedan **17 viviendas y no 18** — la ficha conserva su precio de limpieza y
su reserva, se queda con el nombre bueno y gana el listing 745286.

La regla: **si los números no coinciden, no son la misma vivienda**, y punto. Media cartera se
llama por su número y ahí dos letras de diferencia no son una errata.

Y una última: cuando el SaaS empiece a traerse las reservas de Lodgify, conviene **apagar el
workflow `Mirador · cargar reservas Lodgify`**, que sigue activo cada 3 horas. No duplica nada
—son dos bases distintas— pero tener dos copias vivas de lo mismo acaba en que alguien mira la
que no toca.

### Probado de punta a punta

No es una suposición: el 20/09 se levantó la aplicación entera contra una MariaDB limpia y se
le metió el volcado **real** de Mirador por `/api/importar`. Entraron los 3 propietarios, los 3
grupos, las 17 viviendas, las 2 tarifas, los 3 precios cerrados y las 5 comisiones. Al repetir la
importación: **0 nuevos, 4 repetidos** — no duplica.

Y la migración de esquema se probó quitando las columnas a mano: se aplica una vez y a la segunda
dice «ninguna pendiente».

Ni un apunte sin huella, ni una huella repetida, y **uno sin fecha** que entra marcado en vez
de perderse.

Los 81 sueldos y traspasos —**46.580 €**— se habrían volcado dentro de «gastos» y habrían
restado en la liquidación de alguien. Un traspaso entre cuentas no es un gasto de nadie. Por eso
`Expense` lleva ahora `type`.

### Lo que NO se mueve

**Las reservas.** Lodgify es su origen y la aplicación ya sabe traerlas sola; de Mirador solo
hacía falta el emparejamiento de cada vivienda con su listing, que viaja en el volcado.

### Las tres reglas entran ya correctas

Grupo Chano con su 30 %, Villa Monikka con su 10 % —los dos sobre beneficio— y Academia con sus
600 € fijos al mes. Ya no hay ninguna diferencia de criterio entre los dos sistemas.

### Lo que hay que portar antes de apagar Mirador

Ya hecho: `groupId`, `type`, `reparto`, `origen`, `origenHash` y `revisar` en los gastos, y la
fecha nullable.

Pendiente: las **tarifas de limpieza por número de huéspedes** (`tarifas`, `tarifa_lineas`,
`tarifa_vivienda`, y la vista `v_limpieza_teorica`). Aquí el precio de limpieza es uno fijo por
vivienda; allí es base + tanto por huésped adicional, con precio cerrado para Villa Mónica
(120 €), Villa Gregorio (100 €) y Villa Caliche (100 €), y dos tarifas distintas — «Oficial
2026» (salida 60 €, repaso 40 €) y «Inversiones Brito» (salida 50 €, repaso 30 €).

## VeriFactu

Una factura emitida ya no vuelve a borrador: la ley no permite modificar ni anular una factura
emitida, solo rectificarla con otra. Eso está hecho, y las facturas llevan ya base imponible,
**IGIC al 7 %** y los datos fiscales de las dos partes.

El resto del reglamento —encadenado de huellas, registro de eventos, QR y envío a la AEAT— es un
trabajo aparte. Conviene que la asesoría confirme **qué os aplica y desde cuándo**.
