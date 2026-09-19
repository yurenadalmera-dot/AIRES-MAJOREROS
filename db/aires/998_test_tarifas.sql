-- =============================================================================
-- aires-operativa · 998_test_tarifas.sql
--
-- Comprueba el motor de tarifas caso por caso. Es la pieza con más reglas del
-- dominio y la que más caro sale equivocar: un error aquí se convierte en una
-- factura mal emitida a un cliente real.
--
--   psql -d aires -v ON_ERROR_STOP=1 -f db/aires/998_test_tarifas.sql
--
-- Crea sus datos, comprueba y hace ROLLBACK: no deja rastro.
-- Terminar sin excepciones = todo correcto.
-- =============================================================================

\set ON_ERROR_STOP on

begin;

-- -----------------------------------------------------------------------------
-- Escenario
-- -----------------------------------------------------------------------------

insert into public.clientes_facturacion (id, nombre) values
  ('c1000000-0000-0000-0000-000000000001', 'Cliente sin lista propia'),
  ('c1000000-0000-0000-0000-000000000002', 'Inversiones Brito (prueba)');

insert into public.viviendas (id, nombre, cliente_facturacion_id) values
  ('da000000-0000-0000-0000-000000000001', 'Piso normal',
     'c1000000-0000-0000-0000-000000000001'),
  ('da000000-0000-0000-0000-000000000002', 'Piso de Brito',
     'c1000000-0000-0000-0000-000000000002'),
  ('da000000-0000-0000-0000-000000000003', 'Villa con precio cerrado',
     'c1000000-0000-0000-0000-000000000001');

-- Lista propia de Brito: base 50, repaso 30.
insert into public.listas_precio (id, nombre, cliente_facturacion_id, vigente_desde)
values ('11000000-0000-0000-0000-000000000001', 'Brito prueba',
        'c1000000-0000-0000-0000-000000000002', date '2026-01-01');

insert into public.listas_precio_lineas
  (lista_id, tipo_servicio, importe_base, huespedes_incluidos, importe_huesped_extra)
values
  ('11000000-0000-0000-0000-000000000001', 'salida', 50.00, 2, 10.00),
  ('11000000-0000-0000-0000-000000000001', 'repaso', 30.00, 0, 0.00);

-- Precio cerrado para la villa: 120 €, pase lo que pase con los huéspedes.
insert into public.precios_cerrados
  (vivienda_id, tipo_servicio, importe, vigente_desde)
values
  ('da000000-0000-0000-0000-000000000003', 'salida', 120.00, date '2026-01-01');

-- -----------------------------------------------------------------------------
-- Comprobaciones
-- -----------------------------------------------------------------------------

do $$
declare
  r record;
begin
  -- --- Tarifa oficial (lista por defecto, cargada por 003) -------------------

  -- 2 huéspedes: justo los incluidos, sin extra.
  select * into r from app.calcular_precio_limpieza(
    'da000000-0000-0000-0000-000000000001', date '2026-03-15', 2, 'salida');
  if r.importe <> 60.00 then
    raise exception 'Oficial, 2 huéspedes: % €, esperaba 60 €', r.importe;
  end if;

  -- 4 huéspedes: 60 + 2 extra × 10 = 80.
  select * into r from app.calcular_precio_limpieza(
    'da000000-0000-0000-0000-000000000001', date '2026-03-15', 4, 'salida');
  if r.importe <> 80.00 then
    raise exception 'Oficial, 4 huéspedes: % €, esperaba 80 €', r.importe;
  end if;

  -- 1 huésped: por debajo de los incluidos, el precio no baja.
  select * into r from app.calcular_precio_limpieza(
    'da000000-0000-0000-0000-000000000001', date '2026-03-15', 1, 'salida');
  if r.importe <> 60.00 then
    raise exception 'Oficial, 1 huésped: % €, esperaba 60 € (el precio no baja)', r.importe;
  end if;

  -- Repaso: importe único.
  select * into r from app.calcular_precio_limpieza(
    'da000000-0000-0000-0000-000000000001', date '2026-03-15', 6, 'repaso');
  if r.importe <> 40.00 then
    raise exception 'Oficial, repaso con 6 huéspedes: % €, esperaba 40 €', r.importe;
  end if;

  raise notice 'OK · tarifa oficial: 60 € hasta 2 huéspedes, +10 €/extra, repaso 40 €';

  -- --- Lista propia del cliente: gana sobre la de por defecto ---------------

  select * into r from app.calcular_precio_limpieza(
    'da000000-0000-0000-0000-000000000002', date '2026-03-15', 2, 'salida');
  if r.importe <> 50.00 then
    raise exception 'Brito, 2 huéspedes: % €, esperaba 50 € (su lista, no la oficial)', r.importe;
  end if;

  select * into r from app.calcular_precio_limpieza(
    'da000000-0000-0000-0000-000000000002', date '2026-03-15', 4, 'salida');
  if r.importe <> 70.00 then
    raise exception 'Brito, 4 huéspedes: % €, esperaba 70 €', r.importe;
  end if;

  select * into r from app.calcular_precio_limpieza(
    'da000000-0000-0000-0000-000000000002', date '2026-03-15', 3, 'repaso');
  if r.importe <> 30.00 then
    raise exception 'Brito, repaso: % €, esperaba 30 €', r.importe;
  end if;

  raise notice 'OK · la lista del cliente tiene prioridad sobre la de por defecto';

  -- --- Precio cerrado: gana sobre cualquier lista y no mira huéspedes -------

  select * into r from app.calcular_precio_limpieza(
    'da000000-0000-0000-0000-000000000003', date '2026-03-15', 2, 'salida');
  if r.importe <> 120.00 then
    raise exception 'Precio cerrado, 2 huéspedes: % €, esperaba 120 €', r.importe;
  end if;

  select * into r from app.calcular_precio_limpieza(
    'da000000-0000-0000-0000-000000000003', date '2026-03-15', 15, 'salida');
  if r.importe <> 120.00 then
    raise exception
      'Precio cerrado, 15 huéspedes: % €, esperaba 120 € (el cerrado ignora huéspedes)', r.importe;
  end if;

  if r.origen not like '%cerrado%' then
    raise exception 'El origen del cálculo debería mencionar el precio cerrado, y dice: %', r.origen;
  end if;

  raise notice 'OK · el precio cerrado manda y no depende del nº de huéspedes';

  -- --- Vigencia: una fecha anterior a la tarifa no debe calcular nada -------

  declare
    hubo_error boolean := false;
  begin
    begin
      select * into r from app.calcular_precio_limpieza(
        'da000000-0000-0000-0000-000000000001', date '2025-06-01', 2, 'salida');
    exception when others then
      hubo_error := true;
    end;

    if not hubo_error then
      raise exception
        'FALLO: con fecha anterior a cualquier tarifa vigente ha devuelto % € en vez de fallar', r.importe;
    end if;
  end;

  raise notice 'OK · sin tarifa vigente para esa fecha, el motor falla en vez de inventar un precio';

  -- --- La explicación del cálculo se puede enseñar al cliente ---------------

  select * into r from app.calcular_precio_limpieza(
    'da000000-0000-0000-0000-000000000001', date '2026-03-15', 4, 'salida');
  if r.origen is null or length(r.origen) < 10 then
    raise exception 'El motor no explica de dónde sale el precio: origen = %', r.origen;
  end if;

  raise notice 'OK · el motor explica el cálculo: "%"', r.origen;
end;
$$;

rollback;

\echo ''
\echo '================================================'
\echo ' Motor de tarifas: todas las comprobaciones OK.'
\echo '================================================'
