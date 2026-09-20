# Datos reales: lo confirmado y lo que falta

La aplicación todavía tiene los datos de demostración que sembró el primer arranque. Esto es lo
que hay confirmado para cargar los de verdad, para que no se pierda por el camino.

Se vacía lo de demostración desde **Alquileres → Ajustes → Datos de la aplicación**; después se
dan de alta propietarios y viviendas, o se sincroniza con Lodgify.

## Propietarios confirmados (Emma, 20/09/2026)

| Viviendas | Quién paga | Datos de facturación |
|---|---|---|
| Villa Caliche, Villa Gregorio | Domingo Javier | **Costa Calma Express Inmobiliaria S.L.** · CIF **B35709062** · con factura |
| Las dos Villas Mónicas | Inversiones Brito | pendiente de CIF y dirección |

Dos apuntes sobre esa tabla:

- **«Las dos Villas Mónicas» son dos viviendas distintas**, no una escrita de dos maneras. La duda
  venía de ver «Villa Monikka» y «Villa Mónica» en las listas y no saber si eran la misma casa.
- **Domingo Javier lleva factura**, así que su ficha necesita razón social y CIF, no solo el
  nombre. Los otros propietarios pueden no llevarla: conviene preguntarlo uno a uno antes de
  emitir nada.

## Lo que falta

- **CIF y dirección de Inversiones Brito**, si sus viviendas también se facturan.
- **El resto de propietarios**: quién paga cada vivienda y si lleva factura.
- **La clave de API de Lodgify** (pedida a Emma el 20/09). Se pega en Alquileres → Ajustes →
  Integración con Lodgify; se guarda cifrada y la sincronización empieza a traer reservas reales.
  Mientras no esté, «Sincronizar» se inventa las reservas para poder probar, y la propia pantalla
  lo avisa.
- **Precio de limpieza de cada vivienda**, que es lo que luego se factura.

## VeriFactu

Una factura emitida ya no se puede devolver a borrador: la ley no permite modificar ni anular una
factura emitida, solo rectificarla con otra. Eso está hecho.

El resto del reglamento —encadenado de huellas entre facturas, registro de eventos, código QR y
envío a la AEAT— es un trabajo aparte. Antes de hacerlo conviene que la asesoría confirme **qué os
aplica y desde cuándo**, porque depende del régimen fiscal de cada una de las dos empresas.
