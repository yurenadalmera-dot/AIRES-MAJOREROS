-- =============================================================================
-- mirador-operativa · 001_schema.sql
-- Gestión de alquiler vacacional (Mirador de Sotavento · Emma)
--
-- Orden de aplicación: 001_schema.sql → 002_policies.sql → 003_datos_referencia.sql
--
-- Requiere un Postgres de Supabase (usa el esquema `auth` de GoTrue para
-- identificar al usuario). Ver db/README.md.
--
-- Decisiones que este esquema hace cumplir, tomadas del briefing de Fase 0:
--   · Las fórmulas de liquidación son DATOS, no código: viven en
--     `reglas_liquidacion` con vigencia por periodo. Añadir un cuarto trato a
--     un propietario no debe tocar ni una línea de SQL.
--   · El puente con Aires Majoreros es de un solo sentido. Las limpiezas
--     llegan replicadas con su id de origen y una restricción de unicidad que
--     hace la réplica idempotente. Mirador nunca escribe en Aires.
--   · Ningún importe se guarda calculado si puede derivarse; los que sí se
--     guardan (líneas de liquidación) son instantáneas deliberadas, para que
--     una liquidación ya emitida no cambie si mañana cambia una regla.
-- =============================================================================

create extension if not exists pgcrypto;

create schema if not exists app;
comment on schema app is
  'Funciones y tipos auxiliares. Fuera de `public` para que PostgREST no los exponga.';

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------

create type app.rol_usuario as enum (
  'gestor',          -- Emma y quien lleve la operativa: ve y edita todo
  'propietario',     -- ve solo lo de sus viviendas, y solo lectura
  'automatizacion'   -- n8n; entra con service_role, no depende de estas policies
);

create type app.estado_reserva as enum ('confirmada', 'cancelada', 'bloqueo');

create type app.tipo_movimiento as enum ('ingreso', 'gasto');

create type app.tipo_regla_liquidacion as enum (
  'porcentaje_ventas',     -- p.ej. Villa Monikka: 10 % sobre ventas
  'porcentaje_beneficio',  -- p.ej. Grupo Chano: 30 % sobre (ventas − gastos)
  'fijo_escalonado'        -- p.ej. Academia: 400 → 500 → 600 € según tramo
);

create type app.estado_liquidacion as enum ('borrador', 'emitida', 'pagada');

create type app.estado_limpieza as enum ('pendiente', 'en_curso', 'completada', 'cancelada');

-- -----------------------------------------------------------------------------
-- Propietarios, agrupaciones y viviendas
-- -----------------------------------------------------------------------------

