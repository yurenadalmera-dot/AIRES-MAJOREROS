-- =============================================================================
-- mirador-operativa · 002_policies.sql
-- Row Level Security
--
-- Regla que este fichero cumple sin excepciones: **ninguna policy usa
-- `using(true)`**. Ese fue el error nº1 heredado de Araya y aquí no se repite.
-- Cada policy nombra a quién deja pasar y por qué.
--
-- El modelo es corto de explicar:
--   · gestor        → lee y escribe todo el dominio.
--   · propietario   → lee SOLO lo que cuelga de sus viviendas. No escribe nada.
--   · automatizacion (n8n) → entra con `service_role`, que salta RLS por
--     diseño de Supabase. No necesita policies y por eso no las tiene: darle
--     policies sería darle una segunda puerta que habría que vigilar.
--   · anon          → nada. Ni una fila.
--
-- Comprobación rápida de que no queda nada abierto (debe devolver 0 filas):
--
--   select tablename from pg_tables
--   where schemaname = 'public' and rowsecurity = false;
--
--   select policyname, tablename from pg_policies
--   where schemaname = 'public' and (qual = 'true' or with_check = 'true');
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Privilegios de base
--
-- RLS filtra filas, pero no concede permisos: sin GRANT no se lee nada aunque
-- la policy lo permita, y sin RLS el GRANT lo deja todo al aire. Hacen falta
-- los dos.
-- -----------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

grant usage on schema public to authenticated;
grant usage on schema app to authenticated;

-- Lectura para todos los autenticados: qué filas ven lo deciden las policies.
grant select on all tables in schema public to authenticated;

-- Escritura: solo donde el gestor tiene algo que hacer. `limpiezas_replicadas`
-- queda deliberadamente fuera — la escribe únicamente el puente.
grant insert, update, delete on
  public.propietarios,
  public.grupos_liquidacion,
  public.viviendas,
  public.reservas,
  public.movimientos,
  public.reglas_liquidacion,
  public.reglas_liquidacion_tramos,
  public.liquidaciones,
  public.liquidacion_lineas,
  public.perfiles
to authenticated;

grant execute on function
  app.rol_actual(),
  app.es_gestor(),
  app.propietario_actual()
to authenticated;

-- `anon` no recibe nada en absoluto: la app de Mirador no tiene zona pública.

-- -----------------------------------------------------------------------------
-- RLS activada en todas las tablas del dominio
-- -----------------------------------------------------------------------------

alter table public.propietarios              enable row level security;
alter table public.grupos_liquidacion        enable row level security;
alter table public.viviendas                 enable row level security;
alter table public.reservas                  enable row level security;
alter table public.movimientos               enable row level security;
alter table public.reglas_liquidacion        enable row level security;
alter table public.reglas_liquidacion_tramos enable row level security;
alter table public.liquidaciones             enable row level security;
alter table public.liquidacion_lineas        enable row level security;
alter table public.limpiezas_replicadas      enable row level security;
alter table public.perfiles                  enable row level security;

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
  for insert to authenticated
  with check (app.es_gestor());

create policy perfiles_gestor_update on public.perfiles
  for update to authenticated
  using (app.es_gestor())
  with check (app.es_gestor());

create policy perfiles_gestor_delete on public.perfiles
  for delete to authenticated
  using (app.es_gestor());

-- -----------------------------------------------------------------------------
-- propietarios
--
-- El propietario se ve a sí mismo y a nadie más: no debe saber quiénes son los
-- demás propietarios de la cartera.
-- -----------------------------------------------------------------------------

create policy propietarios_gestor_select on public.propietarios
  for select to authenticated
  using (app.es_gestor());

create policy propietarios_propio_select on public.propietarios
  for select to authenticated
  using (id = app.propietario_actual());

create policy propietarios_gestor_insert on public.propietarios
  for insert to authenticated
  with check (app.es_gestor());

create policy propietarios_gestor_update on public.propietarios
  for update to authenticated
  using (app.es_gestor())
  with check (app.es_gestor());

create policy propietarios_gestor_delete on public.propietarios
  for delete to authenticated
  using (app.es_gestor());

