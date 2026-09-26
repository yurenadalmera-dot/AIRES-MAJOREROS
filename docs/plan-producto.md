# Auditoría y plan — que la aplicación resuelva el día a día

21/09/2026. Encargo: «que la aplicación sea súper intuitiva y resolutiva con las tareas de la
gestión del alquiler vacacional», con una auditoría completa y un plan.

## Cómo está hecha esta auditoría

He leído el código de las 23 pantallas, el modelo de datos entero (`prisma/schema.prisma`), las
acciones de servidor, y he cruzado cada hallazgo con los datos que trajimos de Mirador y con los
88 workflows de n8n. Cuando digo «no se usa» es porque lo he buscado en todo el repositorio, no
porque me lo parezca.

Dos avisos sobre los números:

- Lo que digo de **viviendas, tarifas y precios** sale de los datos reales importados de Mirador
  (nombres como «Apto 8206» o «Montaña Guerime»), así que es firme.
- Lo que hay en mi copia local de **reservas** parece de demostración (apellidos tipo Jansen,
  Schmidt, Dupont). No baso ninguna conclusión en su número: donde hablo de reservas, hablo de lo
  que hace el código.

---

## 0. Lo más grave, encontrado al final

**Los clientes de Aires Majoreros son los propietarios de las viviendas, no Emma** (Yurena,
21/09). El SaaS está montado sobre la premisa contraria:

- `app/cleaning/page.tsx:83` rellena el cliente de la factura con **el negocio de alquiler**.
- `generateInvoice` mete **todas** las limpiezas del periodo en **una sola factura**.

O sea: el SaaS emitiría una única factura a Emma por las limpiezas de todos los propietarios.
El workflow de n8n que acabamos de apagar hacía lo correcto —agrupaba por propietario y emitía
una factura a cada uno, con el detalle de sus viviendas— y además distinguía que **Domingo Javier
recibe solo un resumen, no factura oficial**, cosa que el SaaS no sabe.

**Arreglado el 21/09.** Ahora sale **un documento por propietario**, con el detalle de sus
viviendas, y los datos fiscales se toman de su ficha en vez de teclearlos cada mes. Los que
tienen puesto «resumen» reciben resumen: sin IGIC y **en su propia serie**, porque un resumen no
es una factura y no puede gastar un número de la serie fiscal.

Probado de punta a punta contra los datos reales, con las tres propietarias:

| Documento | Cliente | Base | IGIC | Total |
|---|---|---|---|---|
| `AM-2026-0001` | Academia Cañada del Río S.L. | 120,00 € | 8,40 € | 128,40 € |
| `AM-2026-0002` | Inversiones Brito Pérez S.L. | 300,00 € | 21,00 € | 321,00 € |
| `RES-2026-0001` | Domingo Javier *(resumen)* | 60,00 € | — | 60,00 € |

Y lo que no se puede emitir no se cuela ni se pierde: a quien le falte el NIF o el domicilio, sus
limpiezas se quedan pendientes y sale dicho con su nombre. En Ajustes → Propietarios se corrigen,
que hasta ahora un propietario solo se podía crear, no arreglar.

### 1.1 Catorce de dieciséis viviendas no tienen precio de limpieza — y eso llega a la factura

De las 16 viviendas activas, **solo dos tienen precio de limpieza**: Beach & Ocean (60 €) y Villa
Mónica (120 €). Las otras catorce están a 0 €.

Eso no sería grave si el sistema avisara. Avisa en un sitio y calla en los otros dos:

| Por dónde entra la limpieza | Qué hace si la vivienda está a 0 € |
|---|---|
| A mano, desde el tablero (`crearLimpiezaManual`) | **Se niega**, con un mensaje claro |
| Al sincronizar con Lodgify (`lodgify-sync.ts:334`) | La crea **a 0 €**, sin decir nada |
| Al dar de alta una reserva a mano (`bookings.ts:130`) | La crea **a 0 €**, sin decir nada |

Dicho de otra forma: cada salida que entre por Lodgify en cualquiera de esas catorce viviendas
apunta una limpieza que luego se factura a cero. Alguien se dio cuenta del problema y puso la
comprobación… solo en el camino que menos se usa.

### 1.1 bis Las limpiezas que ya existían se quedaron a 0 € (encontrado el 22/09)

