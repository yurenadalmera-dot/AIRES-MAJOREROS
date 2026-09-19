# Fase 0 — estado y preguntas abiertas

Referencia: briefing de Fase 0 · Mirador de Sotavento + Aires Majoreros,
12/09/2026.

## Qué hay hecho en este repositorio

| Punto del briefing | Estado |
|---|---|
| 1 · Repo único con base común + config por cliente | Hecho: `clientes/*.json` y `db/comun/010_app_ui.sql` |
| 2 · `mirador-operativa` con `001_schema` y `002_policies` | Hecho, y probado contra Postgres 16 |
| 3 · RLS correcta desde el primer día, filtro por propietario | Hecho, con tests que lo demuestran |
| 4 · Proyecto de pruebas + ruta n8n `/staging/…` | **No hecho**: requiere el VPS |

Además de lo pedido se ha escrito el esquema de `aires-operativa`: sin él no
se pueden cumplir las reglas de negocio de la sección 6 del briefing (motor de
tarifas y facturación al propietario son de Aires), ni tiene sentido el puente
entre las dos bases.

### Verificado, no solo escrito

Todo se ha aplicado sobre un Postgres 16 real con el esquema `auth` y los roles
de Supabase simulados. Los tests se ejecutan con `ROLLBACK`, así que no dejan
rastro y se pueden lanzar en cualquier entorno.

Lo que comprueban:

- Un propietario ve **una** vivienda (la suya), una reserva, un movimiento, y
  ni un solo registro del vecino.
- Un propietario **no ve los borradores** de sus propias liquidaciones.
- Un propietario no puede escribir nada.
- Una empleada ve su limpieza y la vivienda donde trabaja; no ve clientes,
  tarifas ni facturas; puede avanzar el estado pero **no** cambiar el importe,
  la facturabilidad ni adjudicarse el trabajo de otra.
- Un usuario autenticado **sin perfil no ve absolutamente nada**.
- Nadie, gestora incluida, puede escribir en `limpiezas_replicadas`.
- El motor de tarifas: 60 € con 2 huéspedes, 80 € con 4, 40 € el repaso; una
  tarifa plana no se mueve aunque lleguen 8 huéspedes; la lista del cliente
  gana a la general; el precio cerrado gana a todo e ignora los huéspedes; y
  **sin tarifa vigente falla en vez de devolver 0 €**.
- `app_ui`: versiona al desplegar, revierte en caliente, y un update que no
  cambia el HTML no ensucia el histórico.

## Lo que falta y por qué

**El despliegue en el VPS no se ha tocado.** Instalar Supabase autoalojado,
crear los proyectos y montar la ruta `/staging/…` de n8n necesita ejecutar
comandos en 72.61.177.131, y desde esta sesión solo hay acceso a la API de
gestión de Hostinger, no al servidor. Eso lo tiene que hacer la sesión de
Claude Code que corre en el VPS.

Lo que sí puede hacer con lo que hay aquí: aplicar los ficheros en orden,
lanzar los tests, y si alguno falla, parar.

## Resueltas el 19/09/2026

### Academia: 600 € fijos

Emma cobra **600 € desde el mes anterior**. Los 400 y 500 € del briefing son
histórico que se quedó en los Excel, y no se van a rehacer liquidaciones
pasadas: la operativa arranca ahora.

Cargado como un único tramo que cubre cualquier importe, así que la magnitud
sobre la que escalaba deja de importar. Se ha mantenido el tipo
`fijo_escalonado` en lugar de inventar uno nuevo: si algún día vuelve a
escalonarse, basta con añadir tramos a la misma regla.

### Inversiones Brito: 50 € y 30 €, precio plano

Se queda en **50 € la salida y 30 € el repaso, sin suplemento por huésped**.
Técnicamente es `importe_huesped_extra = 0`, así que el motor multiplica los
huéspedes de más por cero y siempre sale lo mismo.

Si más adelante resulta que Brito sí paga suplemento, se corrige rellenando
`huespedes_incluidos` e `importe_huesped_extra` en su lista: el motor ya lo
soporta y no hay que tocar el esquema. El test `998_test_tarifas.sql` cubre
los dos comportamientos, plano y con suplemento.

## Preguntas abiertas

### 1 · Villa Caliche y Villa Gregorio: ¿quién paga? (bloquea facturar)

