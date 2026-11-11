-- SOLO LECTURA. Ejecutar con un rol autorizado. Cero filas bajo RLS no prueba integridad.
-- 1. Composición efectivamente desplegada (no asumir que coincide con el archivo DDL).
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name IN ('ordenes','orden_detalles','pagos','caja_sesiones','perfiles')
ORDER BY table_name, ordinal_position;

-- 2. Conciliación sin multiplicar pagos al hacer JOIN con múltiples líneas.
WITH detalles AS (
  SELECT orden_id, count(*) AS lineas, sum(cantidad * precio_unitario) AS subtotal_lineas
  FROM public.orden_detalles GROUP BY orden_id
), cobros AS (
  SELECT orden_id, count(*) AS pagos, sum(monto) AS cobrado,
    count(DISTINCT metodo) AS metodos, min(metodo::text) AS metodo_unico
  FROM public.pagos GROUP BY orden_id
)
SELECT o.id, o.numero_orden, o.usuario_id, o.caja_sesion_id, o.pagado, o.metodo_pago,
  o.subtotal, o.total, coalesce(d.lineas,0) AS lineas,
  d.subtotal_lineas, coalesce(p.cobrado,0) AS cobrado,
  coalesce(d.lineas,0)=0 AS faltan_detalles,
  o.subtotal IS DISTINCT FROM d.subtotal_lineas AS subtotal_inconsistente,
  (o.pagado IS TRUE AND coalesce(p.cobrado,0)<>o.total) AS pago_incompleto,
  (o.pagado IS FALSE AND coalesce(p.cobrado,0)>0) AS pendiente_con_pagos,
  (p.metodos=1 AND o.metodo_pago::text<>'mixto' AND o.metodo_pago::text IS DISTINCT FROM p.metodo_unico) AS metodo_inconsistente,
  o.usuario_id IS NULL AS falta_vendedor, o.caja_sesion_id IS NULL AS falta_caja
FROM public.ordenes o LEFT JOIN detalles d ON d.orden_id=o.id LEFT JOIN cobros p ON p.orden_id=o.id
WHERE o.deleted_at IS NULL AND (
  coalesce(d.lineas,0)=0 OR o.subtotal IS DISTINCT FROM d.subtotal_lineas
  OR (o.pagado IS TRUE AND coalesce(p.cobrado,0)<>o.total)
  OR (o.pagado IS FALSE AND coalesce(p.cobrado,0)>0)
  OR (p.metodos=1 AND o.metodo_pago::text<>'mixto' AND o.metodo_pago::text IS DISTINCT FROM p.metodo_unico)
  OR o.usuario_id IS NULL OR o.caja_sesion_id IS NULL
);

-- 3. Restricciones nuevas deben partir de datos conciliados.
SELECT usuario_id, count(*) AS cajas_abiertas FROM public.caja_sesiones
WHERE estado='abierta' AND deleted_at IS NULL GROUP BY usuario_id HAVING count(*)>1;
SELECT id, orden_id FROM public.pagos WHERE orden_id IS NULL;
SELECT id, orden_id, producto_id FROM public.orden_detalles WHERE orden_id IS NULL OR producto_id IS NULL;

-- 4. Revisar policies existentes: una permisiva adicional puede ampliar acceso por OR.
SELECT tablename, policyname, roles, cmd, qual, with_check FROM pg_policies
WHERE schemaname='public' AND tablename IN ('caja_sesiones','ordenes','orden_detalles','pagos')
ORDER BY tablename, policyname;
