-- 1. HABILITAR ROW LEVEL SECURITY (RLS)
ALTER TABLE perfiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE proveedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE recetas ENABLE ROW LEVEL SECURITY;
ALTER TABLE caja_sesiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_caja ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE orden_detalles ENABLE ROW LEVEL SECURITY;
ALTER TABLE cocina_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario_movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE registro_auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE gastos ENABLE ROW LEVEL SECURITY;

-- 2. POLÍTICAS BASE (Lectura para el sistema interno)
CREATE POLICY "Lectura pública auth" ON productos FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Lectura perfiles" ON perfiles FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Lectura caja dueño y cajero" ON caja_sesiones FOR SELECT USING (usuario_id = auth.uid() OR EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol = 'admin'));

-- 3. VISTAS SEGURAS
CREATE VIEW v_productos_pos AS 
SELECT id, codigo, categoria_id, nombre, descripcion, precio, tasa_itbis, imagen_url, activo, disponible 
FROM productos WHERE activo = true AND disponible = true;

CREATE VIEW v_inventario_cocina AS 
SELECT id, nombre, unidad_medida, existencia, activo 
FROM inventario WHERE activo = true;

CREATE VIEW v_articulos_bajo_stock AS 
SELECT id, nombre, unidad_medida, existencia, stock_minimo 
FROM inventario WHERE existencia <= stock_minimo AND activo = true;