Arreglar el motor de tarifas solo arregló **las limpiezas nuevas**. Las que ya estaban nacieron a
0 €, y la sincronización, al pasar por ellas, solo les cambiaba la fecha: nadie les iba a poner
precio nunca. En producción son, entre otras, las cinco limpiezas de septiembre de Inversiones
Brito. Y como la facturación rechaza las líneas a 0 € —y hace bien—, se caían de la factura del
propietario sin que saltara ningún aviso.

Arreglado en dos vueltas, porque la primera se quedó corta. Atar el repaso al bucle de reservas
solo alcanzaba las limpiezas cuya reserva devolviera Lodgify en esa pasada: de las cinco de Brito
se arreglaron cuatro, y la quinta se quedó a cero. Ahora hay además un barrido final por todas
las que sigan a 0 €, cuelguen o no de una reserva, y las que no se puedan precisar dicen por qué
—«sin precio» a secas no se puede arreglar—. Solo toca lo que está vacío: un precio distinto de 0
es un precio que puso alguien.

Comprobado contra producción el 22/09: **ninguna limpieza a 0 €**. Solo en septiembre y solo en
Inversiones Brito eran 160 € de limpiezas sin cobrar, y 122 € de más liquidados al propietario.

### 1.2 El motor de tarifas está escrito, probado, y no se llama desde ningún sitio

`lib/tarifas.ts` calcula exactamente lo que Aires cobra: **base + tanto por huésped adicional**,
con precio cerrado por vivienda cuando lo hay. Tiene 18 pruebas que pasan. Los datos están
cargados: 2 tarifas, 4 líneas y 3 precios cerrados, traídos de Mirador.

Y no lo llama nadie. Busqué `precioDeLimpieza` en todo el repositorio: solo aparece en su propio
fichero y en sus pruebas. Los tres caminos de arriba copian el precio fijo de la vivienda.

El efecto en dinero: la tarifa «Oficial 2026» son 60 € de salida con dos huéspedes incluidos y
10 € por cada uno más. **Una salida de cuatro se está facturando a 60 € en vez de a 80 €.** Cada
vez.

### 1.3 A quien limpia no le llega el dato con el que cobra

Esto es exactamente lo que dijiste. Y el modelo de datos ya lo tiene todo:

- `CleaningTask.bookingId` enlaza la limpieza con la reserva que la provoca.
- `Booking` guarda `adults`, `children`, `checkIn`, `checkOut`, `guestName`.

El tablero de limpiezas (`components/shared/TasksBoardView.tsx`) enseña fecha, vivienda, tipo,
estado, empleada, importe y notas. **No enseña cuántos huéspedes, ni qué reserva, ni si es salida
o repaso.** El dato con el que se factura está a un salto de distancia y no se pinta.

### 1.4 No existe la diferencia entre salida y repaso

La tarifa distingue los dos servicios (salida 60 €, repaso 40 € en la «Oficial 2026»). El modelo
`CleaningTask` solo tiene `type: CLEANING | MAINTENANCE`. No hay dónde guardar si esa limpieza
fue una salida o un repaso, así que no se puede cobrar distinto.

En n8n **sí** está resuelto: el workflow «Generar limpiezas» marca repaso cuando hay 7 días o más
de hueco hasta la siguiente reserva. Esa regla hay que traérsela.

### 1.5 Tres sistemas haciendo lo mismo, los tres encendidos

**Decidido (Yurena, 21/09): el SaaS factura, y Airtable no pinta nada en ningún sitio.** Lo que
queda de esta sección es el inventario de lo que hay que desmontar.

Ahora mismo están **activos a la vez**:

| Sistema | Qué hace | Dónde guarda |
|---|---|---|
| «Sondeo Lodgify» (n8n, cada 3 h) | Trae reservas | Airtable |
| «Mirador · cargar reservas Lodgify» (n8n, cada 3 h) | Trae reservas | Supabase |
| El SaaS | Trae reservas | MySQL de Hostinger |
| «Generar limpiezas» (n8n, día 1) | Crea limpiezas | Airtable |
| «Facturar limpiezas» (n8n, día 1) | Numera desde 2026-005 y deja borradores en Gmail | Airtable |
| «Informe semanal propietarios» (n8n, viernes 17:00) | Envía el informe por email | Airtable |
| «Previsión mensual limpiezas» (n8n, lunes) | PDF de carga para Aires | Airtable |