-- -----------------------------------------------------------------------------
-- grupos_liquidacion
--
-- Un propietario ve los grupos que le aplican: es el trato que tiene firmado,
-- tiene derecho a consultarlo. No ve los grupos de los demás.
-- -----------------------------------------------------------------------------

create policy grupos_gestor_select on public.grupos_liquidacion
  for select to authenticated
  using (app.es_gestor());

create policy grupos_propietario_select on public.grupos_liquidacion
  for select to authenticated
  using (
    exists (
      select 1 from public.viviendas v
      where v.grupo_liquidacion_id = grupos_liquidacion.id
        and v.propietario_id = app.propietario_actual()
    )
  );

create policy grupos_gestor_insert on public.grupos_liquidacion
  for insert to authenticated
  with check (app.es_gestor());

create policy grupos_gestor_update on public.grupos_liquidacion
  for update to authenticated
  using (app.es_gestor())
  with check (app.es_gestor());

create policy grupos_gestor_delete on public.grupos_liquidacion
  for delete to authenticated
  using (app.es_gestor());

-- -----------------------------------------------------------------------------
-- viviendas · el filtro por propietario del que cuelga todo lo demás
-- -----------------------------------------------------------------------------

create policy viviendas_gestor_select on public.viviendas
  for select to authenticated
  using (app.es_gestor());

create policy viviendas_propietario_select on public.viviendas
  for select to authenticated
  using (propietario_id = app.propietario_actual());

create policy viviendas_gestor_insert on public.viviendas
  for insert to authenticated
  with check (app.es_gestor());

create policy viviendas_gestor_update on public.viviendas
  for update to authenticated
  using (app.es_gestor())
  with check (app.es_gestor());

create policy viviendas_gestor_delete on public.viviendas
  for delete to authenticated
  using (app.es_gestor());

-- -----------------------------------------------------------------------------
-- reservas
-- -----------------------------------------------------------------------------

create policy reservas_gestor_select on public.reservas
  for select to authenticated
  using (app.es_gestor());

create policy reservas_propietario_select on public.reservas
  for select to authenticated
  using (
    exists (
      select 1 from public.viviendas v
      where v.id = reservas.vivienda_id
        and v.propietario_id = app.propietario_actual()
    )
  );

create policy reservas_gestor_insert on public.reservas
  for insert to authenticated
  with check (app.es_gestor());

create policy reservas_gestor_update on public.reservas
  for update to authenticated
  using (app.es_gestor())
  with check (app.es_gestor());

create policy reservas_gestor_delete on public.reservas
  for delete to authenticated
  using (app.es_gestor());

-- -----------------------------------------------------------------------------
-- movimientos
-- -----------------------------------------------------------------------------

create policy movimientos_gestor_select on public.movimientos
  for select to authenticated
  using (app.es_gestor());

create policy movimientos_propietario_select on public.movimientos
  for select to authenticated
  using (
    exists (
      select 1 from public.viviendas v
      where v.id = movimientos.vivienda_id
        and v.propietario_id = app.propietario_actual()
    )
  );

create policy movimientos_gestor_insert on public.movimientos
  for insert to authenticated
  with check (app.es_gestor());

create policy movimientos_gestor_update on public.movimientos
  for update to authenticated
  using (app.es_gestor())
  with check (app.es_gestor());

create policy movimientos_gestor_delete on public.movimientos
  for delete to authenticated
  using (app.es_gestor());

-- -----------------------------------------------------------------------------
-- reglas_liquidacion y sus tramos
-- -----------------------------------------------------------------------------

create policy reglas_gestor_select on public.reglas_liquidacion
  for select to authenticated
  using (app.es_gestor());

create policy reglas_propietario_select on public.reglas_liquidacion
  for select to authenticated
  using (
    exists (
      select 1 from public.viviendas v
      where v.grupo_liquidacion_id = reglas_liquidacion.grupo_liquidacion_id
        and v.propietario_id = app.propietario_actual()
    )
  );

create policy reglas_gestor_insert on public.reglas_liquidacion
  for insert to authenticated
  with check (app.es_gestor());

create policy reglas_gestor_update on public.reglas_liquidacion
  for update to authenticated
  using (app.es_gestor())
  with check (app.es_gestor());

