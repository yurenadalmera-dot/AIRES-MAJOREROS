# Entrega: accesos para cada persona

Cómo se da de alta a la gente y qué puede hacer cada una. Las contraseñas **no** se escriben
aquí: la aplicación las genera y las enseña una sola vez, en pantalla, para copiarlas y
entregarlas.

La aplicación está en **https://airesmajoreros.pro**.

## Qué puede hacer cada rol

| Rol | En la aplicación | Reservas y viviendas | Limpiezas | Facturas | Datos fiscales, reparto entre socias, altas de personal |
|---|---|---|---|---|---|
| **Administración** (`ADMIN`) | todo | ✅ | ✅ | ✅ | ✅ |
| **Gestión de alquiler** (`RENTAL_MANAGER`) | el panel de alquileres | ✅ | ✅ | ❌ | ❌ |
| **Socia** (`PARTNER`) | el panel de limpiezas | ❌ | ✅ | ✅ | ❌ |
| **Personal** (`STAFF`) | solo su trabajo del día | ❌ | solo marcar una limpieza como hecha | ❌ | ❌ |

> ⚠️ Este reparto es una **propuesta**, no una regla del negocio confirmada. Si no encaja con
> cómo trabajáis, se cambia en `lib/permisos.ts` y en ningún sitio más. Quien entra con un rol
> aterriza directamente en la parte que le corresponde; si intenta ir a otra, la aplicación le
> devuelve a la suya.

## Antes de empezar a trabajar: vaciar los datos de demostración

La base de datos se creó vacía y el primer arranque la llenó con **siete viviendas, diecisiete
reservas y cuatro propietarios inventados**, para poder enseñar y probar la aplicación. No
corresponden a nada real.

En **Alquileres → Ajustes → Datos de la aplicación** se ve qué hay y, si son de demostración, un
aviso. Ahí mismo, «Empezar de cero» los borra: hay que escribir `BORRAR` para confirmar, porque
no se puede deshacer y no hay copia de seguridad.

Lo que **no** se toca: las cuentas de acceso y los datos fiscales de las dos empresas (CIF,
dirección, numeración de facturas). Y una vez vaciado, no vuelven: los reinicios y despliegues
no siembran nada mientras exista la organización.

## Dar de alta a alguien

1. Entrar como administración y abrir **Alquileres → Ajustes**.
2. En «Usuarios y accesos», desplegar **+ Dar de alta a alguien**.
3. Nombre, correo y rol → **Crear y generar contraseña**.
4. La contraseña aparece en un recuadro amarillo. **Es la única vez que se ve.** Copiarla y
   entregársela a esa persona.

Esa contraseña es **de un solo uso**: sirve para entrar la primera vez y nada más. Mientras no
la haya cambiado, en su fila pone «Contraseña de un solo uso · aún no la ha cambiado».

La contraseña no se guarda en claro en ningún sitio, solo su huella cifrada. Si se pierde no se
puede recuperar: se pulsa **Restablecer contraseña**, que genera otra —también de un solo uso— y
la enseña, también una sola vez.

**El correo tiene que ser uno que esa persona lea.** Es adonde le llega el enlace si olvida la
contraseña. Se puede corregir después con «cambiar», junto al correo.

## Lo que hace cada persona la primera vez

1. Entra en https://airesmajoreros.pro con su correo y la contraseña que le habéis dado. El ojo
   que hay dentro de la casilla enseña lo que está escribiendo.
2. La aplicación la lleva sola a **poner su contraseña**: la que le han dado, y la nueva dos
   veces. Mínimo 10 caracteres. **No puede hacer nada más hasta que lo haga**: cualquier otra
   pantalla la devuelve ahí.
3. Al guardar entra ya en su panel.

A partir de ahí la contraseña es suya y nadie más la conoce, tampoco la administración; la que
se le entregó deja de valer. Esto **se mantiene entre despliegues**: ningún reinicio ni
actualización de la aplicación la revierte. Para cambiarla otra vez: su nombre, arriba a la
derecha → **Mi cuenta**.

## Si alguien olvida su contraseña

No hace falta llamar a nadie:

1. En la pantalla de entrada, **¿Has olvidado tu contraseña?**
2. Escribe su correo. En un par de minutos le llega un enlace.
3. El enlace abre una pantalla donde se pone una contraseña nueva, y con ella entra.

El enlace **caduca a los 30 minutos y sirve una sola vez**. Pedir otro anula el anterior. Se
pueden pedir como mucho tres por hora.

La pantalla contesta lo mismo exista o no una cuenta con ese correo —si no, serviría para
averiguar quién tiene cuenta—, así que **si el correo no llega, lo más probable es que ese no
sea el correo de su cuenta**: se mira en Ajustes → Usuarios y accesos.