**Corrección (leído ya el workflow).** Escribí aquí que se podían emitir dos facturas con el
mismo número. **No es exacto y conviene decirlo claro:** los formatos son distintos —n8n numera
`2026-005` y el SaaS `AM-2026-0001`— así que dos facturas nunca chocarían en el mismo número.

El riesgo de verdad es otro, y sigue siendo serio:

1. **Dos series abiertas a la vez.** Una factura tiene que ir en una serie correlativa. Pasar de
   `2026-NNN` a `AM-2026-NNNN` a mitad de año es abrir una serie nueva; se puede hacer, pero es
   una decisión que confirma la asesoría, no un efecto secundario de cambiar de programa.
2. **Facturar dos veces lo mismo.** «Facturar limpiezas» marca en Airtable las limpiezas como
   facturadas; el SaaS marca las suyas. Ninguno sabe del otro. Con los dos encendidos, las mismas
   limpiezas de septiembre se pueden cobrar por duplicado al mismo cliente.

Hay que apagar el de n8n antes del día 1, que es cuando vuelve a dispararse.

---

## 2. El reparto entre los dos negocios

Tu planteamiento: **las limpiezas son de Aires, el mantenimiento de Emma.** Estoy de acuerdo, con
un matiz.

Hoy `/rental/tasks` y `/cleaning/tasks` son **literalmente la misma pantalla** con distinto
subtítulo. Ninguna de las dos está pensada para quien la abre.

Lo que propongo:

**En Aires (`/cleaning`) — «Limpiezas»**, que es su negocio:
- Solo limpiezas.
- Cada fila con lo que hace falta para trabajar y para cobrar: vivienda, fecha, **salida o
  repaso**, **cuántos huéspedes**, **hora de salida y de la siguiente entrada** (si hay
  turnaround el mismo día, en rojo), empleada e importe calculado por tarifa.
- Vista de carga por día: qué día viene fuerte y necesita refuerzo. Ya existe en n8n («Previsión
  mensual limpiezas»); su sitio es aquí.

**En Emma (`/rental`) — «Mantenimiento»**:
- Solo mantenimiento: averías, revisiones, reformas.
- De las limpiezas, **ve el estado pero no las gestiona**: le importa saber si el apartamento
  está listo para la entrada de las 16:00, no quién lo limpia.

El matiz: Emma no puede quedarse ciega. El panel del día tiene que seguir diciéndole «esta
vivienda tiene salida hoy y la limpieza no está hecha», porque es ella quien responde al huésped
que llega. Lectura sí, gestión no.

Técnicamente es barato: los datos ya están en la misma tabla, es cuestión de filtrar por `type`
y de separar los permisos (`operativa.limpiezas` frente a `operativa.estado_tarea`, que ya
existen en `lib/permisos.ts`).

---

## 3. Lo que falta para que sea «resolutiva»

Hoy la aplicación **registra** bien y **no actúa**. Nada sale de ella: no manda un correo, no
avisa a nadie, no pide un dato. Todo lo que sale del sistema lo saca una persona copiando y
pegando, o un workflow de n8n contra Airtable.

Lo que pides son cuatro cosas, y van en este orden porque cada una se apoya en la anterior.

### 3.1 La ficha del huésped

Hoy de un huésped se guarda: nombre, email, teléfono, adultos y niños. Para todo lo demás no hay
dónde ponerlo.

Hace falta una entidad `Huesped` colgando de la reserva, con: nombre y apellidos, tipo y número
de documento, **número de soporte** del DNI, fecha de nacimiento, sexo, nacionalidad, dirección,
teléfono, email, y el parentesco cuando viaja un menor.

No es burocracia por gusto: es exactamente lo que pide el parte de viajeros, y es lo mismo que
necesitas para hablar con ellos.

### 3.2 El parte a la policía

El **Real Decreto 933/2021** obliga a los alojamientos a registrar e informar los datos de los
viajeros a través de **SES.HOSPEDAJES**, en plazo, y a conservar el registro. Está en vigor para
hospedaje desde diciembre de 2024.

Lo que monto:

1. Un formulario público por reserva, con enlace único y caducable, que el huésped rellena desde
   el móvil antes de llegar. Foto del documento opcional, con lectura automática (el OCR ya está
   montado en el proyecto, `lib/ocr/`).
