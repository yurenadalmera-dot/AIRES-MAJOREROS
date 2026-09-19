-- =============================================================================
-- aires-operativa · 001_schema.sql
-- Limpiezas y facturación (Aires Majoreros S.L. · Alejandra)
--
-- Orden de aplicación: 001_schema.sql → 002_policies.sql → 003_datos_referencia.sql
--
-- Las tres decisiones que marcan este esquema, todas del briefing de Fase 0:
--
--   1. **El precio de una limpieza no es un campo de la vivienda.** Sale de la
--      lista de precios del cliente cruzada con el nº de huéspedes de la
--      reserva, salvo que esa vivienda tenga precio cerrado. Por eso hay un
--      motor (`app.calcular_precio_limpieza`) y no una columna `precio`.
--
--   2. **Todo lleva vigencia por fechas.** Sin eso no se puede refacturar un
--      mes pasado sin equivocarse: una tarifa que subió en junio no debe
--      aplicarse a una limpieza de marzo.
--
--   3. **Aires factura al propietario, no a Emma.** El cliente de facturación
--      es Inversiones Brito o quien sea dueño, y Emma factura sus comisiones
--      de gestión aparte, en mirador-operativa. El prototipo
--      `dashboard-gestion.html` asumía lo contrario y está mal.
--
-- Los importes se guardan SIEMPRE sin IGIC. El impuesto se añade al facturar.
-- =============================================================================

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create schema if not exists app;
comment on schema app is
  'Funciones y tipos auxiliares. Fuera de `public` para que PostgREST no los exponga.';

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------

create type app.rol_usuario as enum (
  'gestor',          -- Alejandra y administración: todo
  'empleada',        -- ve su parte del trabajo, marca limpiezas
  'automatizacion'   -- n8n; entra con service_role
);

create type app.tipo_servicio as enum ('salida', 'repaso');

create type app.estado_limpieza as enum ('pendiente', 'en_curso', 'completada', 'cancelada');

create type app.estado_factura as enum ('borrador', 'emitida', 'cobrada', 'anulada');

-- -----------------------------------------------------------------------------
-- Clientes de facturación y viviendas
-- -----------------------------------------------------------------------------

