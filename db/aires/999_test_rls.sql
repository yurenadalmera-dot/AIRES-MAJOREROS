-- =============================================================================
-- aires-operativa · 999_test_rls.sql
--
-- Comprueba que una empleada ve su trabajo y solo su trabajo, que puede
-- avanzarlo pero no tocar dinero, y que la información comercial (clientes,
-- tarifas, facturas) no se le escapa por ningún lado.
--
--   psql -d aires -v ON_ERROR_STOP=1 -f db/aires/999_test_rls.sql
--
-- Crea sus datos, comprueba y hace ROLLBACK: no deja rastro.
-- Terminar sin excepciones = todo correcto.
-- =============================================================================

\set ON_ERROR_STOP on

begin;

-- -----------------------------------------------------------------------------
-- Escenario: dos empleadas, dos viviendas, una limpieza cada una
-- -----------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'gestora@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'empleada.a@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'empleada.b@test.local');

insert into public.empleadas (id, nombre) values
  ('ea000000-0000-0000-0000-000000000001', 'Empleada A'),
  ('ea000000-0000-0000-0000-000000000002', 'Empleada B');

insert into public.perfiles (id, rol, empleada_id, nombre) values
  ('11111111-1111-1111-1111-111111111111', 'gestor', null, 'Gestora'),
  ('22222222-2222-2222-2222-222222222222', 'empleada',
     'ea000000-0000-0000-0000-000000000001', 'Empleada A'),
  ('33333333-3333-3333-3333-333333333333', 'empleada',
     'ea000000-0000-0000-0000-000000000002', 'Empleada B');

insert into public.clientes_facturacion (id, nombre, nif) values
  ('c1000000-0000-0000-0000-000000000001', 'Cliente de prueba', 'B00000000');

insert into public.viviendas (id, nombre, cliente_facturacion_id) values
  ('da000000-0000-0000-0000-000000000001', 'Vivienda de A',
     'c1000000-0000-0000-0000-000000000001'),
  ('da000000-0000-0000-0000-000000000002', 'Vivienda de B',
     'c1000000-0000-0000-0000-000000000001');

insert into public.limpiezas
  (id, vivienda_id, empleada_id, fecha, tipo_servicio, estado, huespedes, importe)
values
  ('11000000-0000-0000-0000-00000000000a', 'da000000-0000-0000-0000-000000000001',
     'ea000000-0000-0000-0000-000000000001', date '2026-03-15', 'salida', 'pendiente', 4, 80.00),
  ('11000000-0000-0000-0000-00000000000b', 'da000000-0000-0000-0000-000000000002',
     'ea000000-0000-0000-0000-000000000002', date '2026-03-16', 'salida', 'pendiente', 2, 60.00);

insert into public.facturas
  (numero, cliente_facturacion_id, cliente_nombre, periodo_inicio, periodo_fin, base_imponible, igic_importe, total)
values
  ('AM-2026-0001', 'c1000000-0000-0000-0000-000000000001', 'Cliente de prueba',
     date '2026-03-01', date '2026-03-31', 140.00, 9.80, 149.80);

-- -----------------------------------------------------------------------------
-- 1 · La empleada A ve su trabajo y nada más
-- -----------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

do $$
declare n integer;
begin
  select count(*) into n from public.limpiezas;
  if n <> 1 then
    raise exception 'A ve % limpiezas, esperaba 1 (la suya)', n;
  end if;

  select count(*) into n from public.limpiezas
  where empleada_id <> 'ea000000-0000-0000-0000-000000000001';
  if n <> 0 then
    raise exception 'FALLO GRAVE: A ve % limpiezas de otras', n;
  end if;

  -- Ve la vivienda donde trabaja, no la otra.
  select count(*) into n from public.viviendas;
  if n <> 1 then
    raise exception 'A ve % viviendas, esperaba 1 (donde tiene trabajo)', n;
  end if;

  raise notice 'OK · la empleada A ve solo su trabajo';
end;
$$;

-- -----------------------------------------------------------------------------
-- 2 · La información comercial no se le escapa
-- -----------------------------------------------------------------------------

