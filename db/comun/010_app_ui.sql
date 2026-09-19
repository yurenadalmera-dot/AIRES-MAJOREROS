-- =============================================================================
-- común · 010_app_ui.sql
--
-- Se aplica IGUAL en los dos proyectos (mirador-operativa y aires-operativa),
-- después de sus respectivos 001 y 002.
--
-- Guarda el HTML que sirve el panel de cada cliente, con histórico y vuelta
-- atrás en caliente.
--
-- Importante, y es la corrección que pedía el briefing respecto a Araya:
-- **el fuente vive en el repositorio Git, no aquí**. Esta tabla es el
-- resultado de un despliegue, no el sitio donde se edita. Quien edite el HTML
-- directamente en Postgres está creando una versión que el repo desconoce y
-- que el siguiente despliegue se llevará por delante.
--
-- El histórico existe para una cosa concreta: que un despliegue malo se pueda
-- deshacer en segundos, sin esperar a un rebuild, mientras se arregla el fallo
-- en el repo con calma.
-- =============================================================================

create table if not exists public.app_ui (
  -- Una fila por panel. Con 'principal' basta hoy; el slug deja sitio a
  -- futuras vistas (p.ej. 'portal-propietario') sin cambiar el modelo.
  slug            text primary key,
  html            text not null,

  -- De dónde salió este HTML. Sin esto, dentro de seis meses nadie sabe qué
  -- commit corresponde a lo que está publicado.
  commit_sha      text,
  desplegado_por  text,
  desplegado_en   timestamptz not null default now(),
  notas           text
);

comment on table public.app_ui is
  'HTML publicado del panel. Resultado de un despliegue desde el repo, nunca el original editable.';
comment on column public.app_ui.commit_sha is
  'Commit del repositorio que generó este HTML. Lo rellena el workflow de despliegue.';

create table if not exists public.app_ui_versiones (
  id              bigserial primary key,
  slug            text not null,
  html            text not null,
  commit_sha      text,
  desplegado_por  text,
  desplegado_en   timestamptz not null,
  archivado_en    timestamptz not null default now(),
  notas           text
);

comment on table public.app_ui_versiones is
  'Versiones anteriores de app_ui. Se llenan solas por trigger para poder volver atrás en caliente.';

create index if not exists app_ui_versiones_slug_idx
  on public.app_ui_versiones (slug, archivado_en desc);

-- -----------------------------------------------------------------------------
-- El trigger que hace el histórico
--
-- Archiva la versión SALIENTE antes de pisarla. Se salta los updates que no
-- cambian el HTML (corregir una nota no es un despliegue) para que el
-- histórico no se llene de ruido.
-- -----------------------------------------------------------------------------

create or replace function app.archivar_version_app_ui()
returns trigger
language plpgsql
as $$
begin
  if new.html is distinct from old.html then
    insert into public.app_ui_versiones
      (slug, html, commit_sha, desplegado_por, desplegado_en, notas)
    values
      (old.slug, old.html, old.commit_sha, old.desplegado_por, old.desplegado_en, old.notas);
  end if;
  return new;
end;
$$;

drop trigger if exists app_ui_archivar_version on public.app_ui;

create trigger app_ui_archivar_version
  before update on public.app_ui
  for each row execute function app.archivar_version_app_ui();

-- -----------------------------------------------------------------------------
-- Deshacer en caliente
--
--   select app.revertir_app_ui('principal');       -- a la versión anterior
--   select app.revertir_app_ui('principal', 42);   -- a una concreta
--
-- Revertir es a su vez un cambio de `html`, así que el trigger archiva la
-- versión mala antes de quitarla: se puede deshacer el deshacer.
-- -----------------------------------------------------------------------------

create or replace function app.revertir_app_ui(
  p_slug      text,
  p_version_id bigint default null
)
returns bigint
language plpgsql
as $$
declare
  v record;
begin
  if p_version_id is null then
    select * into v
    from public.app_ui_versiones
    where slug = p_slug
    order by archivado_en desc, id desc
    limit 1;
  else
    select * into v
    from public.app_ui_versiones
    where id = p_version_id and slug = p_slug;
  end if;

  if v is null then
    raise exception 'No hay versión anterior de "%" a la que volver', p_slug;
  end if;

  update public.app_ui
     set html = v.html,
         commit_sha = v.commit_sha,
         desplegado_por = coalesce(current_setting('request.jwt.claim.email', true), 'revertir_app_ui'),
         desplegado_en = now(),
         notas = format('Revertido a la versión %s (desplegada el %s)', v.id, v.desplegado_en)
   where slug = p_slug;

  if not found then
    raise exception 'No existe el panel "%"', p_slug;
  end if;

  return v.id;
end;
$$;

comment on function app.revertir_app_ui is
  'Vuelve el panel a una versión anterior. Sin id, a la inmediatamente anterior. Archiva la versión que retira.';

-- -----------------------------------------------------------------------------
-- Acceso
--
-- Lectura: los autenticados con perfil de gestión, para poder previsualizar y
-- revertir desde el propio panel.
-- Escritura: nadie por esta vía. Escribe el workflow de despliegue con
-- `service_role`, que salta RLS. Es la misma decisión que con las limpiezas
-- replicadas: si algo tiene una única fuente legítima, se cierra el resto.
-- -----------------------------------------------------------------------------

alter table public.app_ui            enable row level security;
alter table public.app_ui_versiones  enable row level security;

grant select on public.app_ui, public.app_ui_versiones to authenticated;

drop policy if exists app_ui_gestor_select on public.app_ui;
create policy app_ui_gestor_select on public.app_ui
  for select to authenticated
  using (app.es_gestor());

drop policy if exists app_ui_versiones_gestor_select on public.app_ui_versiones;
create policy app_ui_versiones_gestor_select on public.app_ui_versiones
  for select to authenticated
  using (app.es_gestor());

-- Revertir sí puede hacerlo la gestión desde el panel: es la operación de
-- emergencia para la que existe el histórico. La función corre con los
-- permisos de quien la llama, así que necesita su propio GRANT.
grant execute on function app.revertir_app_ui(text, bigint) to authenticated;

-- Pero para que la gestión pueda revertir, el UPDATE tiene que estar
-- permitido: se concede acotado a `app_ui` y solo al rol gestor.
grant update on public.app_ui to authenticated;

drop policy if exists app_ui_gestor_update on public.app_ui;
create policy app_ui_gestor_update on public.app_ui
  for update to authenticated
  using (app.es_gestor())
  with check (app.es_gestor());