create table public.clientes_facturacion (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null,
  razon_social    text,
  nif             text,
  email           text,
  telefono        text,
  direccion       text,
  airtable_id     text unique,
  activo          boolean not null default true,
  notas           text,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

comment on table public.clientes_facturacion is
  'A quién se le factura la limpieza: el propietario de la vivienda (hoy Inversiones Brito), nunca la gestora del alquiler.';

create table public.viviendas (
  id                    uuid primary key default gen_random_uuid(),
  nombre                text not null,
  cliente_facturacion_id uuid not null references public.clientes_facturacion(id) on delete restrict,
  localidad             text,
  direccion             text,
  plazas                integer check (plazas is null or plazas > 0),

  -- Hay viviendas que se limpian pero cuya limpieza no se factura a nadie
  -- conocido. Villa Caliche y Villa Gregorio están así a 09/2026: 100 €
  -- acordados y ninguna partida en los movimientos de Brito ni de Academia.
  -- Marcarlas aquí evita que entren en una factura por inercia.
  facturable            boolean not null default true,

  -- Identidad de la misma vivienda en mirador-operativa, para que el puente
  -- case por id y no por nombre.
  mirador_vivienda_id   uuid unique,
  airtable_id           text unique,
  activo                boolean not null default true,
  notas                 text,
  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz not null default now()
);

comment on column public.viviendas.facturable is
  'false = se limpia pero no se factura. PENDIENTE (Emma): quién paga Villa Caliche y Villa Gregorio.';

create index on public.viviendas (cliente_facturacion_id);

-- -----------------------------------------------------------------------------
-- Motor de tarifas
--
-- Dos niveles, y el orden importa:
--   1. precio cerrado de la vivienda  → manda sobre todo lo demás
--   2. lista de precios del cliente   → base + extra por huésped
-- Si no hay ninguno de los dos vigente para esa fecha, el cálculo falla a
-- propósito. Facturar 0 € en silencio es peor que no facturar.
-- -----------------------------------------------------------------------------

create table public.listas_precio (
  id                     uuid primary key default gen_random_uuid(),
  nombre                 text not null,
  -- NULL = lista por defecto, la que se aplica a cualquier cliente sin lista
  -- propia (la "oficial 2026" del briefing).
  cliente_facturacion_id uuid references public.clientes_facturacion(id) on delete cascade,
  vigente_desde          date not null,
  vigente_hasta          date,
  notas                  text,
  creado_en              timestamptz not null default now(),

  constraint lista_vigencia_coherente
    check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);

comment on table public.listas_precio is
  'Lista de precios por cliente y periodo. Una fila con cliente NULL es la lista por defecto.';

-- Un cliente no puede tener dos listas solapadas: «la lista vigente el día X»
-- tiene que tener una sola respuesta. Dos restricciones porque NULL no se
-- compara con `=` y hay que tratar la lista por defecto aparte.
alter table public.listas_precio
  add constraint lista_cliente_sin_solape
  exclude using gist (
    cliente_facturacion_id with =,
    daterange(vigente_desde, vigente_hasta, '[]') with &&
  )
  where (cliente_facturacion_id is not null);

create unique index lista_defecto_sin_solape
  on public.listas_precio (vigente_desde)
  where cliente_facturacion_id is null;

create table public.listas_precio_lineas (
  id                    uuid primary key default gen_random_uuid(),
  lista_id              uuid not null references public.listas_precio(id) on delete cascade,
  tipo_servicio         app.tipo_servicio not null,

  importe_base          numeric(10,2) not null check (importe_base >= 0),
  -- Huéspedes cubiertos por el importe base. La tarifa oficial 2026 cubre 2.
  huespedes_incluidos   integer not null default 0 check (huespedes_incluidos >= 0),
  -- Lo que se suma por cada huésped por encima de los incluidos.
  importe_huesped_extra numeric(10,2) not null default 0 check (importe_huesped_extra >= 0),

  notas                 text,

  unique (lista_id, tipo_servicio)
);

comment on table public.listas_precio_lineas is
  'Precio de cada tipo de servicio dentro de una lista. Todos los importes SIN IGIC.';

create table public.precios_cerrados (
  id             uuid primary key default gen_random_uuid(),
  vivienda_id    uuid not null references public.viviendas(id) on delete cascade,
  tipo_servicio  app.tipo_servicio not null,
  importe        numeric(10,2) not null check (importe >= 0),
  vigente_desde  date not null,
  vigente_hasta  date,
  notas          text,
  creado_en      timestamptz not null default now(),

  constraint precio_cerrado_vigencia_coherente
    check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);

comment on table public.precios_cerrados is
  'Precio pactado para una vivienda concreta, al margen de huéspedes (Villa Mónica 120 €, Caliche y Gregorio 100 €). Manda sobre la lista del cliente.';

alter table public.precios_cerrados
  add constraint precio_cerrado_sin_solape
  exclude using gist (
    vivienda_id with =,
    tipo_servicio with =,
    daterange(vigente_desde, vigente_hasta, '[]') with &&
  );

-- -----------------------------------------------------------------------------
-- Empleadas
-- -----------------------------------------------------------------------------

create table public.empleadas (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  telefono       text,
  activo         boolean not null default true,
  airtable_id    text unique,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Limpiezas
--
-- La verdad de una limpieza nace aquí. Cuando pasa a 'completada', el puente
-- de n8n la replica a mirador-operativa. Mirador nunca escribe de vuelta.
-- -----------------------------------------------------------------------------

create table public.limpiezas (
  id              uuid primary key default gen_random_uuid(),
  vivienda_id     uuid not null references public.viviendas(id) on delete restrict,
  empleada_id     uuid references public.empleadas(id) on delete set null,
  fecha           date not null,
  tipo_servicio   app.tipo_servicio not null default 'salida',
  estado          app.estado_limpieza not null default 'pendiente',

  -- Nº de huéspedes de la reserva que genera esta limpieza. Es una entrada del
  -- motor de tarifas, por eso se guarda en la limpieza y no solo en la reserva.
  huespedes       integer check (huespedes is null or huespedes > 0),

  -- Reserva de origen en mirador-operativa, si la limpieza viene de una salida.
  mirador_reserva_id uuid,

  -- Importe SIN IGIC, congelado en el momento de darla por completada. Se
  -- calcula con `app.calcular_precio_limpieza`, pero se guarda: si mañana sube
  -- la tarifa, lo ya trabajado no cambia de precio solo.
  importe         numeric(10,2) check (importe is null or importe >= 0),
  -- De dónde salió ese importe, para poder explicárselo al cliente.
  importe_origen  text,

  facturable      boolean not null default true,
  factura_id      uuid,

  completada_en   timestamptz,
  airtable_id     text unique,
  notas           text,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),

  -- Una limpieza completada tiene que tener precio e instante: son los dos
  -- datos que el puente y la facturación dan por hechos.
  constraint limpieza_completada_con_datos check (
    estado <> 'completada'
    or (completada_en is not null and (importe is not null or not facturable))
  )
);

comment on column public.limpiezas.importe is
  'Importe sin IGIC congelado al completar. Calculado por app.calcular_precio_limpieza, no tecleado a mano.';
comment on column public.limpiezas.importe_origen is
  'Traza del cálculo: "precio cerrado" o "lista <nombre> · base X + N extra".';

create index on public.limpiezas (vivienda_id);
create index on public.limpiezas (fecha);
create index on public.limpiezas (estado);
create index on public.limpiezas (factura_id);

-- -----------------------------------------------------------------------------
-- Facturas
--
-- Aires Majoreros S.L.: repercute IGIC y no sufre retención. Los porcentajes
-- se guardan en cada factura, no se leen de una constante: cuando el IGIC
-- cambie, las facturas viejas tienen que seguir cuadrando.
-- -----------------------------------------------------------------------------

create table public.facturas (
  id              uuid primary key default gen_random_uuid(),
  numero          text not null unique,
  cliente_facturacion_id uuid not null references public.clientes_facturacion(id) on delete restrict,

  -- Copia de los datos fiscales del cliente al emitir: una factura es un
  -- documento, no una vista de la ficha del cliente.
  cliente_nombre  text not null,
  cliente_nif     text,
  cliente_direccion text,

  periodo_inicio  date not null,
  periodo_fin     date not null,
  fecha_emision   date not null default current_date,
  estado          app.estado_factura not null default 'borrador',

  base_imponible  numeric(12,2) not null default 0 check (base_imponible >= 0),
  igic_pct        numeric(5,2) not null default 7 check (igic_pct >= 0 and igic_pct <= 100),
  igic_importe    numeric(12,2) not null default 0 check (igic_importe >= 0),
  total           numeric(12,2) not null default 0 check (total >= 0),

  cobrada_en      timestamptz,
  airtable_id     text unique,
  notas           text,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),

  constraint factura_periodo_coherente check (periodo_fin >= periodo_inicio)
);

