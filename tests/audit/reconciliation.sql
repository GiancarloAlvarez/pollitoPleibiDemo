-- Solo SELECT; ejecutar con visibilidad administrativa sobre un proyecto de PRUEBAS.
BEGIN TRANSACTION READ ONLY;

SELECT numero_orden,count(*) AS count FROM ordenes
GROUP BY numero_orden HAVING count(*)>1;

WITH details AS (
 SELECT orden_id,count(*) AS lines,sum(cantidad*precio_unitario) AS subtotal
 FROM orden_detalles GROUP BY orden_id
), payment AS (
 SELECT orden_id,sum(monto) AS total,
        sum(monto) FILTER(WHERE metodo='efectivo') AS cash
 FROM pagos GROUP BY orden_id
)
SELECT o.id,o.numero_orden,o.estado,o.pagado,o.metodo_pago,o.subtotal,
       d.subtotal AS detail_subtotal,coalesce(d.lines,0) AS lines,
       o.total,coalesce(p.total,0) AS paid_total
FROM ordenes o LEFT JOIN details d ON d.orden_id=o.id
LEFT JOIN payment p ON p.orden_id=o.id
WHERE o.deleted_at IS NULL AND (
 coalesce(d.lines,0)=0 OR o.subtotal IS DISTINCT FROM d.subtotal
 OR (o.pagado AND o.estado<>'anulada' AND o.total<>coalesce(p.total,0))
 OR (NOT o.pagado AND coalesce(p.total,0)>0)
 OR (o.metodo_pago='tarjeta' AND coalesce(p.cash,0)>0)
);

SELECT 'detalle sin orden' AS issue,count(*) AS count
FROM orden_detalles d LEFT JOIN ordenes o ON o.id=d.orden_id WHERE o.id IS NULL
UNION ALL SELECT 'pago sin orden',count(*)
FROM pagos p LEFT JOIN ordenes o ON o.id=p.orden_id WHERE o.id IS NULL
UNION ALL SELECT 'detalle compra sin compra',count(*)
FROM compra_detalles d LEFT JOIN compras c ON c.id=d.compra_id WHERE c.id IS NULL;

-- Requiere que cada saldo inicial esté representado por un movimiento.
WITH ledger AS (
 SELECT inventario_id,sum(existencia_resultante-existencia_anterior) AS net
 FROM inventario_movimientos WHERE deleted_at IS NULL GROUP BY inventario_id
)
SELECT i.id,i.nombre,i.existencia,coalesce(l.net,0) AS ledger_stock
FROM inventario i LEFT JOIN ledger l ON l.inventario_id=i.id
WHERE i.deleted_at IS NULL AND i.existencia<>coalesce(l.net,0);

SELECT o.caja_sesion_id,p.metodo,sum(p.monto) AS amount
FROM pagos p JOIN ordenes o ON o.id=p.orden_id
WHERE o.estado<>'anulada' AND o.deleted_at IS NULL
GROUP BY o.caja_sesion_id,p.metodo;
COMMIT;
