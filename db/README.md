# Base de datos · Fase 0

Esquemas de los dos proyectos de Supabase **autoalojado** del VPS
(72.61.177.131), según el briefing de Fase 0 del 12/09/2026.

Son dos bases separadas, una por empresa. No comparten servidor lógico ni
tablas: lo único que las une es un puente de n8n de un solo sentido.

| Proyecto | Empresa | Panel | Contenido |
|---|---|---|---|
| `mirador-operativa` | Mirador de Sotavento (Emma) | `mirador.airesmajoreros.pro` | Propietarios, viviendas, reservas, movimientos, liquidaciones |
| `aires-operativa` | Aires Majoreros S.L. (Alejandra) | `app.airesmajoreros.pro` | Clientes, viviendas, tarifas, limpiezas, facturación |

## Orden de aplicación

Los ficheros se aplican en orden numérico. Los `9xx` son pruebas: no dejan
datos, se pueden lanzar tantas veces como haga falta.

```bash
# mirador-operativa
psql -d mirador -v ON_ERROR_STOP=1 -f db/mirador/001_schema.sql
psql -d mirador -v ON_ERROR_STOP=1 -f db/mirador/002_policies.sql
psql -d mirador -v ON_ERROR_STOP=1 -f db/mirador/003_datos_referencia.sql
psql -d mirador -v ON_ERROR_STOP=1 -f db/comun/010_app_ui.sql
psql -d mirador -v ON_ERROR_STOP=1 -f db/mirador/999_test_rls.sql

# aires-operativa
psql -d aires -v ON_ERROR_STOP=1 -f db/aires/001_schema.sql
psql -d aires -v ON_ERROR_STOP=1 -f db/aires/002_policies.sql
psql -d aires -v ON_ERROR_STOP=1 -f db/aires/003_datos_referencia.sql
psql -d aires -v ON_ERROR_STOP=1 -f db/comun/010_app_ui.sql
psql -d aires -v ON_ERROR_STOP=1 -f db/aires/998_test_tarifas.sql
psql -d aires -v ON_ERROR_STOP=1 -f db/aires/999_test_rls.sql
```

`ON_ERROR_STOP=1` no es opcional: sin él, psql sigue adelante tras un error y
deja la base a medio migrar sin avisar.

### Qué hace cada fichero

| Fichero | Qué hace |
|---|---|
| `001_schema.sql` | Tablas, tipos, índices, restricciones y funciones de dominio |
| `002_policies.sql` | Permisos y RLS. Ninguna policy usa `using(true)` |
| `003_datos_referencia.sql` | Tarifas y reglas de liquidación confirmadas. Idempotente |
| `comun/010_app_ui.sql` | `app_ui` + histórico + deshacer en caliente. Igual en ambos proyectos |
| `998_test_tarifas.sql` | Comprueba el motor de tarifas caso por caso |
| `999_test_rls.sql` | Comprueba el aislamiento entre usuarios |

## Requisitos

Un Postgres de Supabase, porque los esquemas dan por hecho:

- el esquema `auth` con `auth.users` y la función `auth.uid()`;
- los roles `anon`, `authenticated` y `service_role`.

Extensiones que se crean solas si faltan: `pgcrypto` (para `gen_random_uuid()`)
y `btree_gist` (para las restricciones de no solape en vigencias).

## Cómo está pensado el acceso

Tres roles de aplicación, en una tabla `perfiles` que cuelga de `auth.users`:

**mirador-operativa**
- `gestor` — Emma y quien lleve la operativa: todo.
- `propietario` — solo lo que cuelga de **sus** viviendas, y solo lectura. No
  ve borradores de liquidación: un número a medio cuadrar no debe llegarle
  antes de que Emma lo dé por bueno.
- `automatizacion` — n8n, entra con `service_role`.

**aires-operativa**
- `gestor` — Alejandra y administración: todo.
- `empleada` — sus limpiezas y las viviendas donde trabaja. Puede avanzar el
  estado; no puede tocar importes, facturabilidad ni asignaciones (lo impide
  un trigger, porque RLS filtra filas y aquí hacía falta filtrar columnas). No
  ve clientes, tarifas ni facturas.
- `automatizacion` — n8n, entra con `service_role`.

Un usuario autenticado **sin fila en `perfiles` no ve absolutamente nada**. Es
el caso que más se escapa en estos montajes y está cubierto por los tests.

### Verificar que no queda nada abierto

Ambas consultas deben devolver cero filas, en las dos bases:

```sql
-- Tablas sin RLS
select tablename from pg_tables
where schemaname = 'public' and rowsecurity = false;

-- Policies permisivas
select policyname, tablename from pg_policies
where schemaname = 'public' and (qual = 'true' or with_check = 'true');
```

## Dos cosas que solo escribe n8n

Hay dos tablas sin ninguna policy de escritura, y es a propósito:

- `mirador.limpiezas_replicadas` — la verdad de ese dato nace en Aires. Si Emma
  pudiera editarla, las dos bases empezarían a discrepar y nadie sabría cuál
  creer.
- `app_ui` (salvo revertir) — el HTML sale de un despliegue desde el repo.
  Editarlo a mano crea una versión que el repositorio desconoce.

Las escribe el workflow con `service_role`, que salta RLS por diseño de
Supabase. **La ausencia de policies ahí no es un olvido.**

## El puente con Aires

Un solo sentido: `aires-operativa` → `mirador-operativa`, cuando una limpieza
pasa a `completada`.

La idempotencia la da `limpiezas_replicadas.origen_id`, que es `unique`: el
workflow puede reintentar sin duplicar. Que el `upsert` de n8n use esa columna
como clave de conflicto, no el `id`.

Mirador **nunca** escribe hacia Aires.

## Estado de los datos de referencia

`003` carga lo confirmado y **deja sin cargar lo que no lo está**, avisando por
pantalla. Una tarifa inventada se convierte en una factura mal hecha, así que
prefiere quedarse corto:

- **Regla de Academia**: creada sin tramos. No puede liquidar hasta saber sobre
  qué magnitud escalan los 400 → 500 → 600 €.
- **Lista de Inversiones Brito**: solo se crea si el cliente ya existe. Base 50 €
  y repaso 30 € están confirmados; huéspedes incluidos y extra, no.
- **Precios cerrados** (Villa Mónica, Caliche, Gregorio): solo se cargan para
  viviendas que ya existan.

Los tres ficheros son idempotentes: tras migrar los datos de Airtable, se
vuelven a ejecutar y completan lo que faltaba.

Las preguntas abiertas están en [`docs/fase-0.md`](../docs/fase-0.md).
