-- =============================================================================
-- mirador-operativa · 999_test_rls.sql
--
-- Comprueba que el aislamiento por propietario funciona de verdad. No basta
-- con que las policies existan: hay que verificar que un propietario no ve lo
-- del vecino y que no puede escribir.
--
-- Se ejecuta sobre una base ya migrada (001 → 002 → 003):
--
--   psql -d mirador -v ON_ERROR_STOP=1 -f db/mirador/999_test_rls.sql
--
-- Crea sus propios datos, comprueba, y hace ROLLBACK: no deja rastro. Se puede
-- lanzar contra producción sin miedo, aunque lo suyo es usarlo en staging.
--
-- Si algo no cuadra, aborta con un mensaje que dice qué esperaba y qué obtuvo.
-- Terminar sin excepciones = todo correcto.
-- =============================================================================

\set ON_ERROR_STOP on

begin;

-- -----------------------------------------------------------------------------
-- Datos de prueba: dos propietarios que no deben verse entre sí
-- -----------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'gestor@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'propietario.a@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'propietario.b@test.local');

insert into public.propietarios (id, nombre) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Propietario A de prueba'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Propietario B de prueba');

insert into public.perfiles (id, rol, propietario_id, nombre) values
  ('11111111-1111-1111-1111-111111111111', 'gestor', null, 'Gestora de prueba'),
  ('22222222-2222-2222-2222-222222222222', 'propietario',
     'aaaaaaaa-0000-0000-0000-000000000001', 'Propietario A'),
  ('33333333-3333-3333-3333-333333333333', 'propietario',
     'bbbbbbbb-0000-0000-0000-000000000002', 'Propietario B');

insert into public.grupos_liquidacion (id, nombre) values
  ('cccccccc-0000-0000-0000-000000000001', 'Grupo de prueba A'),
  ('cccccccc-0000-0000-0000-000000000002', 'Grupo de prueba B');

insert into public.viviendas (id, nombre, propietario_id, grupo_liquidacion_id) values
  ('dddddddd-0000-0000-0000-000000000001', 'Vivienda de A',
     'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000002', 'Vivienda de B',
     'bbbbbbbb-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000002');

insert into public.reservas (vivienda_id, huespedes, entrada, salida, importe_total) values
  ('dddddddd-0000-0000-0000-000000000001', 4, date '2026-03-01', date '2026-03-05', 800),
  ('dddddddd-0000-0000-0000-000000000002', 2, date '2026-03-02', date '2026-03-06', 600);

insert into public.movimientos (vivienda_id, tipo, fecha, concepto, importe) values
  ('dddddddd-0000-0000-0000-000000000001', 'ingreso', date '2026-03-05', 'Reserva marzo', 800),
  ('dddddddd-0000-0000-0000-000000000002', 'ingreso', date '2026-03-06', 'Reserva marzo', 600);

-- Una liquidación emitida y otra en borrador, para comprobar que el borrador
-- no le llega al propietario.
insert into public.liquidaciones
  (id, propietario_id, periodo_inicio, periodo_fin, estado, emitida_en)
values
  ('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
     date '2026-03-01', date '2026-03-31', 'emitida', now()),
  ('eeeeeeee-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001',
     date '2026-04-01', date '2026-04-30', 'borrador', null),
  ('eeeeeeee-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000002',
     date '2026-03-01', date '2026-03-31', 'emitida', now());

-- -----------------------------------------------------------------------------
-- 1 · El propietario A solo ve lo suyo
-- -----------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

do $$
declare n integer;
begin
  select count(*) into n from public.viviendas;
  if n <> 1 then
    raise exception 'A ve % viviendas, esperaba 1 (la suya)', n;
  end if;

  select count(*) into n from public.viviendas
  where propietario_id <> 'aaaaaaaa-0000-0000-0000-000000000001';
  if n <> 0 then
    raise exception 'A ve % viviendas ajenas, esperaba 0', n;
  end if;

  select count(*) into n from public.reservas;
  if n <> 1 then
    raise exception 'A ve % reservas, esperaba 1', n;
  end if;

  select count(*) into n from public.movimientos;
  if n <> 1 then
    raise exception 'A ve % movimientos, esperaba 1', n;
  end if;

  select count(*) into n from public.propietarios;
  if n <> 1 then
    raise exception 'A ve % propietarios, esperaba 1 (solo a sí mismo)', n;
  end if;

  -- Ve su liquidación emitida, NO su borrador, NO la de B.
  select count(*) into n from public.liquidaciones;
  if n <> 1 then
    raise exception 'A ve % liquidaciones, esperaba 1 (la emitida suya)', n;
  end if;

  select count(*) into n from public.liquidaciones where estado = 'borrador';
  if n <> 0 then
    raise exception 'A ve % liquidaciones en borrador, esperaba 0', n;
  end if;

  -- Ve el grupo que le aplica, no el del vecino.
  select count(*) into n from public.grupos_liquidacion;
  if n <> 1 then
    raise exception 'A ve % grupos de liquidación, esperaba 1 (el suyo)', n;
  end if;

  raise notice 'OK · el propietario A solo ve lo suyo';