comment on column public.facturas.igic_pct is
  'IGIC repercutido, en porcentaje. Por defecto 7 (tipo general canario). Se guarda por factura para que el histórico no se mueva si cambia el tipo.';

create index on public.facturas (cliente_facturacion_id, periodo_inicio desc);
create index on public.facturas (estado);

create table public.factura_lineas (
  id              uuid primary key default gen_random_uuid(),
  factura_id      uuid not null references public.facturas(id) on delete cascade,
  limpieza_id     uuid references public.limpiezas(id) on delete set null,

  -- Instantánea: la línea describe lo que se facturó, aunque luego cambien
  -- el nombre de la vivienda o el precio.
  descripcion     text not null,
  vivienda_nombre text not null,
  fecha           date not null,
  importe         numeric(10,2) not null check (importe >= 0)
);

create index on public.factura_lineas (factura_id);

alter table public.limpiezas
  add constraint limpiezas_factura_fk
  foreign key (factura_id) references public.facturas(id) on delete set null;

-- -----------------------------------------------------------------------------
-- Usuarios
-- -----------------------------------------------------------------------------

create table public.perfiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  rol            app.rol_usuario not null,
  -- Solo para el rol 'empleada': a qué empleada corresponde.
  empleada_id    uuid references public.empleadas(id) on delete cascade,
  nombre         text not null,
  activo         boolean not null default true,
  creado_en      timestamptz not null default now(),

  constraint perfil_empleada_coherente check (
    (rol = 'empleada' and empleada_id is not null)
    or (rol <> 'empleada' and empleada_id is null)
  )
);

