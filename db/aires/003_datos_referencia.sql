-- =============================================================================
-- aires-operativa · 003_datos_referencia.sql
--
-- Carga la configuración de tarifas que el briefing de Fase 0 da por buena.
-- NO carga datos operativos (viviendas, limpiezas, clientes): eso llega en la
-- migración desde Airtable, que es otra fase.
--
-- Es idempotente: se puede volver a ejecutar sin duplicar nada.
--
-- Lo que aquí se carga está confirmado. Lo que no lo está aparece como aviso
-- al ejecutar y en docs/fase-0.md, y se deja sin cargar a propósito: una
-- tarifa inventada se convierte en una factura mal hecha.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Lista por defecto · «Oficial 2026»
--
-- Del briefing, literal: 60 € hasta 2 huéspedes, +10 €/huésped extra,
-- repaso 40 €. Sin IGIC.
-- -----------------------------------------------------------------------------

insert into public.listas_precio (nombre, cliente_facturacion_id, vigente_desde, notas)
select
  'Oficial 2026',
  null,
  date '2026-01-01',
  'Tarifa general. Se aplica a todo cliente que no tenga lista propia.'
where not exists (
  select 1 from public.listas_precio
  where nombre = 'Oficial 2026' and cliente_facturacion_id is null
);

insert into public.listas_precio_lineas
  (lista_id, tipo_servicio, importe_base, huespedes_incluidos, importe_huesped_extra, notas)
select l.id, 'salida', 60.00, 2, 10.00, 'Confirmado en el briefing de Fase 0.'
from public.listas_precio l
where l.nombre = 'Oficial 2026' and l.cliente_facturacion_id is null
  and not exists (
    select 1 from public.listas_precio_lineas x
    where x.lista_id = l.id and x.tipo_servicio = 'salida'
  );

insert into public.listas_precio_lineas
  (lista_id, tipo_servicio, importe_base, huespedes_incluidos, importe_huesped_extra, notas)
select l.id, 'repaso', 40.00, 0, 0.00,
       'Repaso: importe único, sin extra por huésped (no consta lo contrario).'
from public.listas_precio l
where l.nombre = 'Oficial 2026' and l.cliente_facturacion_id is null
  and not exists (
    select 1 from public.listas_precio_lineas x
    where x.lista_id = l.id and x.tipo_servicio = 'repaso'
  );

-- -----------------------------------------------------------------------------
-- Lista de Inversiones Brito · 50 € la salida, 30 € el repaso
--
-- Solo se crea si el cliente ya existe (viene de la migración de Airtable).
--
-- Yurena confirmó el 19/09/2026: se deja en 50 € y 30 €, **sin extra por
-- huésped**. Es decir, precio plano: 2 huéspedes o 6, la salida son 50 €.
-- Si resultara que Brito sí paga suplemento por huésped, se corrige poniendo
-- `huespedes_incluidos` e `importe_huesped_extra` en esta lista; el motor ya
-- lo soporta y no hay que tocar el esquema.
-- -----------------------------------------------------------------------------

do $$
declare
  v_cliente_id uuid;
  v_lista_id   uuid;
begin
  select id into v_cliente_id
  from public.clientes_facturacion
  where nombre ilike '%brito%'
  limit 1;

  if v_cliente_id is null then
    raise notice
      'Inversiones Brito no está todavía en clientes_facturacion: su lista de precios no se ha creado. Volver a ejecutar este fichero tras migrar los clientes.';
    return;
  end if;

  select id into v_lista_id
  from public.listas_precio
  where cliente_facturacion_id = v_cliente_id and nombre = 'Inversiones Brito 2026';

  if v_lista_id is null then
    insert into public.listas_precio
      (nombre, cliente_facturacion_id, vigente_desde, notas)
    values (
      'Inversiones Brito 2026',
      v_cliente_id,
      date '2026-01-01',
      'Precio plano confirmado el 19/09/2026: 50 € la salida y 30 € el repaso, sin suplemento por huésped.'
    )
    returning id into v_lista_id;
  end if;

  -- `importe_huesped_extra` a 0 es lo que hace el precio plano: el motor
  -- multiplica los huéspedes de más por 0 y siempre salen 50 €.
  insert into public.listas_precio_lineas
    (lista_id, tipo_servicio, importe_base, huespedes_incluidos, importe_huesped_extra, notas)
  select v_lista_id, 'salida', 50.00, 0, 0.00,
         'Precio plano: 50 € con independencia del nº de huéspedes.'
  where not exists (
    select 1 from public.listas_precio_lineas
    where lista_id = v_lista_id and tipo_servicio = 'salida'
  );

  insert into public.listas_precio_lineas
    (lista_id, tipo_servicio, importe_base, huespedes_incluidos, importe_huesped_extra, notas)
  select v_lista_id, 'repaso', 30.00, 0, 0.00, 'Precio plano.'
  where not exists (
    select 1 from public.listas_precio_lineas
    where lista_id = v_lista_id and tipo_servicio = 'repaso'
  );

  raise notice 'Lista de Inversiones Brito cargada: 50 € salida / 30 € repaso, precio plano.';
end;
$$;

-- -----------------------------------------------------------------------------
-- Precios cerrados por vivienda
--
-- Villa Mónica 120 €; Villa Caliche y Villa Gregorio 100 € cada una.
-- Solo se cargan para las viviendas que ya existan: si la migración aún no ha
-- corrido, el fichero avisa en lugar de fallar.
-- -----------------------------------------------------------------------------

do $$
declare
  v record;
  v_creados integer := 0;
  v_faltan  text[] := '{}';
begin
  for v in
    select * from (values
      ('Villa Mónica',   120.00, 'Precio cerrado, 15 plazas. Margen sin verificar: faltan horas reales y personal (pendiente de Emma).'),
      ('Villa Caliche',  100.00, 'Precio cerrado. Vivienda marcada como NO facturable: falta saber quién paga (pendiente de Emma).'),
      ('Villa Gregorio', 100.00, 'Precio cerrado. Vivienda marcada como NO facturable: falta saber quién paga (pendiente de Emma).')
    ) as t(nombre, importe, nota)
  loop
    if exists (select 1 from public.viviendas where nombre = v.nombre) then
      insert into public.precios_cerrados
        (vivienda_id, tipo_servicio, importe, vigente_desde, notas)
      select viv.id, 'salida', v.importe, date '2026-01-01', v.nota
      from public.viviendas viv
      where viv.nombre = v.nombre
        and not exists (
          select 1 from public.precios_cerrados pc
          where pc.vivienda_id = viv.id and pc.tipo_servicio = 'salida'
        );
      v_creados := v_creados + 1;
    else
      v_faltan := v_faltan || v.nombre;
    end if;
  end loop;

  raise notice 'Precios cerrados procesados para % vivienda(s).', v_creados;

  if array_length(v_faltan, 1) > 0 then
    raise notice
      'Sin cargar (la vivienda aún no existe): %. Volver a ejecutar tras migrar las viviendas.',
      array_to_string(v_faltan, ', ');
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Comprobación rápida del motor de tarifas
--
-- No modifica nada: solo deja por escrito qué debería devolver, para poder
-- verificarlo a mano tras aplicar el esquema.
--
--   select * from app.calcular_precio_limpieza(<id_vivienda>, '2026-03-15', 4);
--
-- Con la tarifa oficial y 4 huéspedes: 60 + (2 × 10) = 80 €, sin IGIC.
-- Con una vivienda que tenga precio cerrado: ese importe, ignorando huéspedes.
-- Con una fecha anterior a 2026-01-01: excepción, porque no hay tarifa vigente.
-- -----------------------------------------------------------------------------
