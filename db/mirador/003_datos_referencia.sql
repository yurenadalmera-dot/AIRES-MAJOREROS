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
-- Las dos primeras se cargan completas. La de Academia se crea SIN tramos,
-- porque el briefing da los importes pero no sobre qué magnitud escalan. Un
-- escalón inventado sale caro: se liquidaría de menos o de más a un
-- propietario real. Ver docs/fase-0.md.
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
-- Academia · fijo escalonado, sin tramos todavía
-- -----------------------------------------------------------------------------

insert into public.reglas_liquidacion
  (grupo_liquidacion_id, tipo, base_escalon, vigente_desde, notas)
select g.id, 'fijo_escalonado',
       'PENDIENTE DE CONFIRMAR',
       date '2026-01-01',
       'Importes conocidos: 400 → 500 → 600 €. Falta saber sobre qué magnitud escalan (¿ventas del periodo? ¿nº de reservas? ¿tramo temporal?). Los tramos se cargan cuando Emma lo confirme; hasta entonces esta regla NO puede liquidar.'
from public.grupos_liquidacion g
where g.nombre = 'Academia'
  and not exists (
    select 1 from public.reglas_liquidacion r where r.grupo_liquidacion_id = g.id
  );

do $$
begin
  if exists (
    select 1
    from public.reglas_liquidacion r
    join public.grupos_liquidacion g on g.id = r.grupo_liquidacion_id
    where g.nombre = 'Academia'
      and not exists (
        select 1 from public.reglas_liquidacion_tramos t where t.regla_id = r.id
      )
  ) then
    raise notice
      'Regla de Academia creada SIN tramos: no puede liquidar hasta que se confirme el criterio del escalón (400 → 500 → 600 €).';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Cuando se confirme el criterio, los tramos se cargan así (ejemplo con
-- ventas del periodo como magnitud). Dejar comentado hasta tener respuesta:
--
--   insert into public.reglas_liquidacion_tramos
--     (regla_id, desde_valor, hasta_valor, importe, orden)
--   select r.id, v.desde, v.hasta, v.importe, v.orden
--   from public.reglas_liquidacion r
--   join public.grupos_liquidacion g on g.id = r.grupo_liquidacion_id
--   cross join (values
--     (0,     5000,  400.00, 1),
--     (5000,  10000, 500.00, 2),
--     (10000, null,  600.00, 3)
--   ) as v(desde, hasta, importe, orden)
--   where g.nombre = 'Academia';
--
-- y actualizar `base_escalon` con la magnitud real.
-- -----------------------------------------------------------------------------
