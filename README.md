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
- **Base de datos**: [Prisma ORM](https://www.prisma.io) sobre **PostgreSQL**, alojada en
  [Supabase](https://supabase.com) (proyecto `aires-majoreros`). La app se conecta con un rol
  dedicado (`app_owner`, sin privilegios de superusuario) a través del *connection pooler* de
  Supabase (Supavisor): `DATABASE_URL` usa el puerto de transacción (6543) para las consultas de
  la app, `DIRECT_URL` usa el puerto de sesión (5432) para `prisma db push` / `migrate`, que no
  funcionan a través del modo transacción. Ver `.env.example`.
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
| Base de datos | Supabase, proyecto `aires-majoreros` | PostgreSQL 17, región `eu-west-1` |
| Dominio | Hostinger | `airesmajoreros.pro`, DNS gestionado en Hostinger |
| Correo | Hostinger (Starter Business Email) | `info@airesmajoreros.pro`, con SPF, DKIM y DMARC |

### Despliegue

Hostinger está conectado al repositorio de GitHub: **cada push a la rama por defecto
(`claude/rental-cleaning-management-app-hrv9wg`) lanza un build y un redespliegue automáticos**.
El progreso y los logs se ven en hPanel → el sitio → Node.js → Compilaciones.

Las variables de entorno se configuran en hPanel → el sitio → Node.js → Variables de entorno, y
son exactamente tres: `DATABASE_URL`, `DIRECT_URL` y `AUTH_SECRET` (ver `.env.example` para el
formato).

> ⚠️ **No definir `NODE_ENV` ahí.** Con `NODE_ENV=production`, el `npm install` del build omite
> las `devDependencies`; sin `typescript` instalado, Next.js deja de leer los `paths` de
> `tsconfig.json` y el build falla entero con `Module not found: Can't resolve '@/lib/...'`.
> Next.js ya fija `NODE_ENV=production` por su cuenta en `next build` y `next start`. Se
> reconoce en los logs de compilación: un build sano audita ~127 paquetes, uno roto ~38.

> ⚠️ **Las variables de entorno se pierden con el primer despliegue desde GitHub.** Si tras un
> redespliegue la aplicación da un error de conexión a base de datos, hay que volver a
> introducirlas.

> ⚠️ **La cadena de conexión debe llevar el identificador del proyecto en el usuario.** El pooler
> de Supabase (Supavisor) enruta por ahí: el usuario es `app_owner.<project_ref>`, no `app_owner`
> a secas. Con el usuario sin el sufijo, la conexión se rechaza en el pooler y en los logs de
> Supabase no aparece ni el intento.

### Seguridad de la base de datos

Las tablas tienen **RLS (Row Level Security) activado sin ninguna política**, lo que bloquea por
completo el acceso a través de la API pública de Supabase (roles `anon` / `authenticated`), que
además no tienen ningún privilegio concedido sobre el esquema `public`. La aplicación no usa el
cliente de Supabase: se conecta por Prisma con el rol `app_owner`, que tiene el atributo
`BYPASSRLS` y por tanto trabaja con normalidad. Si algún día se quisiera usar el SDK de Supabase
desde el navegador, habría que escribir políticas RLS explícitas antes.

## Puesta en marcha

```bash
npm install
cp .env.example .env        # rellena DATABASE_URL / DIRECT_URL (Supabase) y AUTH_SECRET
npm run db:push             # crea las tablas en PostgreSQL
npm run db:seed             # carga los datos de ejemplo (Fuerteventura)
npm run dev                 # http://localhost:3000
```

`npm run db:reset` hace ambas cosas de golpe (reinicia el esquema y vuelve a sembrar). **Cuidado
con `db:reset` en producción**: usa `--force-reset`, borra todos los datos.

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