create table public.propietarios (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  nif           text,
  email         text,
  telefono      text,
  notas         text,
  -- Trazabilidad del origen mientras Airtable siga vivo. Único para que una
  -- reimportación actualice en lugar de duplicar.
  airtable_id   text unique,
  activo        boolean not null default true,
  creado_en     timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

comment on table public.propietarios is
  'Dueños de las viviendas. Un propietario puede tener viviendas en varios grupos de liquidación.';

-- Las tres fórmulas del briefing no son "por propietario" sino "por grupo":
-- varias viviendas de distintos propietarios pueden compartir trato.
create table public.grupos_liquidacion (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null unique,
  descripcion   text,
  activo        boolean not null default true,
  creado_en     timestamptz not null default now()
);

comment on table public.grupos_liquidacion is
  'Agrupación a la que se aplica una fórmula de liquidación (Villa Monikka, Grupo Chano, Academia...).';

create table public.viviendas (
  id                  uuid primary key default gen_random_uuid(),
  nombre              text not null,
  propietario_id      uuid not null references public.propietarios(id) on delete restrict,
  grupo_liquidacion_id uuid references public.grupos_liquidacion(id) on delete set null,
  localidad           text,
  direccion           text,
  plazas              integer check (plazas is null or plazas > 0),
  dormitorios         integer check (dormitorios is null or dormitorios >= 0),
  banos               integer check (banos is null or banos >= 0),
  -- Emparejamiento con los sistemas externos que alimentan esta base.
  lodgify_property_id text unique,
  airtable_id         text unique,
  -- Id de la misma vivienda en aires-operativa. Lo rellena el puente; sirve
  -- para casar las limpiezas replicadas sin depender del nombre.
  aires_vivienda_id   uuid unique,
  publicada           boolean not null default true,
  activo              boolean not null default true,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);

comment on column public.viviendas.aires_vivienda_id is
  'Identidad de esta misma vivienda en aires-operativa. Casar por id, nunca por nombre.';
comment on column public.viviendas.publicada is
  'Si aparece en la web pública. A 09/2026 hay 17 viviendas gestionadas y 11 publicadas: la web va por detrás.';

create index on public.viviendas (propietario_id);
create index on public.viviendas (grupo_liquidacion_id);

-- -----------------------------------------------------------------------------
-- Reservas
-- -----------------------------------------------------------------------------

create table public.reservas (
  id                 uuid primary key default gen_random_uuid(),
  vivienda_id        uuid not null references public.viviendas(id) on delete restrict,
  huesped_nombre     text,
  huesped_email      text,
  huesped_telefono   text,
  -- Número de huéspedes: lo necesita el motor de tarifas de limpieza de Aires,
  -- así que no es un dato decorativo.
  huespedes          integer not null default 1 check (huespedes > 0),
  entrada            date not null,
  salida             date not null,
  canal              text,
  estado             app.estado_reserva not null default 'confirmada',
  importe_total      numeric(12,2) not null default 0 check (importe_total >= 0),
  comision_canal     numeric(12,2) not null default 0 check (comision_canal >= 0),
  importe_neto       numeric(12,2) not null default 0 check (importe_neto >= 0),
  lodgify_booking_id text unique,
  airtable_id        text unique,
  -- Protege de que el sondeo de Lodgify pise una corrección hecha a mano.
  ajustada_a_mano    boolean not null default false,
  notas              text,
  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now(),
  constraint reserva_fechas_coherentes check (salida > entrada)
);

create index on public.reservas (vivienda_id);
create index on public.reservas (entrada);
create index on public.reservas (salida);
create index on public.reservas (estado);

-- -----------------------------------------------------------------------------
-- Movimientos (lo que entra y sale por vivienda)
-- -----------------------------------------------------------------------------

create table public.movimientos (
  id            uuid primary key default gen_random_uuid(),
  vivienda_id   uuid not null references public.viviendas(id) on delete restrict,
  reserva_id    uuid references public.reservas(id) on delete set null,
  tipo          app.tipo_movimiento not null,
  fecha         date not null,
  concepto      text not null,
  importe       numeric(12,2) not null check (importe >= 0),
  -- Un gasto puede no ser repercutible al propietario (p.ej. un detalle de
  -- bienvenida que asume la gestora). Solo los liquidables entran en la fórmula.
  liquidable    boolean not null default true,
  categoria     text,
  airtable_id   text unique,
  -- Se rellena al incluirlo en una liquidación; evita liquidar dos veces.
  liquidacion_id uuid,
  notas         text,
  creado_en     timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

comment on column public.movimientos.importe is
  'Siempre positivo. El signo lo da `tipo`, no el número: así una consulta mal escrita no resta de más.';

create index on public.movimientos (vivienda_id);
create index on public.movimientos (fecha);
create index on public.movimientos (liquidacion_id);

-- -----------------------------------------------------------------------------
-- Reglas de liquidación
--
-- El corazón del briefing: tres fórmulas distintas conviviendo, y la
-- posibilidad de cambiarlas sin desplegar código ni falsear el histórico.
-- Por eso llevan vigencia y por eso las liquidaciones guardan una instantánea.
-- -----------------------------------------------------------------------------

create table public.reglas_liquidacion (
  id                 uuid primary key default gen_random_uuid(),
  grupo_liquidacion_id uuid not null references public.grupos_liquidacion(id) on delete cascade,
  tipo               app.tipo_regla_liquidacion not null,

  -- Para 'porcentaje_ventas' y 'porcentaje_beneficio'.
  porcentaje         numeric(5,2) check (porcentaje is null or (porcentaje >= 0 and porcentaje <= 100)),

  -- Para 'fijo_escalonado': el criterio del escalón (ver tramos) y nada más.
  -- PENDIENTE (Emma): confirmar sobre qué magnitud escala la Academia
  -- (400 → 500 → 600 €). Hasta saberlo, `base_escalon` queda descrito en texto
  -- y los tramos se cargan con el criterio que se confirme.
  base_escalon       text,

  vigente_desde      date not null,
  vigente_hasta      date,
  notas              text,
  creado_en          timestamptz not null default now(),

  constraint regla_vigencia_coherente
    check (vigente_hasta is null or vigente_hasta >= vigente_desde),

  -- Cada tipo exige sus propios datos: que la base de datos lo imponga evita
  -- reglas a medio rellenar que revientan al liquidar.
  constraint regla_parametros_segun_tipo check (
    (tipo in ('porcentaje_ventas', 'porcentaje_beneficio') and porcentaje is not null)
    or (tipo = 'fijo_escalonado' and porcentaje is null)
  )
);

comment on table public.reglas_liquidacion is
  'Una fila por trato y periodo. Nunca se edita una regla pasada: se cierra su vigencia y se abre otra.';

create index on public.reglas_liquidacion (grupo_liquidacion_id, vigente_desde desc);

-- Dos reglas del mismo grupo no pueden solaparse en el tiempo: si se solapan,
-- «la regla vigente en la fecha X» deja de tener respuesta única.
create extension if not exists btree_gist;

alter table public.reglas_liquidacion
  add constraint regla_sin_solape_por_grupo
  exclude using gist (
    grupo_liquidacion_id with =,
    daterange(vigente_desde, vigente_hasta, '[]') with &&
  );

create table public.reglas_liquidacion_tramos (
  id            uuid primary key default gen_random_uuid(),
  regla_id      uuid not null references public.reglas_liquidacion(id) on delete cascade,
  desde_valor   numeric(12,2) not null,
  hasta_valor   numeric(12,2),
  importe       numeric(12,2) not null check (importe >= 0),
  orden         integer not null default 0,
  constraint tramo_rango_coherente
    check (hasta_valor is null or hasta_valor > desde_valor)
);

comment on table public.reglas_liquidacion_tramos is
  'Escalones de una regla fija_escalonada. `desde_valor`/`hasta_valor` se miden sobre la magnitud que indique reglas_liquidacion.base_escalon.';

create index on public.reglas_liquidacion_tramos (regla_id, orden);

-- -----------------------------------------------------------------------------
-- Liquidaciones
-- -----------------------------------------------------------------------------

create table public.liquidaciones (
  id                uuid primary key default gen_random_uuid(),
  propietario_id    uuid not null references public.propietarios(id) on delete restrict,
  periodo_inicio    date not null,
  periodo_fin       date not null,
  estado            app.estado_liquidacion not null default 'borrador',

  -- Instantánea de la regla aplicada. Guardarla aquí es lo que permite
  -- reconstruir dentro de dos años por qué salió este número, aunque la regla
  -- haya cambiado tres veces desde entonces.
  regla_id          uuid references public.reglas_liquidacion(id) on delete set null,
  regla_tipo        app.tipo_regla_liquidacion,
  regla_porcentaje  numeric(5,2),
  regla_descripcion text,

  total_ventas      numeric(12,2) not null default 0,
  total_gastos      numeric(12,2) not null default 0,
  base_calculo      numeric(12,2) not null default 0,
  importe_gestion   numeric(12,2) not null default 0,
  importe_propietario numeric(12,2) not null default 0,

  -- Emma es autónoma: retención de IRPF, sin IGIC. El porcentaje se guarda
  -- por si cambia la normativa; ver docs/fase-0.md.
  retencion_irpf_pct numeric(5,2) not null default 0,
  retencion_irpf     numeric(12,2) not null default 0,

  emitida_en        timestamptz,
  pagada_en         timestamptz,
  notas             text,
  airtable_id       text unique,
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now(),

  constraint liquidacion_periodo_coherente check (periodo_fin >= periodo_inicio),
  -- Una liquidación emitida necesita fecha de emisión: si no, el histórico miente.
  constraint liquidacion_emitida_con_fecha
    check (estado = 'borrador' or emitida_en is not null)
);

create index on public.liquidaciones (propietario_id, periodo_inicio desc);
create index on public.liquidaciones (estado);

-- Un propietario no puede tener dos liquidaciones del mismo periodo.
create unique index liquidacion_unica_por_periodo
  on public.liquidaciones (propietario_id, periodo_inicio, periodo_fin);

alter table public.movimientos
  add constraint movimientos_liquidacion_fk
  foreign key (liquidacion_id) references public.liquidaciones(id) on delete set null;

create table public.liquidacion_lineas (
  id              uuid primary key default gen_random_uuid(),
  liquidacion_id  uuid not null references public.liquidaciones(id) on delete cascade,
  vivienda_id     uuid references public.viviendas(id) on delete set null,
  -- Copia del nombre en el momento de liquidar: si la vivienda se renombra,
  -- la liquidación ya emitida sigue diciendo lo que decía.
  vivienda_nombre text not null,
  concepto        text not null,
  fecha           date,
  tipo            app.tipo_movimiento not null,
  importe         numeric(12,2) not null,
  movimiento_id   uuid references public.movimientos(id) on delete set null,
  reserva_id      uuid references public.reservas(id) on delete set null
);

create index on public.liquidacion_lineas (liquidacion_id);

-- -----------------------------------------------------------------------------
-- Limpiezas replicadas desde aires-operativa
--
-- Puente de un solo sentido. La verdad nace en Aires; aquí solo se guarda el
-- hecho consumado, para que Emma vea el estado sin poder alterarlo.
-- -----------------------------------------------------------------------------

create table public.limpiezas_replicadas (
  id                 uuid primary key default gen_random_uuid(),
  -- Id de la limpieza en aires-operativa. La unicidad es lo que hace que el
  -- workflow de n8n pueda reintentar sin duplicar: requisito del briefing.
  origen_id          uuid not null unique,
  vivienda_id        uuid references public.viviendas(id) on delete set null,
  reserva_id         uuid references public.reservas(id) on delete set null,
  fecha              date not null,
  estado             app.estado_limpieza not null,
  tipo_servicio      text,
  huespedes          integer,
  completada_en      timestamptz,
  -- Importe facturado por Aires. Informativo: Aires factura al propietario,
  -- no a Emma, así que este número no entra en la liquidación salvo que una
  -- regla lo diga explícitamente.
  importe            numeric(12,2),
  replicada_en       timestamptz not null default now(),
  notas              text
);

comment on table public.limpiezas_replicadas is
  'Réplica de solo lectura desde aires-operativa. Mirador NUNCA escribe hacia Aires. `origen_id` único = idempotencia del workflow.';

create index on public.limpiezas_replicadas (vivienda_id);
create index on public.limpiezas_replicadas (fecha);

-- -----------------------------------------------------------------------------
-- Usuarios y perfiles
-- -----------------------------------------------------------------------------

create table public.perfiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  rol             app.rol_usuario not null,
  -- Solo para el rol 'propietario': a qué propietario corresponde. Es la
  -- columna sobre la que gira todo el filtrado por propietario de 002.
  propietario_id  uuid references public.propietarios(id) on delete cascade,
  nombre          text not null,
  activo          boolean not null default true,
  creado_en       timestamptz not null default now(),

  constraint perfil_propietario_coherente check (
    (rol = 'propietario' and propietario_id is not null)
    or (rol <> 'propietario' and propietario_id is null)
  )
);

comment on table public.perfiles is
  'Puente entre auth.users y el dominio. Sin fila aquí, un usuario autenticado no ve absolutamente nada.';

create index on public.perfiles (propietario_id);

-- -----------------------------------------------------------------------------
-- Funciones de apoyo a las policies
--
-- Encapsular `auth.uid()` aquí tiene dos ventajas: las policies se leen mejor
-- y, si algún día cambia el mecanismo de identidad, se toca un solo sitio.
-- SECURITY DEFINER porque deben poder leer `perfiles` sin que la propia RLS de
-- `perfiles` las bloquee (recursión).
-- -----------------------------------------------------------------------------

create or replace function app.rol_actual()
returns app.rol_usuario
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.rol
  from public.perfiles p
  where p.id = auth.uid() and p.activo
$$;

create or replace function app.es_gestor()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(app.rol_actual() = 'gestor', false)
$$;

create or replace function app.propietario_actual()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.propietario_id
  from public.perfiles p
  where p.id = auth.uid() and p.activo and p.rol = 'propietario'
$$;

-- -----------------------------------------------------------------------------
-- actualizado_en automático
-- -----------------------------------------------------------------------------

create or replace function app.tocar_actualizado_en()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'propietarios', 'viviendas', 'reservas', 'movimientos', 'liquidaciones'
  ]
  loop
    execute format(
      'create trigger %I_tocar_actualizado_en
         before update on public.%I
         for each row execute function app.tocar_actualizado_en()',
      t, t
    );
  end loop;
end;
$$;