2. Validación en el momento: un NIF/NIE mal copiado se detecta al escribirlo. La comprobación del
   dígito de control ya existe (`lib/ocr/nif.ts`).
3. El envío a SES.HOSPEDAJES desde n8n, con reintentos, y el acuse guardado en la reserva.
4. Un panel de «partes pendientes»: qué reservas entran mañana y todavía no tienen los datos.

**Esto tienes que confirmarlo con tu asesoría antes de que yo lo programe.** Yo puedo montar la
mecánica; qué campos exactos y qué plazos os aplican a vosotras no lo decido yo. Y hay una
segunda cosa que conviene que mires con ellos: el **número de registro de alquiler de corta
duración** de la ventanilla única, que afecta a lo que se publica en las plataformas.

Una advertencia de peso: esto son datos personales de categoría sensible. Cifrados en la base
(ya tenemos `lib/secretos.ts` con AES-256-GCM), acceso solo para quien lo necesite, y borrado
automático cuando venza el plazo de conservación. No quiero esos datos en un Airtable.

### 3.3 Hablar con el huésped: email y WhatsApp

> **Al día 26/09:** de este guion está en marcha **la parte de email** —el correo de llegada, tres
> días antes—. Todo lo que aquí pone «WhatsApp» está **en espera** por decisión de la clienta; el
> detalle de qué hace falta para activarlo está más abajo, en «WhatsApp — EN ESPERA».

Aquí está el salto de «registra» a «resuelve». Lo que propongo es un **guion de la estancia**,
con mensajes que salen solos en su momento:

| Cuándo | Qué sale | Por dónde |
|---|---|---|
| Al confirmarse la reserva | Bienvenida, qué incluye, cómo llegar | Email |
| 7 días antes | «Necesitamos vuestros datos» + enlace al formulario | Email y WhatsApp |
| 2 días antes | Recordatorio, solo si falta | WhatsApp |
| El día de la entrada | **Mapa, dirección exacta, código de la llave, instrucciones** | WhatsApp |
| Durante la estancia | Wifi, normas, teléfono de urgencias | A petición |
| El día de la salida | Hora, dónde dejar las llaves | WhatsApp |
| Al día siguiente | Gracias y reseña | Email |

Tres cosas que hay que hacer bien:

- **Los códigos de llave no se mandan antes de tiempo.** El día de la entrada, no cuando se
  reserva. Y se guardan cifrados, no en claro en la ficha de la vivienda.
- **WhatsApp tiene sus reglas.** Para escribir primero, fuera de la ventana de 24 horas, hay que
  usar plantillas aprobadas por Meta a través de la WhatsApp Business Platform. Hay que darlas de
  alta y esperar aprobación: no es instantáneo, conviene empezarlo pronto.
- **Idioma.** Por los apellidos que llegan de Lodgify, esto es alemán, inglés y español como
  mínimo. Las plantillas, en los tres.

Y la otra mitad: **lo que entra**. Un buzón que recoja las respuestas por email y WhatsApp, las
enganche a su reserva y las deje en una bandeja dentro de la aplicación, con el histórico de cada
huésped a la vista. Sin eso, seguís contestando desde el móvil personal y nadie más se entera.

### 3.4 Los informes por correo

Ya existe: «Informe semanal propietarios», los viernes a las 17:00, agrupado por propietario y
enviado por email. Hoy lee de Airtable, y **Airtable se va**.

Así que no se le cambia la fuente: **se rehace leyendo del SaaS**, que es donde están los gastos,
las comisiones contrastadas y la escalera de cuotas que corregimos ayer — cosas que en Airtable
no están y por las que el informe de los viernes lleva meses saliendo incompleto.

El informe del SaaS ya está montado y ya sale bien —lo tienes en `/rental/reports`—. Lo que le
falta es una ruta que lo devuelva en PDF y un botón de «enviar al propietario» que deje
constancia de a quién y cuándo se envió. n8n se queda solo con lo que sabe hacer y el SaaS no:
sacar el correo por SMTP y poner el asunto.

---

## 4. El plan

### Fase 0 — parar la hemorragia

**Hecho el 21/09.** El motor de tarifas está enchufado en los tres sitios donde nace una
limpieza, con el servicio (salida o repaso) y los huéspedes guardados en la propia limpieza.
Comprobado contra las 16 viviendas reales: **ninguna se queda sin precio**.

