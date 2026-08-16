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
- **Base de datos**: [Prisma ORM](https://www.prisma.io) sobre **SQLite** en desarrollo/demo
  (`prisma/dev.db`, fichero único, cero configuración). El *schema* (`prisma/schema.prisma`) está
  escrito para migrar a **PostgreSQL** cambiando solo el `datasource` y `DATABASE_URL` — no hay
  SQL específico de SQLite en el código de la aplicación.
- **Modelo de datos multi-negocio**: todo cuelga de una `Organization` → varios `Business`
  (`RENTAL_MANAGEMENT` / `CLEANING_BILLING`). Nombres, comisiones, precios de limpieza y reparto
  entre socias son datos configurables, no están escritos en el código, para poder reconfigurar
  la plataforma a otro cliente del sector.
- **Registro compartido "limpieza"**: `CleaningTask` es una única tabla que sirve a la vez como
  tarea operativa (calendario/asignación en el negocio de alquiler) y como línea facturable (en
  cuanto está `DONE`, aparece en el panel de facturación; al facturarse se le asigna un
  `invoiceId` y desaparece de "pendientes"). No hay duplicación de datos entre los dos negocios.
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

## Puesta en marcha

```bash
npm install
cp .env.example .env        # ya viene copiado; genera tu propio AUTH_SECRET en producción
npm run db:push             # crea las tablas en SQLite
npm run db:seed             # carga los datos de ejemplo (Fuerteventura)
npm run dev                 # http://localhost:3000
```

`npm run db:reset` hace ambas cosas de golpe (reinicia el esquema y vuelve a sembrar).

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