end;
$$;

-- -----------------------------------------------------------------------------
-- 2 · El propietario A no puede escribir nada
-- -----------------------------------------------------------------------------

do $$
declare hubo_error boolean;
begin
  hubo_error := false;
  begin
    insert into public.viviendas (nombre, propietario_id)
    values ('Colada', 'aaaaaaaa-0000-0000-0000-000000000001');
  exception when insufficient_privilege or others then
    hubo_error := true;
  end;
  if not hubo_error then
    raise exception 'FALLO GRAVE: el propietario A ha podido crear una vivienda';
  end if;

  hubo_error := false;
  begin
    update public.viviendas set nombre = 'Renombrada'
    where id = 'dddddddd-0000-0000-0000-000000000001';
    -- Un UPDATE sin policy no da error: simplemente no afecta a ninguna fila.
    if found then
      raise exception 'FALLO GRAVE: el propietario A ha modificado su vivienda';
    end if;
    hubo_error := true;
  exception when insufficient_privilege then
    hubo_error := true;
  end;

  hubo_error := false;
  begin
    update public.liquidaciones set importe_propietario = 99999
    where id = 'eeeeeeee-0000-0000-0000-000000000001';
    if found then
      raise exception 'FALLO GRAVE: el propietario A ha alterado el importe de su liquidación';
    end if;
  exception when insufficient_privilege then
    null;
  end;

  raise notice 'OK · el propietario A no puede escribir';
end;
$$;

-- -----------------------------------------------------------------------------
-- 3 · El propietario B ve lo suyo y nada de A
-- -----------------------------------------------------------------------------

set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';

do $$
declare n integer;
begin
  select count(*) into n from public.viviendas;
  if n <> 1 then
    raise exception 'B ve % viviendas, esperaba 1', n;
  end if;

  select count(*) into n from public.viviendas
  where id = 'dddddddd-0000-0000-0000-000000000001';
  if n <> 0 then
    raise exception 'FALLO GRAVE: B ve la vivienda de A';
  end if;

  select count(*) into n from public.liquidaciones
  where propietario_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if n <> 0 then
    raise exception 'FALLO GRAVE: B ve liquidaciones de A';
  end if;

  raise notice 'OK · el propietario B está aislado de A';
end;
$$;

-- -----------------------------------------------------------------------------
-- 4 · La gestora lo ve todo
-- -----------------------------------------------------------------------------

set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

do $$
declare n integer;
begin
  select count(*) into n from public.viviendas;
  if n < 2 then
    raise exception 'La gestora ve % viviendas, esperaba al menos 2', n;
  end if;

  select count(*) into n from public.liquidaciones;
  if n < 3 then
    raise exception 'La gestora ve % liquidaciones, esperaba al menos 3 (borradores incluidos)', n;
  end if;

  raise notice 'OK · la gestora ve todo el dominio';
end;
$$;

-- -----------------------------------------------------------------------------
-- 5 · Un usuario autenticado SIN perfil no ve absolutamente nada
--
-- El caso que más se escapa: alguien se registra en Auth pero nadie le ha dado
-- de alta en `perfiles`. No debe ver ni una fila.
-- -----------------------------------------------------------------------------

set local request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';

do $$
declare n integer;
begin
  select count(*) into n from public.viviendas;
  if n <> 0 then
    raise exception 'FALLO GRAVE: un usuario sin perfil ve % viviendas', n;
  end if;

  select count(*) into n from public.liquidaciones;
  if n <> 0 then
    raise exception 'FALLO GRAVE: un usuario sin perfil ve % liquidaciones', n;
  end if;

  select count(*) into n from public.propietarios;
  if n <> 0 then
    raise exception 'FALLO GRAVE: un usuario sin perfil ve % propietarios', n;
  end if;

  raise notice 'OK · un usuario sin perfil no ve nada';
end;
$$;

-- -----------------------------------------------------------------------------
-- 6 · Nadie puede escribir en las limpiezas replicadas
--
-- El puente es de un solo sentido: ni siquiera la gestora debe poder tocar la
-- réplica, porque la verdad de ese dato vive en aires-operativa.
-- -----------------------------------------------------------------------------

set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

do $$
declare hubo_error boolean := false;
begin
  begin
    insert into public.limpiezas_replicadas
      (origen_id, vivienda_id, fecha, estado)
    values
      (gen_random_uuid(), 'dddddddd-0000-0000-0000-000000000001',
       current_date, 'completada');
  exception when insufficient_privilege or others then
    hubo_error := true;
  end;

  if not hubo_error then
    raise exception
      'FALLO: la gestora ha podido escribir en limpiezas_replicadas. Solo debe escribir el puente (service_role).';
  end if;

  raise notice 'OK · limpiezas_replicadas es de solo lectura para la app';
end;
$$;

reset role;

rollback;

\echo ''
\echo '================================================'
\echo ' Todas las comprobaciones de RLS han pasado.'
\echo ' (La transacción se ha deshecho: nada persiste.)'
\echo '================================================'
