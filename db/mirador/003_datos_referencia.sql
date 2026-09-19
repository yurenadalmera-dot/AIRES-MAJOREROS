-- =============================================================================
-- mirador-operativa · 003_datos_referencia.sql
--
-- Carga los grupos de liquidación y sus fórmulas, que son configuración.
-- NO carga datos operativos (propietarios, viviendas, reservas): eso llega en
-- la migración desde Airtable.
--
-- Idempotente: se puede volver a ejecutar sin duplicar.
--
-- Las tres fórmulas del briefing:
--   · Villa Monikka → 10 % sobre ventas
--   · Grupo Chano   → 30 % sobre beneficio (ventas − gastos)
--   · Academia      → importe fijo escalonado: 400 → 500 → 600 €
--
-- Sobre Academia: el briefing hablaba de 400 → 500 → 600 € escalonados, pero
-- Yurena confirmó el 19/09/2026 que **hoy se cobran 600 € fijos** y que el
-- escalonado pertenece al histórico que quedó en los Excel. Como la operativa
-- arranca ahora y no se van a rehacer liquidaciones anteriores, se carga un
-- único tramo de 600 € que cubre cualquier importe.
--
-- Se mantiene como `fijo_escalonado` con un solo tramo en lugar de inventar un
-- tipo nuevo: si algún día vuelve a escalonarse, basta con añadir tramos.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Grupos
-- -----------------------------------------------------------------------------

insert into public.grupos_liquidacion (nombre, descripcion)
values
  ('Villa Monikka', 'Liquidación por porcentaje sobre ventas.'),
  ('Grupo Chano',   'Liquidación por porcentaje sobre beneficio (ventas − gastos).'),
  ('Academia',      'Liquidación por importe fijo escalonado.')
on conflict (nombre) do nothing;

-- -----------------------------------------------------------------------------
-- Villa Monikka · 10 % sobre ventas
-- -----------------------------------------------------------------------------

insert into public.reglas_liquidacion
  (grupo_liquidacion_id, tipo, porcentaje, vigente_desde, notas)
select g.id, 'porcentaje_ventas', 10.00, date '2026-01-01',
       'Confirmado en el briefing de Fase 0.'
from public.grupos_liquidacion g
where g.nombre = 'Villa Monikka'
  and not exists (
    select 1 from public.reglas_liquidacion r where r.grupo_liquidacion_id = g.id
  );

-- -----------------------------------------------------------------------------
-- Grupo Chano · 30 % sobre beneficio
--
-- «Beneficio» = ventas − gastos. Qué gastos entran lo decide
-- `movimientos.liquidable`: un gasto no liquidable queda fuera de la base.
-- -----------------------------------------------------------------------------

insert into public.reglas_liquidacion
  (grupo_liquidacion_id, tipo, porcentaje, vigente_desde, notas)
select g.id, 'porcentaje_beneficio', 30.00, date '2026-01-01',
       'Confirmado en el briefing. La base es ventas − gastos liquidables del periodo.'
from public.grupos_liquidacion g
where g.nombre = 'Grupo Chano'
  and not exists (
    select 1 from public.reglas_liquidacion r where r.grupo_liquidacion_id = g.id
  );

-- -----------------------------------------------------------------------------
-- Academia · 600 € fijos
--
-- Confirmado por Yurena el 19/09/2026: Emma cobra 600 € desde el mes anterior.
-- Los 400 y 500 € del briefing son histórico que se quedó en los Excel, y no
-- se van a rehacer liquidaciones pasadas.
-- -----------------------------------------------------------------------------

insert into public.reglas_liquidacion
  (grupo_liquidacion_id, tipo, base_escalon, vigente_desde, notas)
select g.id, 'fijo_escalonado',
       'importe único: no escala',
       date '2026-01-01',
       'Importe fijo de 600 €, confirmado el 19/09/2026. El 400 → 500 → 600 € del briefing es histórico anterior, que vivía en los Excel y no se migra. Si volviera a escalonarse, se añaden tramos a esta misma regla.'
from public.grupos_liquidacion g
where g.nombre = 'Academia'
  and not exists (
    select 1 from public.reglas_liquidacion r where r.grupo_liquidacion_id = g.id
  );

-- Un único tramo que cubre cualquier importe: sea cual sea la magnitud, salen
-- 600 €. `hasta_valor` nulo = sin límite superior.
insert into public.reglas_liquidacion_tramos
  (regla_id, desde_valor, hasta_valor, importe, orden)
select r.id, 0, null, 600.00, 1
from public.reglas_liquidacion r
join public.grupos_liquidacion g on g.id = r.grupo_liquidacion_id
where g.nombre = 'Academia'
  and not exists (
    select 1 from public.reglas_liquidacion_tramos t where t.regla_id = r.id
  );

do $$
declare v_importe numeric;
begin
  select t.importe into v_importe
  from public.reglas_liquidacion_tramos t
  join public.reglas_liquidacion r on r.id = t.regla_id
  join public.grupos_liquidacion g on g.id = r.grupo_liquidacion_id
  where g.nombre = 'Academia';

  if v_importe is null then
    raise exception 'La regla de Academia se ha quedado sin tramo: no podría liquidar.';
  end if;

  raise notice 'Academia: % € fijos por periodo.', v_importe;
end;
$$;
