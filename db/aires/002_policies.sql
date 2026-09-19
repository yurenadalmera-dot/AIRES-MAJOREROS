-- =============================================================================
-- aires-operativa · 002_policies.sql
-- Row Level Security
--
-- Igual que en Mirador: **ninguna policy usa `using(true)`**.
--
-- Modelo de acceso:
--   · gestor          → todo el dominio.
--   · empleada        → sus limpiezas y las viviendas donde trabaja. Puede
--                       avanzar el estado de su trabajo y poco más. No ve
--                       clientes, facturas, listas de precio ni precios
--                       cerrados: eso es información comercial.
--   · automatizacion  → `service_role`, salta RLS. Sin policies a propósito.
--   · anon            → nada.
--
-- Decisión consciente: una empleada SÍ ve el importe de la limpieza que ella
-- misma hace (está en la misma fila y RLS filtra filas, no columnas), pero NO
-- ve la tarifa general de ningún cliente. Si en algún momento hiciera falta
-- ocultarle también ese importe, la vía es una vista sin esa columna, no
-- retorcer estas policies.
--
-- Comprobación de que no queda nada abierto (ambas deben dar 0 filas):
--
--   select tablename from pg_tables
--   where schemaname = 'public' and rowsecurity = false;
--
--   select policyname, tablename from pg_policies
--   where schemaname = 'public' and (qual = 'true' or with_check = 'true');
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Privilegios de base
-- -----------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

grant usage on schema public to authenticated;
grant usage on schema app to authenticated;

grant select on all tables in schema public to authenticated;

grant insert, update, delete on
  public.clientes_facturacion,
  public.viviendas,
  public.listas_precio,
  public.listas_precio_lineas,
  public.precios_cerrados,
  public.empleadas,
  public.limpiezas,
  public.facturas,
  public.factura_lineas,
  public.perfiles
to authenticated;

grant execute on function
  app.rol_actual(),
  app.es_gestor(),
  app.empleada_actual(),
  app.calcular_precio_limpieza(uuid, date, integer, app.tipo_servicio)
to authenticated;

-- -----------------------------------------------------------------------------
-- RLS activada en todas las tablas
-- -----------------------------------------------------------------------------

alter table public.clientes_facturacion enable row level security;
alter table public.viviendas            enable row level security;
alter table public.listas_precio        enable row level security;
alter table public.listas_precio_lineas enable row level security;
alter table public.precios_cerrados     enable row level security;
alter table public.empleadas            enable row level security;
alter table public.limpiezas            enable row level security;
alter table public.facturas             enable row level security;
alter table public.factura_lineas       enable row level security;
alter table public.perfiles             enable row level security;

-- -----------------------------------------------------------------------------
-- perfiles
-- -----------------------------------------------------------------------------

create policy perfiles_propio_select on public.perfiles
  for select to authenticated
  using (id = auth.uid());

create policy perfiles_gestor_select on public.perfiles
  for select to authenticated
  using (app.es_gestor());

create policy perfiles_gestor_insert on public.perfiles
  for insert to authenticated with check (app.es_gestor());

create policy perfiles_gestor_update on public.perfiles
  for update to authenticated using (app.es_gestor()) with check (app.es_gestor());

create policy perfiles_gestor_delete on public.perfiles
  for delete to authenticated using (app.es_gestor());

-- -----------------------------------------------------------------------------
-- clientes_facturacion · solo gestión. Una empleada no tiene por qué saber a
-- quién se le factura ni cuánto.
-- -----------------------------------------------------------------------------

create policy clientes_gestor_select on public.clientes_facturacion
  for select to authenticated using (app.es_gestor());

create policy clientes_gestor_insert on public.clientes_facturacion
  for insert to authenticated with check (app.es_gestor());

create policy clientes_gestor_update on public.clientes_facturacion
  for update to authenticated using (app.es_gestor()) with check (app.es_gestor());

create policy clientes_gestor_delete on public.clientes_facturacion
  for delete to authenticated using (app.es_gestor());

-- -----------------------------------------------------------------------------
-- viviendas · la empleada ve aquellas donde tiene trabajo asignado
-- -----------------------------------------------------------------------------

create policy viviendas_gestor_select on public.viviendas
  for select to authenticated using (app.es_gestor());

create policy viviendas_empleada_select on public.viviendas
  for select to authenticated
  using (
    exists (
      select 1 from public.limpiezas l
      where l.vivienda_id = viviendas.id
        and l.empleada_id = app.empleada_actual()
    )
  );

create policy viviendas_gestor_insert on public.viviendas
  for insert to authenticated with check (app.es_gestor());

create policy viviendas_gestor_update on public.viviendas
  for update to authenticated using (app.es_gestor()) with check (app.es_gestor());

create policy viviendas_gestor_delete on public.viviendas
  for delete to authenticated using (app.es_gestor());

-- -----------------------------------------------------------------------------
-- Tarifas · exclusivamente gestión
-- -----------------------------------------------------------------------------

create policy listas_gestor_select on public.listas_precio
  for select to authenticated using (app.es_gestor());

create policy listas_gestor_insert on public.listas_precio
  for insert to authenticated with check (app.es_gestor());

create policy listas_gestor_update on public.listas_precio
  for update to authenticated using (app.es_gestor()) with check (app.es_gestor());

create policy listas_gestor_delete on public.listas_precio
  for delete to authenticated using (app.es_gestor());

create policy lineas_gestor_select on public.listas_precio_lineas
  for select to authenticated using (app.es_gestor());

