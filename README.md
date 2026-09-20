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
  el propio plan de Hostinger. Vive en la misma máquina que la aplicación y se conecta por
  `localhost:3306`, así que la conexión no sale a internet y no hay *connection pooler* de por
  medio. Una sola variable, `DATABASE_URL`; ver `.env.example`.

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
  con `bcrypt`. Sin proveedores externos — suficiente para una herramienta interna. La cookie dura
  30 días, pero **el usuario se relee de la base en cada petición**: dar de baja a alguien, o
  cambiarle el rol, surte efecto al momento y no cuando le caduque la sesión.
- **Permisos** (`lib/permisos.ts`): cada acción del servidor exige un permiso, y los permisos
  cuelgan del rol. Es la única tabla que decide quién puede qué; cambiarla es cambiar ese fichero.

  | Rol | Puede |
  |---|---|
  | `ADMIN` | Todo |
  | `RENTAL_MANAGER` | Reservas, viviendas, propietarios, limpiezas, sync de Lodgify |
  | `PARTNER` | Facturación y operativa de limpiezas |
  | `STAFF` | Solo marcar el estado de su trabajo |

  > ⚠️ Este reparto es **una propuesta**, deducida de lo que significa cada rol, no una regla de
  > negocio confirmada. Conviene validarlo con quien vaya a usar la aplicación.

  El permiso decide tres cosas, no una: qué **acciones** se pueden ejecutar, qué **pantallas** se
  pueden abrir (escribir la dirección a mano lleva de vuelta a donde sí se puede estar) y qué
  **secciones del menú** se ven. Y dónde aterriza cada quien al entrar: administración y la gestora
  del alquiler en el panel del día, las socias en facturación.

## Producción

La aplicación está publicada en **https://airesmajoreros.pro**.

| Pieza | Dónde | Detalle |
|---|---|---|
| App | Hostinger, hosting Node.js (plan Business) | Next.js, Node 22, `npm run build` → `next start` |
| Base de datos | Hostinger, MySQL incluido en el plan | `u143635831_aires2`, usuario `u143635831_airesapp`, 3 GB. Se conecta por `localhost:3306` |
| Dominio | Hostinger | `airesmajoreros.pro`, DNS gestionado en Hostinger |
| Correo | Hostinger (Starter Business Email) | `info@airesmajoreros.pro`, con SPF, DKIM y DMARC |

### Despliegue

Hostinger está conectado al repositorio de GitHub: **cada push a
`claude/rental-cleaning-management-app-hrv9wg` lanza una compilación y un redespliegue
automáticos**, en cuestión de segundos. El progreso y los logs se ven en hPanel → el sitio →
Node.js → Compilaciones, y la conexión en hPanel → el sitio → Avanzado → Git.

> La regla guardada por la API no basta: hasta que la conexión no se guarda una vez **desde la
> pantalla de hPanel**, el webhook no queda instalado en el repositorio y los push no construyen
> nada. Si algún día dejan de dispararse, ahí es donde hay que mirar.

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

> ### ⚠️ El host de `DATABASE_URL` tiene que ser `localhost`
>
> El usuario de MySQL solo tiene permiso desde `localhost`. Conectar al nombre público del
> servidor (`srv2067.hstgr.io`) **desde la propia máquina** también se rechaza, porque MySQL
> concede permisos por pareja usuario+origen y ese origen no está concedido.
>
> El error que da es `P1000: Authentication failed ... credentials are not valid`, que apunta a la
> contraseña y no al host. Esto costó varias horas: se cambió la contraseña dos veces y se creó
> una base nueva antes de caer en que el problema era el host. **Si vuelve a aparecer ese error,
> mirar primero el host.**
>
> La consecuencia es que el build **no puede** tocar la base: corre en un contenedor aparte, donde
> `localhost` es otra máquina. Tampoco llega nada de fuera, porque no hay ninguna IP remota dada
> de alta (hPanel → Bases de datos → Acceso remoto).

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

### `/api/health/db`

Ruta pública a propósito: sirve para diagnosticar un despliegue en el que todavía no puede entrar
nadie. Si el login no va, dice si el problema es la base de datos o es otra cosa; exigir sesión la
haría inútil justo cuando hace falta.

Pública no quiere decir habladora. **Sin sesión** responde `{ok, ms}` y, si falla, una causa
aproximada («la base de datos rechaza las credenciales», «no se alcanza el servidor»). **Con
sesión** añade el usuario y el host de la base, cuántas personas hay dadas de alta y el error
completo de Prisma. Antes publicaba todo eso a cualquiera que abriera la dirección.

### Comprobar que el sitio funciona de verdad

Poniendo `SELFTEST=1` (y `SELFTEST_BASE=https://airesmajoreros.pro`) en las variables de entorno,
la aplicación se prueba a sí misma unos segundos después de arrancar y deja el resultado en los
logs de Node.js:

```
🧪 AUTOPRUEBA · salud=200 ok=true usuarios=5 login=200 login_incorrecto=401
   /rental=200 /rental/calendar=200 … sin_sesion=307
🧪 AUTOPRUEBA: TODO CORRECTO
```

