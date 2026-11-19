-- SOLO fixture aislado. No es un alta de usuarios en Supabase Auth real.
DO $$ BEGIN
  IF current_setting('pollito.qa_fixture', true) IS DISTINCT FROM 'isolated-qa' THEN
    RAISE EXCEPTION 'Esta semilla requiere el harness aislado de QA.';
  END IF;
END $$;

INSERT INTO auth.users (id,email,raw_app_meta_data) VALUES
('00000000-0000-4000-8000-000000000001','admin@qa.invalid','{"role":"admin"}'::jsonb),
('00000000-0000-4000-8000-000000000002','cajero@qa.invalid','{"role":"cajero"}'::jsonb),
('00000000-0000-4000-8000-000000000003','cocina@qa.invalid','{"role":"cocina"}'::jsonb);
INSERT INTO perfiles (id,nombre,rol,activo) VALUES
('00000000-0000-4000-8000-000000000001','QA Admin','admin',true),
('00000000-0000-4000-8000-000000000002','QA Cajero','cajero',true),
('00000000-0000-4000-8000-000000000003','QA Cocina','cocinero',true)
ON CONFLICT (id) DO UPDATE SET
  nombre = EXCLUDED.nombre, rol = EXCLUDED.rol, activo = EXCLUDED.activo, deleted_at = NULL;
INSERT INTO categorias(id,nombre) VALUES ('40000000-0000-4000-8000-000000000001','QA Menú');
INSERT INTO proveedores(id,nombre_empresa) VALUES
('30000000-0000-4000-8000-000000000001','QA Alimentos'),
('30000000-0000-4000-8000-000000000002','QA Empaques');
INSERT INTO productos(id,codigo,categoria_id,nombre,precio,costo_estimado)
SELECT ('10000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
       'QA-'||lpad(i::text,3,'0'),'40000000-0000-4000-8000-000000000001',
       'QA Producto '||i,100,10
FROM generate_series(1,15) AS s(i);
INSERT INTO inventario(id,nombre,unidad_medida,costo_unitario,existencia,stock_minimo,proveedor_pref_id)
SELECT ('20000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
       'QA Insumo '||i,'und',5,10,2,'30000000-0000-4000-8000-000000000001'
FROM generate_series(1,20) AS s(i);
-- Tres productos con receta, dos ingredientes por receta.
INSERT INTO recetas(producto_id,inventario_id,cantidad_requerida)
SELECT ('10000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
       ('20000000-0000-4000-8000-'||lpad((i+j)::text,12,'0'))::uuid,1
FROM generate_series(1,3) AS a(i) CROSS JOIN (VALUES(0),(3)) AS b(j);
INSERT INTO inventario_movimientos(id,inventario_id,tipo,cantidad,unidad,
 existencia_anterior,existencia_resultante,usuario_id,motivo)
SELECT ('80000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
       ('20000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
       'entrada',10,'und',0,10,'00000000-0000-4000-8000-000000000001','Saldo inicial QA'
FROM generate_series(1,20) AS s(i);
INSERT INTO caja_sesiones(id,usuario_id,monto_inicial) VALUES
('60000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',100),
('60000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002',100);
INSERT INTO ordenes(id,numero_orden,usuario_id,caja_sesion_id,subtotal,itbis,total,metodo_pago,estado) VALUES
('50000000-0000-4000-8000-000000000001',1001,'00000000-0000-4000-8000-000000000002',
 '60000000-0000-4000-8000-000000000002',100,18,118,'efectivo','entregada'),
('50000000-0000-4000-8000-000000000002',1002,'00000000-0000-4000-8000-000000000001',
 '60000000-0000-4000-8000-000000000001',200,36,236,'tarjeta','entregada');
INSERT INTO orden_detalles(orden_id,producto_id,nombre_snapshot,cantidad,precio_unitario,costo_unitario) VALUES
('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','QA Producto 1',1,100,10),
('50000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','QA Producto 2',2,100,10);
INSERT INTO pagos(orden_id,metodo,monto) VALUES
('50000000-0000-4000-8000-000000000001','efectivo',118),
('50000000-0000-4000-8000-000000000002','tarjeta',236);