create policy lineas_gestor_insert on public.listas_precio_lineas
  for insert to authenticated with check (app.es_gestor());

create policy lineas_gestor_update on public.listas_precio_lineas
  for update to authenticated using (app.es_gestor()) with check (app.es_gestor());

create policy lineas_gestor_delete on public.listas_precio_lineas
  for delete to authenticated using (app.es_gestor());

create policy cerrados_gestor_select on public.precios_cerrados
  for select to authenticated using (app.es_gestor());

create policy cerrados_gestor_insert on public.precios_cerrados
  for insert to authenticated with check (app.es_gestor());

create policy cerrados_gestor_update on public.precios_cerrados
  for update to authenticated using (app.es_gestor()) with check (app.es_gestor());

create policy cerrados_gestor_delete on public.precios_cerrados
  for delete to authenticated using (app.es_gestor());

-- -----------------------------------------------------------------------------
-- empleadas · cada una se ve a sí misma
-- -----------------------------------------------------------------------------

create policy empleadas_gestor_select on public.empleadas
  for select to authenticated using (app.es_gestor());

create policy empleadas_propia_select on public.empleadas
  for select to authenticated using (id = app.empleada_actual());

create policy empleadas_gestor_insert on public.empleadas
  for insert to authenticated with check (app.es_gestor());

create policy empleadas_gestor_update on public.empleadas
  for update to authenticated using (app.es_gestor()) with check (app.es_gestor());

create policy empleadas_gestor_delete on public.empleadas
  for delete to authenticated using (app.es_gestor());

-- -----------------------------------------------------------------------------
-- limpiezas
--
-- La empleada ve y actualiza las suyas. Qué puede cambiar exactamente lo
-- acota el trigger de más abajo: RLS decide sobre filas, no sobre columnas, y
-- aquí hace falta lo segundo.
-- -----------------------------------------------------------------------------

create policy limpiezas_gestor_select on public.limpiezas
  for select to authenticated using (app.es_gestor());

create policy limpiezas_empleada_select on public.limpiezas
  for select to authenticated
  using (empleada_id = app.empleada_actual());

create policy limpiezas_gestor_insert on public.limpiezas
  for insert to authenticated with check (app.es_gestor());

create policy limpiezas_gestor_update on public.limpiezas
  for update to authenticated using (app.es_gestor()) with check (app.es_gestor());

-- La empleada solo puede actualizar una limpieza que sigue siendo suya: el
-- WITH CHECK impide que se la reasigne a otra persona de paso.
create policy limpiezas_empleada_update on public.limpiezas
  for update to authenticated
  using (empleada_id = app.empleada_actual())
  with check (empleada_id = app.empleada_actual());

create policy limpiezas_gestor_delete on public.limpiezas
  for delete to authenticated using (app.es_gestor());

-- -----------------------------------------------------------------------------
-- Qué puede tocar realmente una empleada
--
-- Sin esto, la policy de UPDATE le dejaría cambiar el importe de su propia
-- limpieza. Se acota aquí, comparando OLD y NEW, porque es lo único que
-- distingue columnas dentro de una misma fila.
-- -----------------------------------------------------------------------------

create or replace function app.limitar_update_empleada()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- El gestor y las automatizaciones pasan sin más comprobaciones.
  if app.es_gestor() or app.empleada_actual() is null then
    return new;
  end if;

  if new.vivienda_id   is distinct from old.vivienda_id
     or new.empleada_id   is distinct from old.empleada_id
     or new.fecha         is distinct from old.fecha
     or new.tipo_servicio is distinct from old.tipo_servicio
     or new.huespedes     is distinct from old.huespedes
     or new.importe       is distinct from old.importe
     or new.importe_origen is distinct from old.importe_origen
     or new.facturable    is distinct from old.facturable
     or new.factura_id    is distinct from old.factura_id
  then
    raise exception
      'Una empleada solo puede cambiar el estado y las notas de su limpieza.';
  end if;

  -- Tampoco puede reabrir algo ya facturado.
  if old.factura_id is not null and new.estado is distinct from old.estado then
    raise exception 'La limpieza ya está facturada: su estado no se puede cambiar.';
  end if;

  return new;
end;
$$;

create trigger limpiezas_limitar_update_empleada
  before update on public.limpiezas
  for each row execute function app.limitar_update_empleada();

-- -----------------------------------------------------------------------------
-- facturas · solo gestión, de principio a fin
-- -----------------------------------------------------------------------------

create policy facturas_gestor_select on public.facturas
  for select to authenticated using (app.es_gestor());

create policy facturas_gestor_insert on public.facturas
  for insert to authenticated with check (app.es_gestor());

create policy facturas_gestor_update on public.facturas
  for update to authenticated using (app.es_gestor()) with check (app.es_gestor());

create policy facturas_gestor_delete on public.facturas
  for delete to authenticated using (app.es_gestor());

create policy factura_lineas_gestor_select on public.factura_lineas
  for select to authenticated using (app.es_gestor());

create policy factura_lineas_gestor_insert on public.factura_lineas
  for insert to authenticated with check (app.es_gestor());

create policy factura_lineas_gestor_update on public.factura_lineas
  for update to authenticated using (app.es_gestor()) with check (app.es_gestor());

create policy factura_lineas_gestor_delete on public.factura_lineas
  for delete to authenticated using (app.es_gestor());

-- -----------------------------------------------------------------------------
-- Objetos futuros
-- -----------------------------------------------------------------------------

alter default privileges in schema public
  revoke all on tables from anon, authenticated;

alter default privileges in schema public
  revoke all on sequences from anon, authenticated;