Domingo Javier, 100 € cada una, marcadas como no facturables. Revisados los
dos excel de movimientos de Brito y Academia, no aparece ninguna partida.

En el esquema se han dejado como `facturable = false` para que no entren en
una factura por inercia. Se limpian, pero nadie las cobra.

**Para Emma.** Ya venía del briefing sin resolver.

### 2 · «Villa Monikka» y «Villa Mónica»: ¿son la misma?

El briefing las nombra en contextos distintos:

- **Villa Monikka** — grupo de liquidación, 10 % sobre ventas (Mirador).
- **Villa Mónica** — precio cerrado de limpieza 120 €, 15 plazas (Aires).

Dos grafías que podrían ser la misma vivienda o dos distintas. Se han tratado
como entidades separadas, que es lo reversible: si resultan ser la misma, se
unifica; si se hubieran fusionado por error, separarlas después es peor.

**Para Emma o Yurena.** Rápida de responder y conviene cerrarla antes de
migrar.

### 3 · Villa Mónica: margen sin verificar

120 € fijos con 15 plazas. Faltan horas reales y personal para saber si el
precio cubre el coste. No bloquea nada técnico, pero puede estar perdiendo
dinero en cada servicio.

**Para Emma.**

### 4 · Repaso: ¿lleva extra por huésped?

Se ha modelado como importe único (40 € oficial, 30 € Brito), sin extra. El
briefing no dice lo contrario, pero tampoco lo confirma.

Si llevara extra, es un cambio de datos, no de esquema: la estructura ya lo
soporta.

### 5 · Marca: colores, logos y pies legales

`clientes/*.json` lleva colores neutros provisionales y los pies legales de
facturas e informes marcados como `PENDIENTE`. Una factura sin los datos
registrales de la S.L. no es válida.

**Para Yurena.**

## Avisos para la migración desde Airtable

Recogidos del briefing, para que no se pierdan cuando toque migrar:

- **`Apto 103` (`recglPyQOohq2kwLf`) no existe.** Es un registro erróneo: **no
  migrar como vivienda**. Tiene colgadas una reserva real (Thomas Mörschel) y
  una limpieza sin nombre (`rec69lZ8Y0849rtl4`); la reserva hay que reasignarla
  al apartamento correcto, pendiente de que lo confirme Emma.
- **17 viviendas en Airtable, 11 en la web.** La web está desactualizada; no
  son seis viviendas sin publicar. La columna `viviendas.publicada` recoge esa
  distinción.
- Todas las tablas llevan `airtable_id` con restricción `unique`, para que una
  reimportación actualice en lugar de duplicar.

## Regla de apagado de Airtable

Del briefing, y conviene tenerla a la vista: **ninguna tabla de Airtable se
apaga hasta que su módulo lleve un mes cerrando bien en Postgres.** Nunca
trabajar el mismo dato en los dos sitios a la vez.

Los seis workflows de n8n que hoy corren sobre Airtable (sondeo de Lodgify,
generar y facturar limpiezas, previsión mensual, informe semanal, endpoint de
disponibilidad) **no se tocan en Fase 0**: migrarlos implica reescribirlos, no
mover filas.

## Sobre el repositorio

Este repo contenía una aplicación Next.js desplegada en el hosting Node de
Hostinger, sobre Supabase cloud. Esa línea **queda congelada** por la decisión
del 05/09/2026 que recoge el briefing: nada de Next.js en Hostinger, nada de
Supabase cloud.

Lo de Fase 0 vive en `db/`, `clientes/` y `docs/`, sin relación con el código
de esa app. Se ha dejado en su sitio en lugar de borrarlo porque la decisión de
qué hacer con ella no es técnica.

Dos cosas que costaron tiempo de averiguar y conviene no repetir:

1. El hosting Node de Hostinger rompe el build si se define `NODE_ENV=production`
   en sus variables de entorno: `npm install` omite las `devDependencies` y
   Next.js deja de resolver los alias de `tsconfig.json`.
2. El pooler de Supabase (Supavisor, también en la versión autoalojada) enruta
   por el nombre de usuario, que debe llevar el identificador del proyecto:
   `usuario.<project_ref>`. Sin ese sufijo la conexión se rechaza **sin dejar
   rastro en los logs**, que es lo que la hace difícil de diagnosticar.