Comprueba el estado de la base, que la cuenta de administración entra, que una contraseña
equivocada **no** entra, que las ocho páginas cargan con sesión y que sin sesión se redirige al
login. No modifica nada.

Existe porque desde fuera no siempre se alcanza el dominio (proxys, redes cerradas), y entonces no
hay manera de saber si el login funciona salvo pedírselo a alguien. Ojo: bajo Passenger la
aplicación **no** escucha en `127.0.0.1:3000`, así que `SELFTEST_BASE` tiene que ser la URL
pública. Se deja apagada en el día a día y se enciende para verificar un despliegue.

**Cambios de esquema sobre una base que ya existe** van en `lib/migraciones.ts`: una lista de
cambios que dicen cómo saber si hacen falta antes de tocar nada, así que se aplican solos al
arrancar y ejecutarlos mil veces da igual. Ninguno destruye datos — ensanchar una columna es
seguro, estrecharla no lo sería. Aquí no hay `prisma migrate` porque el build no alcanza la base.

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

## Usuarios y accesos

Cada persona entra con su propio correo, y el rol decide qué ve y qué puede hacer.

- **Dar de alta** (Ajustes → Usuarios y accesos, solo administración): se pide nombre, correo y
  rol. La aplicación **genera la contraseña** y la enseña **una sola vez**, para entregarla. No se
  guarda en claro en ningún sitio, solo su hash: si se pierde, se restablece — no se recupera.
- **Cada quien cambia la suya** en «Mi cuenta» (el nombre, arriba a la derecha). Pide la actual,
  para que una sesión abierta en un ordenador ajeno no sirva para cambiarla.
- **Restablecer, cambiar de rol y desactivar** desde la misma pantalla. No se puede desactivar la
  propia cuenta, ni la última administración activa: dejaría la aplicación sin quien la gestione.

Las contraseñas generadas evitan los caracteres que se confunden al dictarlas (`l/1/I`, `O/0`) y
no llevan símbolos, que dan guerra al pegarlos desde el móvil.

## Pruebas

```bash
npm test
```

27 pruebas, sin base de datos ni servidor: todo lo que comprueban es lógica pura, y por eso se
sacó de donde estaba enterrada (`lib/numeracion.ts`, `lib/calendario.ts`).

**No están escritas por completismo.** Cada bloque fija un fallo que llegó a estar en producción:
el reparto entre socias que ignoraba el porcentaje de la segunda, la numeración de facturas que
salía de contar en vez del último emitido, el mantenimiento futuro que bloqueaba una vivienda
desde hoy, el día de salida que no se veía en el calendario, los permisos que no existían, y la
factura emitida que podía volver a borrador.

Comprobado que saben fallar: reintroduciendo a propósito dos de esos fallos, la suite pasa de
27/27 a 25/27 señalando exactamente los dos. Una prueba que no puede fallar no comprueba nada.

Aparte está la **autoprueba** (`SELFTEST=1`), que se ejecuta sobre el sitio desplegado y cubre lo
que estas no pueden: que la base responde, que el login entra, que las cuentas de demostración no,
y que las pantallas cargan.

## Facturación: lo que la aplicación hace cumplir

- **Numeración correlativa.** El número sale del más alto emitido, no de cuántas facturas hay, así
  que no se reutiliza un número aunque se anule una factura y quede un hueco.
- **Una factura emitida no vuelve a borrador** (`INVOICE_STATUS_TRANSITIONS` en `lib/constants.ts`).
  Lo que esté mal en una factura emitida se corrige con una **rectificativa**, no deshaciendo la
  original. La regla se aplica en el servidor, no solo escondiendo la opción: forzar el cambio
  desde el navegador se rechaza con el motivo.
- **Las líneas son una copia inmutable.** `InvoiceLine` guarda descripción, vivienda, fecha e
  importe en el momento de facturar, así que la factura no cambia si después se edita la vivienda
  o su precio.
- **No se puede borrar una limpieza ya facturada.**

> ⚠️ **Esto no convierte la aplicación en un sistema de facturación verificable (VeriFactu).**
> Falta lo esencial de ese reglamento: encadenamiento con huella (*hash*) de cada registro con el
> anterior, registro de eventos, código QR en la factura y, según la modalidad, remisión de los
> registros a la AEAT. Son piezas de calado, no un retoque.
>
> Si la facturación de Aires Majoreros tiene que cumplirlo, hay que abordarlo como un trabajo
> aparte — y conviene que lo confirme la asesoría: qué modalidad aplica y desde cuándo.

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

> ⚠️ **Desactivados salvo que se pidan.** Llevan una contraseña conocida y publicada, así que en
> una instalación real son una puerta abierta: cualquiera que llegue a la web entra como
> administración. La aplicación **los desactiva al arrancar** si detecta cuentas `@example.com`, y
> el seed no los crea. Para una demostración: `USUARIOS_DEMO=1`.
>
> Estuvieron activos en producción y se cerraron el 19/09/2026. Si el histórico de esa instalación
> importa, conviene dar por comprometido lo que hubiera antes de esa fecha.

Con `USUARIOS_DEMO=1`, contraseña para todos `demo1234`:

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
