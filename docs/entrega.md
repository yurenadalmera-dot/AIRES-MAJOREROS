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

## Dar de alta a alguien

1. Entrar como administración y abrir **Alquileres → Ajustes**.
2. En «Usuarios y accesos», desplegar **+ Dar de alta a alguien**.
3. Nombre, correo y rol → **Crear y generar contraseña**.
4. La contraseña aparece en un recuadro amarillo. **Es la única vez que se ve.** Copiarla y
   entregársela a esa persona.

La contraseña no se guarda en claro en ningún sitio, solo su huella cifrada. Si se pierde no se
puede recuperar: se pulsa **Restablecer contraseña**, que genera otra y la enseña, también una
sola vez.

## Lo que hace cada persona la primera vez

1. Entra en https://airesmajoreros.pro con su correo y la contraseña que le habéis dado.
2. Arriba a la derecha, pincha en su nombre → **Mi cuenta**.
3. **Cambiar mi contraseña**: la actual, la nueva dos veces. Mínimo 10 caracteres.

A partir de ahí la contraseña es suya y nadie más la conoce, tampoco la administración. Esto
**se mantiene entre despliegues**: ningún reinicio ni actualización de la aplicación la revierte.

## Quitar el acceso a alguien

En la misma pantalla, **Desactivar**. Tiene efecto inmediato, incluso si esa persona tiene la
sesión abierta: la comprobación se hace en cada página que carga, no solo al entrar.

No se borra a nadie, se desactiva — así las limpiezas y facturas que hizo siguen teniendo nombre.

La aplicación no deja desactivarse a uno mismo, ni dejar la casa sin ninguna cuenta de
administración activa.

## Cuentas que ya existen

- `info@airesmajoreros.pro` — **Administración**. Es la cuenta con la que se dan de alta las
  demás. Su contraseña se entrega aparte, nunca por escrito en este repositorio.
- `emma@airesmajoreros.pro` — **Gestión de alquiler**.
- `alejandra@airesmajoreros.pro` — **Socia**.
- `limpieza@airesmajoreros.pro` — **Personal**. Cuenta compartida del equipo de limpieza.

  Estas tres se crean en el arranque desde `lib/altas-iniciales.ts`, que solo guarda el hash de
  la contraseña, nunca la contraseña. Ese módulo **solo crea lo que falta**: una cuenta que ya
  existe no se toca, ni su contraseña, ni su rol, ni si está activa.

  > ⚠️ Los tres correos son **nombres de usuario**, no buzones. El plan de correo contratado
  > tiene **una sola cuenta**, `info@airesmajoreros.pro`, así que escribir a `emma@…`,
  > `alejandra@…` o `limpieza@…` no llega a nadie. Para entrar en la aplicación funcionan
  > perfectamente; para recibir correo habría que ampliar el plan.
- Cuatro cuentas `@example.com` de la demostración inicial (`emma@`, `socia1@`, `socia2@`,
  `admin@`): **desactivadas a propósito** y comprobado en cada arranque que no dejan entrar. No
  hay que hacer nada con ellas.

## Si se pierde la contraseña de administración

Es el único caso que no se arregla desde la aplicación, porque no queda nadie dentro para
restablecerla. Se hace desde hPanel → el sitio → Node.js → Variables de entorno:

1. Poner la nueva contraseña en `ADMIN_PASSWORD`.
2. Añadir `ADMIN_PASSWORD_RESET` con el valor `1`.
3. Reiniciar la aplicación y entrar con ella.
4. **Quitar `ADMIN_PASSWORD_RESET`**: mientras esté puesta, cada arranque vuelve a restablecerla.
