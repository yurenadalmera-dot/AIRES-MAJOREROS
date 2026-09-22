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

Arreglado: la sincronización también las precisa, tocando solo lo que está vacío. Un precio
distinto de 0 es un precio que puso alguien.

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

### Fase 3 — hablar con el huésped (2–3 semanas)

12. Plantillas de WhatsApp dadas de alta en Meta — **esto se pide el primer día de la fase 2**,
    porque la aprobación tarda.
13. El guion de la estancia, con los mensajes saliendo por n8n.
14. Códigos de llave cifrados, con envío el día de la entrada y no antes.
15. Bandeja de entrada unificada dentro de la aplicación.

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
19. ⏳ **El correo en sí.** `GET /api/informe?start=&end=` ya devuelve los números de cada
    propietario, con el mismo token que `/api/importar`; `POST /api/informe` apunta el envío.
    Falta el workflow que con eso redacte el correo, adjunte el PDF y lo mande. **No lo monto sin
    que Yurena lo diga**: el primer disparo le llega a propietarios de verdad.

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
  gente. WhatsApp el día de la entrada, y que caduque.
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