create index on public.perfiles (empleada_id);

-- -----------------------------------------------------------------------------
-- Funciones de apoyo a las policies
-- -----------------------------------------------------------------------------

create or replace function app.rol_actual()
returns app.rol_usuario
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.rol from public.perfiles p
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

create or replace function app.empleada_actual()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.empleada_id from public.perfiles p
  where p.id = auth.uid() and p.activo and p.rol = 'empleada'
$$;

-- -----------------------------------------------------------------------------
-- EL MOTOR DE TARIFAS
--
-- Devuelve el importe SIN IGIC de una limpieza, y de paso la explicación de
-- cómo ha salido, para que se pueda justificar ante el cliente.
--
-- Es SECURITY INVOKER a propósito (comportamiento por defecto): así respeta
-- RLS y nadie puede consultar por esta vía tarifas de un cliente que no le
-- corresponde.
-- -----------------------------------------------------------------------------

create or replace function app.calcular_precio_limpieza(
  p_vivienda_id   uuid,
  p_fecha         date,
  p_huespedes     integer,
  p_tipo_servicio app.tipo_servicio default 'salida'
)
returns table (importe numeric, origen text)
language plpgsql
stable
as $$
declare
  v_cliente_id uuid;
  v_cerrado    numeric(10,2);
  v_lista      record;
  v_extra      integer;
begin
  select v.cliente_facturacion_id into v_cliente_id
  from public.viviendas v
  where v.id = p_vivienda_id;

  if v_cliente_id is null then
    raise exception 'Vivienda % no encontrada (o sin cliente de facturación)', p_vivienda_id;
  end if;

  -- 1) Precio cerrado de la vivienda: manda sobre la lista del cliente.
  select pc.importe into v_cerrado
  from public.precios_cerrados pc
  where pc.vivienda_id = p_vivienda_id
    and pc.tipo_servicio = p_tipo_servicio
    and p_fecha >= pc.vigente_desde
    and (pc.vigente_hasta is null or p_fecha <= pc.vigente_hasta)
  limit 1;

  if v_cerrado is not null then
    return query select v_cerrado, format('precio cerrado de la vivienda (%s)', p_tipo_servicio);
    return;
  end if;

  -- 2) Lista del cliente y, si no tiene, la lista por defecto. El `order by`
  --    pone primero la del cliente: una sola consulta decide la precedencia.
  select l.id, l.nombre, lpl.importe_base, lpl.huespedes_incluidos, lpl.importe_huesped_extra
    into v_lista
  from public.listas_precio l
  join public.listas_precio_lineas lpl on lpl.lista_id = l.id
  where lpl.tipo_servicio = p_tipo_servicio
    and p_fecha >= l.vigente_desde
    and (l.vigente_hasta is null or p_fecha <= l.vigente_hasta)
    and (l.cliente_facturacion_id = v_cliente_id or l.cliente_facturacion_id is null)
  order by (l.cliente_facturacion_id is null), l.vigente_desde desc
  limit 1;

  if v_lista is null then
    raise exception
      'Sin tarifa aplicable: vivienda %, servicio %, fecha %. Falta lista de precios vigente o precio cerrado.',
      p_vivienda_id, p_tipo_servicio, p_fecha;
  end if;

  v_extra := greatest(coalesce(p_huespedes, 0) - v_lista.huespedes_incluidos, 0);

  return query
    select
      v_lista.importe_base + (v_extra * v_lista.importe_huesped_extra),
      format(
        'lista "%s": base %s€ hasta %s huéspedes + %s extra × %s€',
        v_lista.nombre,
        v_lista.importe_base,
        v_lista.huespedes_incluidos,
        v_extra,
        v_lista.importe_huesped_extra
      );
end;
$$;

comment on function app.calcular_precio_limpieza is
  'Importe SIN IGIC de una limpieza. Precedencia: precio cerrado de la vivienda > lista del cliente > lista por defecto. Si no hay ninguna vigente, lanza excepción en vez de devolver 0.';

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
    'clientes_facturacion', 'viviendas', 'empleadas', 'limpiezas', 'facturas'
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