do $$
declare n integer;
begin
  select count(*) into n from public.clientes_facturacion;
  if n <> 0 then
    raise exception 'FALLO: la empleada ve % clientes de facturación, esperaba 0', n;
  end if;

  select count(*) into n from public.facturas;
  if n <> 0 then
    raise exception 'FALLO: la empleada ve % facturas, esperaba 0', n;
  end if;

  select count(*) into n from public.listas_precio;
  if n <> 0 then
    raise exception 'FALLO: la empleada ve % listas de precio, esperaba 0', n;
  end if;

  select count(*) into n from public.precios_cerrados;
  if n <> 0 then
    raise exception 'FALLO: la empleada ve % precios cerrados, esperaba 0', n;
  end if;

  raise notice 'OK · clientes, tarifas y facturas quedan fuera del alcance de la empleada';
end;
$$;

-- -----------------------------------------------------------------------------
-- 3 · Puede avanzar su limpieza…
-- -----------------------------------------------------------------------------

do $$
declare v_estado app.estado_limpieza;
begin
  update public.limpiezas
     set estado = 'en_curso'
   where id = '11000000-0000-0000-0000-00000000000a';

  if not found then
    raise exception 'La empleada A no ha podido marcar en curso su propia limpieza';
  end if;

  select estado into v_estado from public.limpiezas
  where id = '11000000-0000-0000-0000-00000000000a';

  if v_estado <> 'en_curso' then
    raise exception 'El estado no se ha guardado: %', v_estado;
  end if;

  raise notice 'OK · la empleada puede avanzar el estado de su limpieza';
end;
$$;

-- -----------------------------------------------------------------------------
-- 4 · …pero no puede tocar el dinero ni reasignarse trabajo
-- -----------------------------------------------------------------------------

do $$
declare hubo_error boolean;
begin
  hubo_error := false;
  begin
    update public.limpiezas set importe = 500
    where id = '11000000-0000-0000-0000-00000000000a';
  exception when others then
    hubo_error := true;
  end;
  if not hubo_error then
    raise exception 'FALLO GRAVE: la empleada ha cambiado el importe de su limpieza';
  end if;

  hubo_error := false;
  begin
    update public.limpiezas set facturable = false
    where id = '11000000-0000-0000-0000-00000000000a';
  exception when others then
    hubo_error := true;
  end;
  if not hubo_error then
    raise exception 'FALLO GRAVE: la empleada ha marcado su limpieza como no facturable';
  end if;

  -- Robarle el trabajo a la compañera: la policy lo corta antes incluso que
  -- el trigger, porque la fila deja de cumplir el USING.
  hubo_error := false;
  begin
    update public.limpiezas
       set empleada_id = 'ea000000-0000-0000-0000-000000000001'
     where id = '11000000-0000-0000-0000-00000000000b';
    if not found then
      hubo_error := true;
    end if;
  exception when others then
    hubo_error := true;
  end;
  if not hubo_error then
    raise exception 'FALLO GRAVE: la empleada A se ha adjudicado la limpieza de B';
  end if;

  raise notice 'OK · la empleada no puede tocar importes, facturabilidad ni asignaciones';
end;
$$;

-- -----------------------------------------------------------------------------
-- 5 · La gestora sí puede con todo
-- -----------------------------------------------------------------------------

set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

do $$
declare n integer;
begin
  select count(*) into n from public.limpiezas;
  if n < 2 then
    raise exception 'La gestora ve % limpiezas, esperaba al menos 2', n;
  end if;

  select count(*) into n from public.facturas;
  if n < 1 then
    raise exception 'La gestora ve % facturas, esperaba al menos 1', n;
  end if;

  update public.limpiezas set importe = 85.00
  where id = '11000000-0000-0000-0000-00000000000a';
  if not found then
    raise exception 'La gestora no ha podido corregir un importe';
  end if;

  raise notice 'OK · la gestora ve y corrige todo';
end;
$$;

-- -----------------------------------------------------------------------------
-- 6 · Un autenticado sin perfil no ve nada
-- -----------------------------------------------------------------------------

set local request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';

do $$
declare n integer;
begin
  select count(*) into n from public.limpiezas;
  if n <> 0 then
    raise exception 'FALLO GRAVE: un usuario sin perfil ve % limpiezas', n;
  end if;

  select count(*) into n from public.viviendas;
  if n <> 0 then
    raise exception 'FALLO GRAVE: un usuario sin perfil ve % viviendas', n;
  end if;

  raise notice 'OK · un usuario sin perfil no ve nada';
end;
$$;

reset role;

rollback;

\echo ''
\echo '================================================'
\echo ' Todas las comprobaciones de RLS han pasado.'
\echo ' (La transacción se ha deshecho: nada persiste.)'
\echo '================================================'