| Propietario | Tarifa | Salida (2) | Salida (4) | Repaso |
|---|---|---|---|---|
| Academia Cañada del Río S.L. | Oficial 2026 | 60 € | 80 € | 40 € |
| Inversiones Brito Pérez S.L. | Inversiones Brito | 50 € | 70 € | 30 € |
| Villa Caliche y Villa Gregorio | precio cerrado | 100 € | 100 € | 40 € |
| Villa Mónica | precio cerrado | 120 € | 120 € | 30 € |

Y la factura ya no deja pasar una limpieza a 0 €: se para y dice cuáles son. Una factura emitida
solo se corrige con una rectificativa, así que el sitio para detectarlo es antes, no después.

**Airtable, desmontado (21/09).** Los seis workflows que lo tocaban están apagados:

| Workflow | Por qué se apaga |
|---|---|
| «Facturar limpiezas» | El SaaS factura. Con los dos, las mismas limpiezas se cobran dos veces. |
| «Generar limpiezas» | El SaaS ya las genera, con su misma regla de los 7 días. |
| «Sondeo Lodgify» | El SaaS trae las reservas de Lodgify. |
| «Mirador · cargar reservas Lodgify» | Idem, contra Supabase. Sobra desde la mudanza. |
| «Informe semanal propietarios» | Emma no lo estaba usando (Yurena, 21/09). Se rehará contra el SaaS. |
| «Previsión mensual limpiezas» | Leía de Airtable, que ya no recibe nada. |

El motivo de apagar también los dos últimos: al parar «Sondeo Lodgify», Airtable deja de recibir
reservas. Un informe que siga leyendo de ahí no se queda quieto — **empieza a mentir**, cada
semana un poco más. Entre no mandar nada y mandar algo falso, no mandar nada.

**El agujero que eso deja, y que hay que tapar.** La sincronización del SaaS con Lodgify tenía un
único disparador: **un botón en Ajustes**. Nunca ha estado programada; lo automático lo hacían
los workflows de Airtable. Apagados esos, si nadie pulsa el botón no entra ninguna reserva
—y por tanto tampoco se genera ninguna limpieza.

Ya está hecha la mitad: `POST /api/sincronizar` ejecuta la sincronización con el mismo token de
escritura que `/api/importar`, es idempotente y se puede llamar cada hora sin duplicar nada.
**Falta decidir quién la llama**, y son dos líneas de trabajo:

- **Tarea programada de Hostinger.** No añade ningún sistema, pero el token queda escrito en el
  panel de hosting.
- **Un workflow de n8n** cada 3 horas. El token va en una credencial cifrada y queda histórico de
  ejecuciones, que es donde se ve si un día falla.

Recomiendo el de n8n, por el token y por el histórico.

### Fase 1 — que cada una vea lo suyo

**Hecha el 21/09.**

4. ✅ **Separadas.** `/cleaning/tasks` es «Limpiezas» y `/rental/tasks` es «Mantenimiento». Cada
   pantalla enseña solo lo suyo, con su formulario de alta y sin el filtro de tipo, que ya no
   pinta nada. Emma no se queda ciega: el panel del día le sigue diciendo qué vivienda tiene
   salida hoy y no está limpia, y desde ahí se va al tablero de Aires.
5. ✅ El motor de tarifas, con `servicio` y `huespedes` guardados en la limpieza y la regla de los
   7 días copiada de n8n, con sus pruebas.
6. ✅ El tablero de Aires enseña el servicio y los huéspedes, y marca «sin precio» lo que antes
   salía como un 0,00 € que no cantaba.
7. ✅ **Carga de las próximas tres semanas**, con los días de seis o más limpiezas en naranja.
   Sustituye al PDF que mandaba «Previsión mensual limpiezas»: aquel leía de Airtable y se miraba
   una vez; esto está donde se trabaja.

*Lo que no se ha tocado: los permisos. Emma sigue pudiendo entrar al tablero de limpiezas y
asignarlas si hace falta. La separación es de pantallas, no un candado — si quieres que además
no pueda, se cambia en `lib/permisos.ts` y en ningún sitio más.*

### Fase 2 — la ficha del huésped y la policía

**Casi hecha el 21/09.** Todo lo que no depende de la especificación del servicio web:

8. ✅ `Huesped` colgando de la reserva. El **documento y el número de soporte van cifrados**
   (AES-256-GCM): comprobado que en un volcado de la base no aparecen en claro.
9. ✅ **Formulario público** en `/viajeros/<token>`, pensado para el móvil. El enlace se genera
   desde la ficha de la reserva, caduca a los 30 días y de él solo se guarda la huella. Valida el
   dígito de control del DNI y del NIE mientras la persona lo tiene delante, pide el número de
   soporte solo a documentos españoles, y exige el parentesco cuando el viajero es menor.
10. ⏳ **Envío a SES.HOSPEDAJES**: falta la especificación del servicio web.
11. ✅ **Panel de partes pendientes** en Alquileres, ordenado por entrada, con aviso de lo que
    entra en menos de dos días sin datos.

**Un fallo encontrado probándolo, y arreglado.** React vacía el formulario cuando termina una
acción, acierte o falle. Como fallar es lo normal —un DNI mal copiado—, el huésped se encontraba
el formulario **en blanco** con el error encima; corregía el documento, pulsaba y no pasaba nada,
porque los demás campos obligatorios estaban vacíos y el navegador bloqueaba el envío sin decir
ni pío. A esas alturas cualquiera manda una foto del DNI por WhatsApp y se acabó el formulario.
Ahora lo escrito vuelve tal cual y solo hay que corregir el campo que falla.

### Fase 3 — hablar con el huésped

**Empezada el 22/09.** Lo hecho hasta ahora:

- ✅ **Cada vivienda guarda cómo se llega**: dirección, el desvío que no sale en el mapa, dónde
  aparcar, horas de entrada y salida, wifi y normas. Se escribe una vez. El **código de la caja de
  llaves** va aparte y cifrado, y no sale ni por la API ni en el correo.
- ✅ **`/rental/llegadas`** enseña quién entra pronto y **qué falta** por escribir. Las incompletas
  salen en la lista en lugar de desaparecer.
- ✅ **El correo del huésped ya entra desde Lodgify.** No entraba: la sincronización solo se
  quedaba con el nombre. Comprobado en producción el 22/09: **26 de 29** entradas de los próximos
  treinta días traen correo. Los de Booking.com son direcciones de alias del canal
  (`…@guest.booking.com`), que funcionan.
- ✅ **Workflow «Mirador · correo de llegada al huésped»**, tres días antes de la entrada, en modo
  borrador y con el mismo interruptor que el informe.
- ✅ **La hora de entrada, puesta.** Las 16:00 en las viviendas que la tenían vacía, como migración
  de datos y una sola vez: si alguien escribe otra hora, o la borra, se queda como la deje. Era el
  dato que tenía paradas las 30 entradas.
- ✅ **Comprobado en producción el 23/09.** De 0 listas y 30 incompletas se pasó a **26 listas y 3
  incompletas**, y las tres son por lo mismo: el huésped no dejó correo. La ejecución del workflow
  dejó **tres borradores** en Gmail, que es lo que hará cada mañana hasta que se le quite el
  interruptor.
- ⏳ **Falta el wifi, y falta el desvío.** Ninguna vivienda los tiene escritos, así que el correo
  sale con la dirección, el mapa y la hora, y nada más. No lo impide —a una casa se llega con el
  mapa— pero el wifi es la siguiente pregunta que hará el huésped, y contestarla dos días después
  por WhatsApp es justo lo que este correo venía a evitar. Se escribe una vez por vivienda, en su
  ficha.
- ⏳ **Tres reservas sin correo del huésped**: Leonardo Staurenghi, Neil Clemson y Karen Gillespie.
  Se ponen a mano en la propia reserva.

### WhatsApp — EN ESPERA, se activa cuando ellos quieran

**Decidido el 26/09: no se monta ahora.** Queda aquí escrito para que el día que se quiera
activar no haya que reconstruir el razonamiento. No hay nada empezado a medias: lo que hay
hecho funciona sin WhatsApp y seguirá funcionando.

**Lo que ya está listo de nuestro lado**, y es la parte que lleva tiempo:

- El **código de la caja de llaves** se guarda cifrado en cada vivienda (`codigoLlaveCifrado`), y
  ni la API ni el correo lo devuelven nunca — solo dicen si lo hay. Eso no fue una precaución
  abstracta: es exactamente por esto. Un correo se queda para siempre en el buzón de mucha gente
  y ese código no cambia entre un huésped y el siguiente, así que **el código no puede ir por
  correo**. Tiene que ir por un canal que caduque y el día de la entrada, no antes.
- El SaaS ya sabe quién entra, qué día y en qué casa, y lo sirve por `/api/llegadas`. El
  mensaje de WhatsApp leería de ahí, igual que el correo.
- Las reservas traen **teléfono del huésped** cuando el canal lo da (`guestPhone`), que es a
  donde se escribiría.

**Lo que hace falta y no depende de nosotros** — en este orden, porque cada paso bloquea al
siguiente:

1. **Un número de teléfono para WhatsApp Business.** No puede ser uno que ya tenga WhatsApp
   normal asociado. Esta es la decisión de verdad: si se usa el número con el que Emma ya
   contesta a mano, deja de poder usarlo desde el móvil como hasta ahora.
2. **Cuenta de Meta Business con el negocio verificado.** La verificación pide documentación de
   la sociedad y tarda.
3. **Las plantillas, dadas de alta y aprobadas por Meta.** Un mensaje que abre la conversación
   —y el del día de la entrada la abre— tiene que ir con plantilla aprobada; texto libre solo
   vale dentro de la ventana en la que el huésped ha escrito él. La aprobación tarda días, así
   que es lo primero que se pide en cuanto haya número.
4. **La credencial en n8n**, ya con el número y el token.

**Los dos mensajes que se escribirían**, para tenerlos pensados:

- **El día de la entrada**: el código de la caja y poco más. Es el único mensaje que justifica
  WhatsApp en lugar de correo.
- **El día de la salida**: a qué hora hay que dejarla y dónde se deja la llave.

**Lo que conviene comprobar cuando se retome**, porque las reglas de Meta cambian y lo que
está escrito arriba puede haber envejecido: las categorías de plantilla, qué cuesta cada
conversación y cuánto dura la ventana de respuesta libre.

### Fase 3 — lo que queda dentro de la aplicación

15. Bandeja de entrada unificada. Depende de WhatsApp, así que también en espera.

### Fase 4 — informes y cierre (1 semana)

16. ✅ El informe **rehecho contra el SaaS** (no «cambiarle la fuente»: en Airtable no están los
    gastos ni las comisiones contrastadas). El cálculo está en `lib/informe-propietario.ts`, en un
    solo sitio, y lo usan por igual la pantalla y el correo: si estuviera copiado, el propietario
    acabaría recibiendo unas cifras y viendo otras al entrar. Comprobado contra el informe de
    antes, cifra por cifra.
17. ✅ **Registro de envíos.** «Marcar como enviado» / «Entregado a mano» en la pantalla del
    informe, y la lista de los últimos diez en `/rental/reports`. Sin eso, «¿le mandamos ya el de
    septiembre?» solo lo sabe quien lo mandó, y solo mirando su bandeja de enviados.
18. ✅ «Informe semanal propietarios» apagado. **Ya no queda nada leyendo de Airtable.**
19. ✅ **El correo.** Workflow «Mirador · informe mensual al propietario» (22/09). Lee
    `GET /api/informe`, arma el informe con la identidad de Mirador, lo pasa a PDF con Gotenberg
    y lo manda; después apunta el envío con `POST /api/informe`. Probado de punta a punta: PDF de
    22.540 bytes y correo creado, sin que saliera ninguno.

    **Mensual y no semanal, a propósito.** El que recibían salía los viernes, pero la cuota fija
    de Academia son 600 € **al mes**: un informe semanal se la cobraría entera cada viernes, y la
    comisión de gestión solo cuadra con el mes cerrado. Sale el día 1 con el mes que termina.

    **Arranca en modo borrador**, con el interruptor `enviarDeVerdad` a la vista en el nodo
    «Periodo y modo». En `false` deja el correo en borradores de Gmail para leerlo antes de que
    salga; en `true` lo envía y lo apunta. Un borrador no es un envío, por eso solo se apunta
    cuando sale de verdad.

    No se manda informe vacío: sin nada que contar y sin cuota fija, no se escribe. Domingo Javier
    se queda fuera además por no tener correo en el sistema — hay que ponérselo.

---

## 5. Lo que necesito que decidas

