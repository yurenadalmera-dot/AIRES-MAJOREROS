# Plataforma de gestión — Alquileres vacacionales & Facturación de limpiezas

Aplicación web de gestión para dos negocios relacionados que comparten operativa:

- **Alquileres vacacionales** (en esta demo: *Emma Ferrer*): panel operativo, calendario de
  ocupación, gestión de reservas, estado de viviendas, asignación de limpiezas y mantenimiento,
  e informes por propietario.
- **Facturación de limpiezas** (en esta demo: *Aires Majoreros*): facturación automática de las
  limpiezas realizadas en la operativa de alquiler, historial de facturas y reparto configurable
  entre socias.

Un conmutador en la barra lateral permite cambiar entre los dos negocios sin salir de la app.

> ⚠️ Todos los datos (viviendas, propietarios, huéspedes, empleadas, importes) son **ficticios**,
> generados para poder probar la aplicación de principio a fin. No contiene NIF/CIF, IBAN ni
> ningún dato bancario o financiero real — los campos correspondientes están vacíos y marcados
> para configurarse antes de un uso real.

## Arquitectura

- **Frontend + backend**: [Next.js 15](https://nextjs.org) (App Router) + TypeScript, en un único
  proyecto full-stack. La lectura de datos se hace en Server Components (consultas directas a
  Prisma); las escrituras usan **Server Actions** (`lib/actions/*.ts`), sin necesidad de una capa
  de API REST aparte. Tailwind CSS para el estilo, con hoja de impresión (`@media print`) para
  informes y facturas.
- **Base de datos**: [Prisma ORM](https://www.prisma.io) sobre **MySQL**, la que viene incluida en
  el propio plan de Hostinger (`srv2067.hstgr.io:3306`, base `u143635831_airesmaj`). Vive en la
  misma máquina que la aplicación, así que la conexión no sale a internet y no hay *connection
  pooler* de por medio. Una sola variable, `DATABASE_URL`; ver `.env.example`.

  El esquema es portable a propósito: los campos que podrían ser `enum` se modelan como `String`
  y se validan en `lib/constants.ts`, así que cambiar de motor es cambiar el `datasource` de
  `prisma/schema.prisma` y poco más.
- **Hosting**: [Hostinger](https://hostinger.com) (hosting Node.js, plan Business), dominio propio
  `airesmajoreros.pro`. El build (`npm run build`) genera la app Next.js en modo `next start`
  estándar sobre el hosting Node.js de Hostinger — no hay funciones serverless ni modo demo
  autocontenido: siempre se conecta a la base de datos real configurada en `DATABASE_URL`.
- **Correo**: buzón `info@airesmajoreros.pro` con el mismo dominio, gestionado desde el panel de
  Hostinger (Correo).
- **Modelo de datos multi-negocio**: todo cuelga de una `Organization` → varios `Business`
  (`RENTAL_MANAGEMENT` / `CLEANING_BILLING`). Nombres, comisiones, precios de limpieza y reparto
  entre socias son datos configurables, no están escritos en el código, para poder reconfigurar
  la plataforma a otro cliente del sector.
- **Registro compartido "limpieza"**: `CleaningTask` es una única tabla que sirve a la vez como
  tarea operativa (calendario/asignación en el negocio de alquiler) y como línea facturable (en
  cuanto está `DONE`, aparece en el panel de facturación; al facturarse se le asigna un
  `invoiceId` y desaparece de "pendientes"). No hay duplicación de datos entre los dos negocios.
- **Vistas compartidas entre negocios**: el tablero de limpieza/mantenimiento y los informes por
  propietario son accesibles desde **ambos** paneles, porque la empresa de limpiezas es quien
  gestiona y factura ese trabajo. No son páginas duplicadas: `components/shared/*` contiene la
  vista real y las rutas de `/rental/*` y `/cleaning/*` son envoltorios finos que la renderizan
  con el mismo `organizationId`. Un cambio de estado o de asignación hecho desde un panel se ve
  inmediatamente en el otro, porque es el mismo registro.
- **Integración Lodgify** (`lib/lodgify.ts`, `lib/actions/lodgify-sync.ts`): recorre todas las
  páginas de reservas, se queda solo con las confirmadas (`Booked`), descarta
  `Declined`/`Cancelled`/`Tentative`, empareja `property_id` con la vivienda mediante
  `Property.lodgifyPropertyId`, y crea o actualiza por `lodgifyBookingId` (clave única) sin
  duplicar. Las reservas marcadas `manuallyAdjusted` nunca se sobrescriben. Como Lodgify no
  desglosa comisión de plataforma ni bancaria, se calculan aplicando automáticamente los
  porcentajes configurados en Ajustes sobre el precio total. Sin `LODGIFY_API_KEY` configurada,
  el sync usa datos de demostración paginados (`lib/lodgify-mock-data.ts`) que ejercitan la misma
  lógica de punta a punta.
- **Autenticación**: sesión propia con cookie `httpOnly` firmada (JWT vía `jose`) y contraseñas
  con `bcrypt`. Sin proveedores externos — suficiente para una herramienta interna.

## Producción

La aplicación está publicada en **https://airesmajoreros.pro**.

| Pieza | Dónde | Detalle |
|---|---|---|
| App | Hostinger, hosting Node.js (plan Business) | Next.js, Node 22, `npm run build` → `next start` |
| Base de datos | Hostinger, MySQL incluido en el plan | `u143635831_airesmaj` en `srv2067.hstgr.io:3306`, 3 GB |
| Dominio | Hostinger | `airesmajoreros.pro`, DNS gestionado en Hostinger |
| Correo | Hostinger (Starter Business Email) | `info@airesmajoreros.pro`, con SPF, DKIM y DMARC |

### Despliegue

Hostinger construye desde el repositorio de GitHub, rama
`claude/rental-cleaning-management-app-hrv9wg`. El progreso y los logs se ven en hPanel → el sitio
→ Node.js → Compilaciones.

> ⚠️ **El auto-despliegue por push no está configurado.** La cuenta tiene la instalación de GitHub
> conectada, pero el sitio no tiene guardada ninguna regla de auto-despliegue, así que un push por
> sí solo no construye nada: hay que lanzar la compilación desde hPanel. Si se quiere el
> comportamiento automático, se configura en hPanel → el sitio → Avanzado → Git.

> ⚠️ **Un build que falla deja el sitio con la página por defecto de Hostinger.** El despliegue
> sustituye el contenido antes de saber si la compilación va a terminar, así que un fallo no deja
> la versión anterior en su sitio: deja el `default.php`. Conviene no lanzar compilaciones a
> ciegas contra producción.

Las variables de entorno se configuran en hPanel → el sitio → Node.js → Variables de entorno, y
son tres: `DATABASE_URL`, `AUTH_SECRET` y `ADMIN_PASSWORD` (ver `.env.example` para el formato).

`ADMIN_PASSWORD` es la contraseña de `info@airesmajoreros.pro`. El seed da de alta esa cuenta —o
le restablece la contraseña, si ya existe— en **cada** despliegue, así que cambiarla es cambiar la
variable y relanzar el build. No está escrita en ningún sitio del repositorio a propósito.

### Cómo se prepara la base de datos

Lo normal sería aplicar el esquema en el despliegue. Aquí no se puede, por una restricción que
conviene tener clara antes de tocar nada:

> **La base solo acepta conexiones desde el propio servidor de hosting.** No hay ninguna IP remota
> dada de alta (hPanel → Bases de datos → Acceso remoto), así que ni el build —que corre en un
> contenedor aparte— ni ninguna máquina de fuera llegan a ella. Un `prisma db push` desde el build
> falla con `P1000: Authentication failed` **aunque la contraseña sea correcta**: lo que se
> rechaza es el origen, no las credenciales, y el mensaje despista mucho.

El único proceso con acceso es la propia aplicación. Así que es ella quien prepara la base, al
arrancar (`instrumentation.ts`, que Next.js ejecuta una vez por proceso antes de atender
peticiones):

1. Si no existe la tabla `User`, crea el esquema entero con las sentencias de
   `lib/esquema-inicial.ts` y siembra los datos de ejemplo.
2. Si ya existe, no toca el esquema ni siembra; solo repasa la cuenta de administración.

Es idempotente y no destruye nada. Passenger arranca varios procesos a la vez, así que la creación
va dentro de un `GET_LOCK` de MySQL: uno crea las tablas y los demás se lo encuentran hecho. Si
algo falla, **la aplicación arranca igual** y el error queda en los logs de Node.js — un sitio que
responde «no hay base de datos» se diagnostica; uno que no arranca, no.

`DB_AUTO_SETUP=0` desactiva todo esto.

**Cuando cambie `prisma/schema.prisma`** hay que regenerar `lib/esquema-inicial.ts`:

```bash
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
```

Eso da el SQL nuevo (sin conectar a ninguna base). Ojo: ese fichero solo se aplica sobre una base
**vacía**. Migrar una base que ya tiene datos es otra cosa, y hoy pasa por ejecutar el SQL a mano
desde phpMyAdmin (hPanel → Bases de datos → phpMyAdmin), que es el otro sitio desde el que se
llega a la base.

> ⚠️ **No definir `NODE_ENV` ahí.** Con `NODE_ENV=production`, el `npm install` del build omite
> las `devDependencies`; sin `typescript` instalado, Next.js deja de leer los `paths` de
> `tsconfig.json` y el build falla entero con `Module not found: Can't resolve '@/lib/...'`.
> Next.js ya fija `NODE_ENV=production` por su cuenta en `next build` y `next start`. Se
> reconoce en los logs de compilación: un build sano audita ~127 paquetes, uno roto ~38.

> ⚠️ **Las variables de entorno se pierden con el primer despliegue desde GitHub.** Si tras un
> redespliegue la aplicación da un error de conexión a base de datos, hay que volver a
> introducirlas.

### Seguridad de la base de datos

La restricción de arriba es, vista del derecho, la mejor propiedad de seguridad que tiene el
montaje: **la base no está expuesta a internet**. La única vía de entrada a los datos es la propia
aplicación, y la única forma de autenticarse en ella es la tabla `User` (contraseñas con `bcrypt`,
sesión en cookie `httpOnly` firmada).

Dar de alta un acceso remoto con `%` haría que el build pudiera aplicar el esquema, sí, pero a
cambio de dejar la base accesible desde cualquier host con solo la contraseña. No se ha hecho, y
no conviene hacerlo.

## Puesta en marcha

```bash
npm install
cp .env.example .env        # rellena DATABASE_URL y AUTH_SECRET
npm run db:push             # crea las tablas
npm run db:seed             # carga los datos de ejemplo (Fuerteventura)
npm run dev                 # http://localhost:3000
```

**La siembra no pisa datos existentes.** `npm run db:seed` comprueba primero si ya hay
organizaciones; si las hay, no toca nada y lo dice. Para reconstruir desde cero hace falta pedirlo
a las claras:

```bash
npm run db:seed -- --force   # BORRA las 13 tablas y vuelve a sembrar
npm run db:reset             # además reinicia el esquema (--force-reset)
```

Esa guarda es la que permite tener la siembra dentro del `build` sin que cada despliegue borre lo
que haya escrito la clienta.

### Usuarios de demostración

Contraseña para todos: `demo1234`

| Email | Rol |
|---|---|
| `emma@example.com` | Gestión de alquileres |
| `socia1@example.com` / `socia2@example.com` | Socias de Aires Majoreros |
| `admin@example.com` | Administración |

Cualquier usuario puede alternar entre los dos negocios con el conmutador de la barra lateral.

## Probar la sincronización con Lodgify

En **Alquileres → Ajustes → Integración con Lodgify**, pulsa "Sincronizar ahora". Sin
`LODGIFY_API_KEY` configurada corre en modo demo: crea reservas nuevas, actualiza las existentes,
descarta las no confirmadas, salta la que está marcada como ajustada manualmente y reporta la
vivienda cuyo `property_id` no tiene ninguna vivienda emparejada — para que se vea el
comportamiento completo sin necesitar credenciales reales.

Para conectar con Lodgify de verdad: define `LODGIFY_API_KEY` en el entorno del servidor (nunca en
el cliente) y configura el `lodgifyPropertyId` de cada vivienda en **Viviendas**.

## Estructura del proyecto

```
app/                    Rutas (App Router). app/rental/* y app/cleaning/* son los dos negocios.
components/             Componentes de UI compartidos y formularios.
components/shared/      Vistas que ambos negocios renderizan (tablero de tareas, informes).
lib/actions/            Server Actions (mutaciones): reservas, tareas, propiedades, facturas...
lib/lodgify*.ts         Cliente de integración con Lodgify + datos de demostración.
lib/status.ts           Cálculo del estado de cada vivienda a partir de reservas y tareas.
lib/money.ts            Cálculo de comisiones, neto a percibir y reparto entre socias.
prisma/schema.prisma    Modelo de datos.
prisma/seed.ts          Datos ficticios de ejemplo (Fuerteventura).
```

## Limitaciones conocidas de esta demo

- No hay gestión de IVA/impuestos en las facturas — configúralo con la asesoría antes de un uso
  real.
- Los informes y facturas se generan como vista imprimible (usa "Imprimir / Guardar PDF" del
  navegador); no hay generación de PDF en servidor ni envío de email automático.
- No hay control de permisos granular por rol dentro de una misma organización (todo usuario
  autenticado ve ambos negocios).
- El validador de formularios de servidor devuelve errores genéricos; no hay mensajes de campo a
  campo.