El correo lo manda n8n (workflow «Aires · correo para recuperar la contraseña»), que pasa cada
minuto por `/api/recuperaciones` con el mismo token que la sincronización. **Si n8n está parado,
el correo no sale**; pasada media hora la petición se descarta y hay que volver a pedirlo. Mientras
tanto sigue valiendo lo de siempre: administración pulsa **Restablecer contraseña**.

> ⚠️ Lo que n8n recoge ahí son **llaves**: enlaces que abren una cuenta durante media hora. Ese
> workflow tiene que tener desactivado el guardado de las ejecuciones correctas (Ajustes del
> workflow → «Save successful production executions» → no guardar). Si se guardaran, cada enlace
> quedaría escrito en el historial de n8n. Y el token de Ajustes pasa a valer más que antes: con
> él se puede entrar en la cuenta de cualquiera que no sea administración. Si se sospecha que ha
> salido de n8n, se genera otro en Ajustes y se cambia en la credencial.

## Quitar el acceso a alguien

En la misma pantalla, **Desactivar**. Tiene efecto inmediato, incluso si esa persona tiene la
sesión abierta: la comprobación se hace en cada página que carga, no solo al entrar.

No se borra a nadie, se desactiva — así las limpiezas y facturas que hizo siguen teniendo nombre.

La aplicación no deja desactivarse a uno mismo, ni dejar la casa sin ninguna cuenta de
administración activa. Tampoco restablecerse la contraseña a uno mismo desde esa pantalla —la
propia se cambia en «Mi cuenta»—: la nueva sería de un solo uso y la aplicación mandaría a
cambiarla antes de haber llegado a verla.

## Cuentas que ya existen

- `info@airesmajoreros.pro` — **Administración**. Es la cuenta con la que se dan de alta las
  demás. Su contraseña se entrega aparte, nunca por escrito en este repositorio.
- `emma@airesmajoreros.pro` — **Gestión de alquiler**.
- `alejandra@airesmajoreros.pro` — **Socia**.
- `limpieza@airesmajoreros.pro` — **Personal**. Cuenta compartida del equipo de limpieza.

  > ⚠️ Los tres correos son **nombres de usuario**, no buzones. El plan de correo contratado
  > tiene **una sola cuenta**, `info@airesmajoreros.pro`, así que escribir a `emma@…`,
  > `alejandra@…` o `limpieza@…` no llega a nadie. Para entrar en la aplicación funcionan
  > perfectamente, pero **«he olvidado mi contraseña» manda el enlace a ese correo y no les
  > llegaría**. Por eso a Emma y a Alejandra hay que ponerles su correo de verdad: en Ajustes →
  > Usuarios y accesos, «cambiar» junto al correo, y después **Restablecer contraseña** para
  > darles una de un solo uso.

  La de limpieza la sigue creando el arranque si falta, desde `lib/altas-iniciales.ts`, que solo
  guarda el hash de la contraseña. Ese módulo **solo crea lo que falta**: una cuenta que ya
  existe no se toca. Emma y Alejandra ya no están en esa lista —si estuvieran, cambiarles el
  correo las haría reaparecer con el antiguo en el siguiente despliegue—, y por lo mismo a la de
  limpieza no se le puede cambiar el correo desde Ajustes mientras siga en ella.
- Cuatro cuentas `@example.com` de la demostración inicial (`emma@`, `socia1@`, `socia2@`,
  `admin@`): **desactivadas a propósito** y comprobado en cada arranque que no dejan entrar. No
  hay que hacer nada con ellas.

## Si se pierde la contraseña de administración

Es el único caso que no se arregla desde la aplicación. **«¿Has olvidado tu contraseña?» no
vale para las cuentas de administración, a propósito**: el enlace no lo manda la aplicación, se
lo entrega a n8n, que lo recoge con el token de Ajustes. Si ese enlace pudiera ser el de
administración, quien tuviera ese token podría pedirlo, recogerlo él mismo y quedarse con la
aplicación entera sin que saliera un solo correo. La pantalla contesta lo mismo que a cualquiera
—no dice que la cuenta sea de administración—, pero el correo no llega.

Se hace desde hPanel → el sitio → Node.js → Variables de entorno:

1. Poner la nueva contraseña en `ADMIN_PASSWORD`.
2. Añadir `ADMIN_PASSWORD_RESET` con el valor `1`.
3. Reiniciar la aplicación y entrar con ella.
4. **Quitar `ADMIN_PASSWORD_RESET`**: mientras esté puesta, cada arranque vuelve a restablecerla.