create policy reglas_gestor_delete on public.reglas_liquidacion
  for delete to authenticated
  using (app.es_gestor());

create policy tramos_gestor_select on public.reglas_liquidacion_tramos
  for select to authenticated
  using (app.es_gestor());

create policy tramos_propietario_select on public.reglas_liquidacion_tramos
  for select to authenticated
  using (
    exists (
      select 1
      from public.reglas_liquidacion r
      join public.viviendas v
        on v.grupo_liquidacion_id = r.grupo_liquidacion_id
      where r.id = reglas_liquidacion_tramos.regla_id
        and v.propietario_id = app.propietario_actual()
    )
  );

create policy tramos_gestor_insert on public.reglas_liquidacion_tramos
  for insert to authenticated
  with check (app.es_gestor());

create policy tramos_gestor_update on public.reglas_liquidacion_tramos
  for update to authenticated
  using (app.es_gestor())
  with check (app.es_gestor());

create policy tramos_gestor_delete on public.reglas_liquidacion_tramos
  for delete to authenticated
  using (app.es_gestor());

-- -----------------------------------------------------------------------------
-- liquidaciones y líneas
--
-- Lo más sensible del dominio: aquí está el dinero de cada propietario.
-- -----------------------------------------------------------------------------

create policy liquidaciones_gestor_select on public.liquidaciones
  for select to authenticated
  using (app.es_gestor());

-- El propietario ve sus liquidaciones, pero no los borradores: un número a
-- medio cuadrar no debe llegarle antes de que Emma lo dé por bueno.
create policy liquidaciones_propietario_select on public.liquidaciones
  for select to authenticated
  using (
    propietario_id = app.propietario_actual()
    and estado <> 'borrador'
  );

create policy liquidaciones_gestor_insert on public.liquidaciones
  for insert to authenticated
  with check (app.es_gestor());

create policy liquidaciones_gestor_update on public.liquidaciones
  for update to authenticated
  using (app.es_gestor())
  with check (app.es_gestor());

create policy liquidaciones_gestor_delete on public.liquidaciones
  for delete to authenticated
  using (app.es_gestor());

create policy liquidacion_lineas_gestor_select on public.liquidacion_lineas
  for select to authenticated
  using (app.es_gestor());

create policy liquidacion_lineas_propietario_select on public.liquidacion_lineas
  for select to authenticated
  using (
    exists (
      select 1 from public.liquidaciones l
      where l.id = liquidacion_lineas.liquidacion_id
        and l.propietario_id = app.propietario_actual()
        and l.estado <> 'borrador'
    )
  );

create policy liquidacion_lineas_gestor_insert on public.liquidacion_lineas
  for insert to authenticated
  with check (app.es_gestor());

create policy liquidacion_lineas_gestor_update on public.liquidacion_lineas
  for update to authenticated
  using (app.es_gestor())
  with check (app.es_gestor());

create policy liquidacion_lineas_gestor_delete on public.liquidacion_lineas
  for delete to authenticated
  using (app.es_gestor());

-- -----------------------------------------------------------------------------
-- limpiezas_replicadas
--
-- Solo lectura para todo el mundo, gestor incluido. La verdad de este dato
-- nace en aires-operativa y llega por el puente; si Emma pudiera editarlo
-- aquí, las dos bases empezarían a discrepar y nadie sabría cuál creer.
-- Escribe únicamente el workflow de n8n, que entra con `service_role` y por
-- tanto no pasa por estas policies. La ausencia de policies de escritura es
-- intencionada, no un olvido.
-- -----------------------------------------------------------------------------

create policy limpiezas_gestor_select on public.limpiezas_replicadas
  for select to authenticated
  using (app.es_gestor());

create policy limpiezas_propietario_select on public.limpiezas_replicadas
  for select to authenticated
  using (
    exists (
      select 1 from public.viviendas v
      where v.id = limpiezas_replicadas.vivienda_id
        and v.propietario_id = app.propietario_actual()
    )
  );

-- -----------------------------------------------------------------------------
-- Objetos futuros: que nadie herede permisos por descuido
-- -----------------------------------------------------------------------------

alter default privileges in schema public
  revoke all on tables from anon, authenticated;

alter default privileges in schema public
  revoke all on sequences from anon, authenticated;
