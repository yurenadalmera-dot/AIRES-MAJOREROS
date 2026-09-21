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

## 1. Lo que está roto, por orden de lo que cuesta

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

**El riesgo serio es la numeración de facturas.** Si «Facturar limpiezas» sigue numerando desde
2026-005 en Airtable y el SaaS numera por su cuenta, se emiten dos facturas con el mismo número.
Eso no se arregla luego con un parche: se arregla con una rectificativa.

Hay que decidir quién manda, y apagar el resto el mismo día.

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
enviado por email. Lee de **Airtable**.

El trabajo no es montar el envío, es **cambiarle la fuente**: que lea del SaaS, donde están los
gastos, las comisiones contrastadas y la escalera de cuotas que corregimos ayer. Y de paso
hacerle la v2 que su propia descripción dice que falta: adjuntar el PDF.

El informe del SaaS ya está montado y ya sale bien —lo tienes en `/rental/reports`—. Lo que
necesita es una ruta que lo devuelva en PDF y un botón de «enviar al propietario» que deje
constancia de a quién y cuándo se envió.

---

## 4. El plan

### Fase 0 — parar la hemorragia (esta semana)

Antes de añadir nada. Son horas, no días.

1. **Poner precio a las catorce viviendas.** O, mejor, encender el motor de tarifas (1.2) y que
   el precio salga solo. Mientras tanto, que Lodgify y el alta manual **se nieguen** a crear una
   limpieza sin precio, igual que ya hace el alta a mano.
2. **Decidir quién factura** y apagar lo demás. Si manda el SaaS, «Facturar limpiezas» y
   «Generar limpiezas» de n8n se apagan el mismo día, y la numeración del SaaS arranca donde lo
   dejó Airtable.
3. **Apagar «Mirador · cargar reservas Lodgify»**, que sigue corriendo cada 3 horas y ya no hace
   falta.

### Fase 1 — que cada una vea lo suyo (1–2 semanas)

4. Separar limpiezas y mantenimiento como en el punto 2.
5. Enchufar el motor de tarifas, con `servicio` (salida/repaso) en `CleaningTask` y la regla de
   los 7 días traída de n8n.
6. Enseñar en el tablero de Aires los huéspedes, la reserva y los turnarounds del mismo día.
7. Vista de carga por día, con aviso de los días fuertes.

Al final de esta fase Aires factura bien sola, que es de donde sale el dinero.

### Fase 2 — la ficha del huésped y la policía (2–3 semanas)

8. Entidad `Huesped`, cifrada.
9. Formulario público con enlace único por reserva, con OCR del documento.
10. Envío a SES.HOSPEDAJES desde n8n y acuse guardado.
11. Panel de partes pendientes.

*Empieza cuando la asesoría confirme campos y plazos.*

### Fase 3 — hablar con el huésped (2–3 semanas)

12. Plantillas de WhatsApp dadas de alta en Meta — **esto se pide el primer día de la fase 2**,
    porque la aprobación tarda.
13. El guion de la estancia, con los mensajes saliendo por n8n.
14. Códigos de llave cifrados, con envío el día de la entrada y no antes.
15. Bandeja de entrada unificada dentro de la aplicación.

### Fase 4 — informes y cierre (1 semana)

16. El informe semanal leyendo del SaaS, con PDF adjunto.
17. Botón de «enviar al propietario» con registro de envíos.
18. Apagar los últimos workflows de Airtable.

---

## 5. Lo que necesito que decidas

1. **¿Quién factura las limpiezas a partir de ahora, el SaaS o n8n+Airtable?** Es la decisión que
   bloquea todo lo demás, y la que puede duplicar un número de factura si se deja a medias.
2. **¿Por qué número va la numeración ahora mismo?** «Facturar limpiezas» dice que arranca en
   2026-005; necesito el último emitido de verdad.
3. **Las catorce viviendas sin precio: ¿tarifa o precio cerrado?** Si me dices qué tarifa le toca
   a cada propietario, lo dejo calculado y no hay que tocarlo más.
4. **¿Confirmamos con la asesoría el parte de viajeros** antes de que yo programe nada de la
   fase 2?
5. **¿Qué número de WhatsApp?** Uno de empresa, que no sea el personal de nadie: una vez dado de
   alta en la plataforma de Meta, deja de funcionar en la app normal de WhatsApp.

---

## 6. Lo que no recomiendo

- **Meter datos de documentos de identidad en Airtable.** Ni como paso intermedio.
- **Mandar códigos de llave por email.** El correo se queda para siempre en el buzón de mucha
  gente. WhatsApp el día de la entrada, y que caduque.
- **Automatizar la respuesta al huésped con IA sin que alguien la lea**, al menos al principio.
  Sugerir la respuesta, sí; enviarla sola, no.
- **Seguir añadiendo funciones en n8n contra Airtable.** Cada una que se añada ahí es una que
  habrá que mudar después.

---

## 7. Pendientes anteriores que siguen abiertos

- El workflow «Mirador · cargar reservas Lodgify» sigue activo cada 3 horas.
- La tabla `documentos_ocr` de Supabase puede sobrar ya.
- El OCR nunca se ha probado contra el modelo real: no había clave en la sesión.
- Falta el propietario del Apto 103 («histórico – pendiente de identificar»).
- Los datos fiscales de Aires Majoreros SL (B88933890 y su domicilio) hay que meterlos en
  Ajustes: sin ellos la factura no cumple el RD 1619/2012. El formulario ya existe, está vacío.
