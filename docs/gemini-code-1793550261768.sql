DO $$
DECLARE
    v_cat_alitas UUID;
    v_cat_bebidas UUID;
    v_cat_extras UUID;
    v_inv_alitas UUID;
    v_inv_papas UUID;
    v_inv_coca UUID;
    v_inv_cajas UUID;
    v_prod_alitas6 UUID;
    v_prod_papas UUID;
    v_prod_coca UUID;
BEGIN
    INSERT INTO categorias (nombre, orden) VALUES ('Alitas', 1) RETURNING id INTO v_cat_alitas;
    INSERT INTO categorias (nombre, orden) VALUES ('Bebidas', 2) RETURNING id INTO v_cat_bebidas;
    INSERT INTO categorias (nombre, orden) VALUES ('Acompañamientos', 3) RETURNING id INTO v_cat_extras;

    INSERT INTO inventario (nombre, unidad_medida, costo_unitario, existencia, stock_minimo) 
    VALUES ('Alitas Crudas', 'lb', 65.00, 100.00, 20.00) RETURNING id INTO v_inv_alitas;
    
    INSERT INTO inventario (nombre, unidad_medida, costo_unitario, existencia, stock_minimo) 
    VALUES ('Papas Fritas Congeladas', 'lb', 45.00, 50.00, 10.00) RETURNING id INTO v_inv_papas;
    
    INSERT INTO inventario (nombre, unidad_medida, costo_unitario, existencia, stock_minimo) 
    VALUES ('Coca Cola Normal', 'und', 25.00, 48.00, 12.00) RETURNING id INTO v_inv_coca;
    
    INSERT INTO inventario (nombre, unidad_medida, costo_unitario, existencia, stock_minimo) 
    VALUES ('Cajas de Empaque (Logo)', 'und', 15.00, 500.00, 50.00) RETURNING id INTO v_inv_cajas;

    INSERT INTO productos (codigo, categoria_id, nombre, precio, costo_estimado) 
    VALUES ('ALI-006', v_cat_alitas, '6 Alitas Clásicas', 350.00, 145.00) RETURNING id INTO v_prod_alitas6;
    
    INSERT INTO productos (codigo, categoria_id, nombre, precio, costo_estimado) 
    VALUES ('EXT-PAP', v_cat_extras, 'Porción de Papas', 150.00, 60.00) RETURNING id INTO v_prod_papas;
    
    INSERT INTO productos (codigo, categoria_id, nombre, precio, costo_estimado) 
    VALUES ('BEB-COC', v_cat_bebidas, 'Coca Cola', 80.00, 25.00) RETURNING id INTO v_prod_coca;

    INSERT INTO recetas (producto_id, inventario_id, cantidad_requerida) VALUES (v_prod_alitas6, v_inv_alitas, 1.00);
    INSERT INTO recetas (producto_id, inventario_id, cantidad_requerida) VALUES (v_prod_alitas6, v_inv_cajas, 1.00);
    INSERT INTO recetas (producto_id, inventario_id, cantidad_requerida) VALUES (v_prod_papas, v_inv_papas, 0.50);
    INSERT INTO recetas (producto_id, inventario_id, cantidad_requerida) VALUES (v_prod_coca, v_inv_coca, 1.00);
END $$;