1. ~~¿Quién factura?~~ **El SaaS**, y Airtable fuera de todo (21/09).
2. **¿Por qué número va la numeración ahora mismo?** Yurena se lo pide a Emma. Con ese número
   decidimos con la asesoría si el SaaS continúa la serie `2026-NNN` o abre una propia.
3. ~~Las catorce viviendas sin precio.~~ **Resuelto sin preguntar nada.** Las tarifas ya estaban
   asignadas en los datos que vinieron de Mirador: Inversiones Brito Pérez con la suya, y
   Academia Cañada y Domingo Javier con la «Oficial 2026». Solo había que usarlas. Hecho.
4. **El parte de viajeros: falta la especificación del servicio web.** Yurena adjuntó la «Guía
   visual de Hospedajes» (v. 29/08/2025) y la he leído entera, imágenes incluidas. Pero es un
   paso a paso de la web, no una especificación de campos. Lo que sí deja claro:

   - La jerarquía es **entidad → establecimiento**, cada uno con su código.
   - El tipo de comunicación se llama **«Parte de viajeros»**, y hay más tipos.
   - Cada envío devuelve un **código de comunicación**, y se puede **anular**.
   - Hay envío **por lotes**.
   - En los datos de la entidad hay una casilla **«Envío de comunicaciones por servicio web»** y
     un correo para los errores de ese servicio. Ahí se habilita la vía automática.
   - Su sección 14 es **«Descargar documentación del servicio web»**: ahí está la especificación
     técnica de verdad, y solo se puede bajar entrando en la plataforma con certificado.

   **Eso es lo que necesito:** que Yurena entre en SES.HOSPEDAJES, siga la sección 14 y me pase
   ese documento. Con él monto el envío; sin él estaría adivinando el formato.
5. ~~¿Qué número de WhatsApp?~~ Queda apuntado como mejora, para más adelante.
6. ~~¿Quién llama a `POST /api/sincronizar`?~~ **Resuelto el 22/09: un workflow de n8n**, «Aires ·
   traer reservas de Lodgify al SaaS», cada 3 horas y activo. El token va en una credencial
   cifrada y cada ejecución queda registrada. Probado contra producción: 123 reservas leídas, 76
   actualizadas, ninguna sin emparejar.

   Al probarlo salió lo que estaba tapado: `/api/sincronizar` devolvía **401 desde el
   middleware**, porque la web corría una compilación anterior a que la ruta existiera. Había
   nueve commits sin desplegar, y con ellos estaban fuera de servicio también el formulario del
   huésped y el informe. Desplegado el 22/09 con permiso.

---

## 6. Lo que no recomiendo

- **Sacar los datos de documentos de identidad del SaaS.** Se quedan aquí, cifrados, y de aquí
  salen solo hacia SES.HOSPEDAJES.
- **Mandar códigos de llave por email.** El correo se queda para siempre en el buzón de mucha
  gente. WhatsApp el día de la entrada, y que caduque. Mientras WhatsApp esté en espera esto
  significa que **el código se sigue mandando a mano**, y así lo dice la pantalla donde se
  guarda: sale mal decirle a quien lo escribe que ya se manda solo.
- **Automatizar la respuesta al huésped con IA sin que alguien la lea**, al menos al principio.
  Sugerir la respuesta, sí; enviarla sola, no.
- **Volver a poner nada en Airtable.** Decidido el 21/09: fuera de todo. n8n se queda, pero solo
  para lo que el SaaS no puede hacer por sí mismo —sacar correos, hablar con SES.HOSPEDAJES,
  WhatsApp—, y siempre leyendo del SaaS.

---

## 7. Pendientes anteriores que siguen abiertos

- ~~El workflow «Mirador · cargar reservas Lodgify» sigue activo cada 3 horas.~~ Apagado. Su
  hueco lo cubre `POST /api/sincronizar`, que hoy no lo llama nadie (decisión 6).
- La tabla `documentos_ocr` de Supabase puede sobrar ya.
- El OCR nunca se ha probado contra el modelo real: no había clave en la sesión.
- Falta el propietario del Apto 103 («histórico – pendiente de identificar»).
- Los datos fiscales de Aires Majoreros SL (B88933890 y su domicilio) hay que meterlos en
  Ajustes: sin ellos la factura no cumple el RD 1619/2012. El formulario ya existe, está vacío.
