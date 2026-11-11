# Inventario SQL — base aislada de auditoría

Generado ejecutando el DDL en PGlite; **no es introspección del Supabase desplegado**.
Adaptaciones y límites: [README de pruebas](../../tests/audit/README.md).

## Tablas y RLS (21)

| tabla | rls |
| --- | --- |
| caja_sesiones | true |
| categorias | true |
| cocina_tickets | true |
| compra_detalles | true |
| compras | true |
| configuracion | true |
| gastos | true |
| inventario | true |
| inventario_movimientos | true |
| movimientos_caja | true |
| orden_detalles | true |
| ordenes | true |
| pagos | true |
| perfiles | true |
| price_history | true |
| price_list_items | true |
| price_lists | true |
| productos | true |
| proveedores | true |
| recetas | true |
| registro_auditoria | true |

## Tipos enumerados (6)

| tipo | valores |
| --- | --- |
| canal_venta | Mostrador, Para llevar, Delivery |
| estado_orden | nueva, preparando, lista, entregada, anulada |
| metodo_pago | efectivo, tarjeta, transferencia, mixto |
| rol_usuario | admin, cajero, cocinero |
| tipo_movimiento_caja | entrada, retiro, gasto |
| tipo_movimiento_inv | entrada, consumo_venta, merma, desperdicio, ajuste, devolucion, consumo_interno |

## Relaciones FK (30)

| tabla | nombre | definicion |
| --- | --- | --- |
| caja_sesiones | caja_sesiones_usuario_id_fkey | FOREIGN KEY (usuario_id) REFERENCES perfiles(id) |
| cocina_tickets | cocina_tickets_orden_id_fkey | FOREIGN KEY (orden_id) REFERENCES ordenes(id) |
| compra_detalles | compra_detalles_compra_id_fkey | FOREIGN KEY (compra_id) REFERENCES compras(id) ON DELETE CASCADE |
| compra_detalles | compra_detalles_inventario_id_fkey | FOREIGN KEY (inventario_id) REFERENCES inventario(id) ON DELETE RESTRICT |
| compras | compras_proveedor_id_fkey | FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) |
| compras | compras_usuario_id_fkey | FOREIGN KEY (usuario_id) REFERENCES perfiles(id) |
| gastos | gastos_caja_sesion_id_fkey | FOREIGN KEY (caja_sesion_id) REFERENCES caja_sesiones(id) |
| gastos | gastos_usuario_id_fkey | FOREIGN KEY (usuario_id) REFERENCES perfiles(id) |
| inventario | inventario_proveedor_pref_id_fkey | FOREIGN KEY (proveedor_pref_id) REFERENCES proveedores(id) |
| inventario_movimientos | inventario_movimientos_inventario_id_fkey | FOREIGN KEY (inventario_id) REFERENCES inventario(id) |
| inventario_movimientos | inventario_movimientos_orden_id_fkey | FOREIGN KEY (orden_id) REFERENCES ordenes(id) |
| inventario_movimientos | inventario_movimientos_proveedor_id_fkey | FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) |
| inventario_movimientos | inventario_movimientos_usuario_id_fkey | FOREIGN KEY (usuario_id) REFERENCES perfiles(id) |
| movimientos_caja | movimientos_caja_caja_sesion_id_fkey | FOREIGN KEY (caja_sesion_id) REFERENCES caja_sesiones(id) ON DELETE CASCADE |
| movimientos_caja | movimientos_caja_usuario_id_fkey | FOREIGN KEY (usuario_id) REFERENCES perfiles(id) |
| orden_detalles | orden_detalles_orden_id_fkey | FOREIGN KEY (orden_id) REFERENCES ordenes(id) ON DELETE CASCADE |
| orden_detalles | orden_detalles_producto_id_fkey | FOREIGN KEY (producto_id) REFERENCES productos(id) |
| ordenes | ordenes_caja_sesion_id_fkey | FOREIGN KEY (caja_sesion_id) REFERENCES caja_sesiones(id) |
| ordenes | ordenes_usuario_id_fkey | FOREIGN KEY (usuario_id) REFERENCES perfiles(id) |
| pagos | pagos_orden_id_fkey | FOREIGN KEY (orden_id) REFERENCES ordenes(id) ON DELETE CASCADE |
| perfiles | perfiles_id_fkey | FOREIGN KEY (id) REFERENCES auth.users(id) |
| price_history | price_history_lista_id_fkey | FOREIGN KEY (lista_id) REFERENCES price_lists(id) |
| price_history | price_history_producto_id_fkey | FOREIGN KEY (producto_id) REFERENCES productos(id) |
| price_history | price_history_usuario_id_fkey | FOREIGN KEY (usuario_id) REFERENCES perfiles(id) |
| price_list_items | price_list_items_lista_id_fkey | FOREIGN KEY (lista_id) REFERENCES price_lists(id) ON DELETE CASCADE |
| price_list_items | price_list_items_producto_id_fkey | FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE |
| productos | productos_categoria_id_fkey | FOREIGN KEY (categoria_id) REFERENCES categorias(id) |
| recetas | recetas_inventario_id_fkey | FOREIGN KEY (inventario_id) REFERENCES inventario(id) ON DELETE RESTRICT |
| recetas | recetas_producto_id_fkey | FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE |
| registro_auditoria | registro_auditoria_usuario_id_fkey | FOREIGN KEY (usuario_id) REFERENCES perfiles(id) |

## Indices, incluidos PK y UNIQUE (45)

| tabla | nombre | definicion |
| --- | --- | --- |
| caja_sesiones | caja_sesiones_pkey | CREATE UNIQUE INDEX caja_sesiones_pkey ON public.caja_sesiones USING btree (id) |
| categorias | categorias_nombre_key | CREATE UNIQUE INDEX categorias_nombre_key ON public.categorias USING btree (nombre) |
| categorias | categorias_pkey | CREATE UNIQUE INDEX categorias_pkey ON public.categorias USING btree (id) |
| cocina_tickets | cocina_tickets_orden_id_key | CREATE UNIQUE INDEX cocina_tickets_orden_id_key ON public.cocina_tickets USING btree (orden_id) |
| cocina_tickets | cocina_tickets_pkey | CREATE UNIQUE INDEX cocina_tickets_pkey ON public.cocina_tickets USING btree (id) |
| compra_detalles | compra_detalles_pkey | CREATE UNIQUE INDEX compra_detalles_pkey ON public.compra_detalles USING btree (id) |
| compras | compras_pkey | CREATE UNIQUE INDEX compras_pkey ON public.compras USING btree (id) |
| compras | ix_compras_proveedor | CREATE INDEX ix_compras_proveedor ON public.compras USING btree (proveedor_id) |
| configuracion | configuracion_pkey | CREATE UNIQUE INDEX configuracion_pkey ON public.configuracion USING btree (key) |
| gastos | gastos_pkey | CREATE UNIQUE INDEX gastos_pkey ON public.gastos USING btree (id) |
| gastos | ix_gastos_fecha | CREATE INDEX ix_gastos_fecha ON public.gastos USING btree (fecha) |
| inventario | inventario_pkey | CREATE UNIQUE INDEX inventario_pkey ON public.inventario USING btree (id) |
| inventario | ix_sync_updated_at_inv | CREATE INDEX ix_sync_updated_at_inv ON public.inventario USING btree (updated_at) |
| inventario_movimientos | inventario_movimientos_pkey | CREATE UNIQUE INDEX inventario_movimientos_pkey ON public.inventario_movimientos USING btree (id) |
| inventario_movimientos | ix_inv_mov_insumo | CREATE INDEX ix_inv_mov_insumo ON public.inventario_movimientos USING btree (inventario_id) |
| inventario_movimientos | ix_inv_mov_orden | CREATE INDEX ix_inv_mov_orden ON public.inventario_movimientos USING btree (orden_id) |
| movimientos_caja | ix_mov_caja_sesion | CREATE INDEX ix_mov_caja_sesion ON public.movimientos_caja USING btree (caja_sesion_id) |
| movimientos_caja | movimientos_caja_pkey | CREATE UNIQUE INDEX movimientos_caja_pkey ON public.movimientos_caja USING btree (id) |
| orden_detalles | ix_orden_detalles | CREATE INDEX ix_orden_detalles ON public.orden_detalles USING btree (orden_id) |
| orden_detalles | ix_orden_detalles_prod | CREATE INDEX ix_orden_detalles_prod ON public.orden_detalles USING btree (producto_id) |
| orden_detalles | orden_detalles_pkey | CREATE UNIQUE INDEX orden_detalles_pkey ON public.orden_detalles USING btree (id) |
| ordenes | ix_ordenes_estado | CREATE INDEX ix_ordenes_estado ON public.ordenes USING btree (estado) |
| ordenes | ix_ordenes_fecha | CREATE INDEX ix_ordenes_fecha ON public.ordenes USING btree (fecha_creacion) |
| ordenes | ix_ordenes_sesion | CREATE INDEX ix_ordenes_sesion ON public.ordenes USING btree (caja_sesion_id) |
| ordenes | ix_sync_updated_at_ord | CREATE INDEX ix_sync_updated_at_ord ON public.ordenes USING btree (updated_at) |
| ordenes | ordenes_pkey | CREATE UNIQUE INDEX ordenes_pkey ON public.ordenes USING btree (id) |
| ordenes | uq_ordenes_numero | CREATE UNIQUE INDEX uq_ordenes_numero ON public.ordenes USING btree (numero_orden) |
| pagos | ix_pagos_orden | CREATE INDEX ix_pagos_orden ON public.pagos USING btree (orden_id) |
| pagos | pagos_pkey | CREATE UNIQUE INDEX pagos_pkey ON public.pagos USING btree (id) |
| perfiles | perfiles_pkey | CREATE UNIQUE INDEX perfiles_pkey ON public.perfiles USING btree (id) |
| price_history | ix_ph_producto | CREATE INDEX ix_ph_producto ON public.price_history USING btree (producto_id) |
| price_history | price_history_pkey | CREATE UNIQUE INDEX price_history_pkey ON public.price_history USING btree (id) |
| price_list_items | ix_pli_lista | CREATE INDEX ix_pli_lista ON public.price_list_items USING btree (lista_id) |
| price_list_items | price_list_items_lista_id_producto_id_key | CREATE UNIQUE INDEX price_list_items_lista_id_producto_id_key ON public.price_list_items USING btree (lista_id, producto_id) |
| price_list_items | price_list_items_pkey | CREATE UNIQUE INDEX price_list_items_pkey ON public.price_list_items USING btree (id) |
| price_lists | price_lists_pkey | CREATE UNIQUE INDEX price_lists_pkey ON public.price_lists USING btree (id) |
| productos | ix_productos_activo | CREATE INDEX ix_productos_activo ON public.productos USING btree (activo, disponible) |
| productos | ix_productos_categoria | CREATE INDEX ix_productos_categoria ON public.productos USING btree (categoria_id) WHERE (deleted_at IS NULL) |
| productos | ix_sync_updated_at | CREATE INDEX ix_sync_updated_at ON public.productos USING btree (updated_at) |
| productos | productos_codigo_key | CREATE UNIQUE INDEX productos_codigo_key ON public.productos USING btree (codigo) |
| productos | productos_pkey | CREATE UNIQUE INDEX productos_pkey ON public.productos USING btree (id) |
| proveedores | proveedores_pkey | CREATE UNIQUE INDEX proveedores_pkey ON public.proveedores USING btree (id) |
| recetas | ix_recetas_inventario | CREATE INDEX ix_recetas_inventario ON public.recetas USING btree (inventario_id) |
| recetas | recetas_pkey | CREATE UNIQUE INDEX recetas_pkey ON public.recetas USING btree (producto_id, inventario_id) |
| registro_auditoria | registro_auditoria_pkey | CREATE UNIQUE INDEX registro_auditoria_pkey ON public.registro_auditoria USING btree (id) |

## Triggers de usuario (31)

| tabla | nombre | definicion |
| --- | --- | --- |
| caja_sesiones | trg_audit_caja_sesiones | CREATE TRIGGER trg_audit_caja_sesiones AFTER INSERT OR DELETE OR UPDATE ON public.caja_sesiones FOR EACH ROW EXECUTE FUNCTION log_auditoria() |
| caja_sesiones | trg_touch_caja_sesiones | CREATE TRIGGER trg_touch_caja_sesiones BEFORE UPDATE ON public.caja_sesiones FOR EACH ROW EXECUTE FUNCTION set_updated_at() |
| categorias | trg_touch_categorias | CREATE TRIGGER trg_touch_categorias BEFORE UPDATE ON public.categorias FOR EACH ROW EXECUTE FUNCTION set_updated_at() |
| cocina_tickets | trg_touch_cocina_tickets | CREATE TRIGGER trg_touch_cocina_tickets BEFORE UPDATE ON public.cocina_tickets FOR EACH ROW EXECUTE FUNCTION set_updated_at() |
| compra_detalles | trg_touch_compra_detalles | CREATE TRIGGER trg_touch_compra_detalles BEFORE UPDATE ON public.compra_detalles FOR EACH ROW EXECUTE FUNCTION set_updated_at() |
| compras | trg_audit_compras | CREATE TRIGGER trg_audit_compras AFTER INSERT OR DELETE OR UPDATE ON public.compras FOR EACH ROW EXECUTE FUNCTION log_auditoria() |
| compras | trg_touch_compras | CREATE TRIGGER trg_touch_compras BEFORE UPDATE ON public.compras FOR EACH ROW EXECUTE FUNCTION set_updated_at() |
| configuracion | trg_touch_configuracion | CREATE TRIGGER trg_touch_configuracion BEFORE UPDATE ON public.configuracion FOR EACH ROW EXECUTE FUNCTION set_updated_at() |
| gastos | trg_audit_gastos | CREATE TRIGGER trg_audit_gastos AFTER INSERT OR DELETE OR UPDATE ON public.gastos FOR EACH ROW EXECUTE FUNCTION log_auditoria() |
| gastos | trg_touch_gastos | CREATE TRIGGER trg_touch_gastos BEFORE UPDATE ON public.gastos FOR EACH ROW EXECUTE FUNCTION set_updated_at() |
| inventario | trg_audit_inventario | CREATE TRIGGER trg_audit_inventario AFTER INSERT OR DELETE OR UPDATE ON public.inventario FOR EACH ROW EXECUTE FUNCTION log_auditoria() |
| inventario | trg_touch_inventario | CREATE TRIGGER trg_touch_inventario BEFORE UPDATE ON public.inventario FOR EACH ROW EXECUTE FUNCTION set_updated_at() |
| inventario_movimientos | trg_touch_inventario_movimientos | CREATE TRIGGER trg_touch_inventario_movimientos BEFORE UPDATE ON public.inventario_movimientos FOR EACH ROW EXECUTE FUNCTION set_updated_at() |
| movimientos_caja | trg_touch_movimientos_caja | CREATE TRIGGER trg_touch_movimientos_caja BEFORE UPDATE ON public.movimientos_caja FOR EACH ROW EXECUTE FUNCTION set_updated_at() |
| orden_detalles | trg_touch_orden_detalles | CREATE TRIGGER trg_touch_orden_detalles BEFORE UPDATE ON public.orden_detalles FOR EACH ROW EXECUTE FUNCTION set_updated_at() |
| ordenes | trg_after_insert_orden | CREATE TRIGGER trg_after_insert_orden AFTER INSERT ON public.ordenes FOR EACH ROW EXECUTE FUNCTION trg_enviar_orden_cocina() |
| ordenes | trg_audit_ordenes | CREATE TRIGGER trg_audit_ordenes AFTER INSERT OR DELETE OR UPDATE ON public.ordenes FOR EACH ROW EXECUTE FUNCTION log_auditoria() |
| ordenes | trg_ordenes_estado_changed | CREATE TRIGGER trg_ordenes_estado_changed AFTER UPDATE OF estado ON public.ordenes FOR EACH ROW WHEN ((old.estado IS DISTINCT FROM new.estado)) EXECUTE FUNCTION trg_sync_ticket_estado() |
| ordenes | trg_touch_ordenes | CREATE TRIGGER trg_touch_ordenes BEFORE UPDATE ON public.ordenes FOR EACH ROW EXECUTE FUNCTION set_updated_at() |
| pagos | trg_touch_pagos | CREATE TRIGGER trg_touch_pagos BEFORE UPDATE ON public.pagos FOR EACH ROW EXECUTE FUNCTION set_updated_at() |
| perfiles | trg_audit_perfiles | CREATE TRIGGER trg_audit_perfiles AFTER INSERT OR DELETE OR UPDATE ON public.perfiles FOR EACH ROW EXECUTE FUNCTION log_auditoria() |
| perfiles | trg_touch_perfiles | CREATE TRIGGER trg_touch_perfiles BEFORE UPDATE ON public.perfiles FOR EACH ROW EXECUTE FUNCTION set_updated_at() |
| price_history | trg_touch_price_history | CREATE TRIGGER trg_touch_price_history BEFORE UPDATE ON public.price_history FOR EACH ROW EXECUTE FUNCTION set_updated_at() |
| price_list_items | trg_audit_price_list_items | CREATE TRIGGER trg_audit_price_list_items AFTER INSERT OR DELETE OR UPDATE ON public.price_list_items FOR EACH ROW EXECUTE FUNCTION log_auditoria() |
| price_list_items | trg_touch_price_list_items | CREATE TRIGGER trg_touch_price_list_items BEFORE UPDATE ON public.price_list_items FOR EACH ROW EXECUTE FUNCTION set_updated_at() |
| price_lists | trg_audit_price_lists | CREATE TRIGGER trg_audit_price_lists AFTER INSERT OR DELETE OR UPDATE ON public.price_lists FOR EACH ROW EXECUTE FUNCTION log_auditoria() |
| price_lists | trg_touch_price_lists | CREATE TRIGGER trg_touch_price_lists BEFORE UPDATE ON public.price_lists FOR EACH ROW EXECUTE FUNCTION set_updated_at() |
| productos | trg_audit_productos | CREATE TRIGGER trg_audit_productos AFTER INSERT OR DELETE OR UPDATE ON public.productos FOR EACH ROW EXECUTE FUNCTION log_auditoria() |
| productos | trg_touch_productos | CREATE TRIGGER trg_touch_productos BEFORE UPDATE ON public.productos FOR EACH ROW EXECUTE FUNCTION set_updated_at() |
| proveedores | trg_touch_proveedores | CREATE TRIGGER trg_touch_proveedores BEFORE UPDATE ON public.proveedores FOR EACH ROW EXECUTE FUNCTION set_updated_at() |
| recetas | trg_touch_recetas | CREATE TRIGGER trg_touch_recetas BEFORE UPDATE ON public.recetas FOR EACH ROW EXECUTE FUNCTION set_updated_at() |

## Funciones (9)

| funcion | security_definer | configuracion | anon_execute |
| --- | --- | --- | --- |
| cerrar_caja(uuid,numeric) | true | {"search_path=public, auth, extensions"} | true |
| cobrar_orden(uuid,metodo_pago) | true | {"search_path=public, auth, extensions"} | true |
| es_admin() | true | {"search_path=public, auth, extensions"} | true |
| log_auditoria() | true | {"search_path=public, auth, extensions"} | true |
| procesar_consumo_receta(uuid) | true | {"search_path=public, auth, extensions"} | true |
| reporte_resumen(date,date) | true | {"search_path=public, auth, extensions"} | true |
| set_updated_at() | false |  | true |
| trg_enviar_orden_cocina() | true | {"search_path=public, auth, extensions"} | true |
| trg_sync_ticket_estado() | true | {"search_path=public, auth, extensions"} | true |

## Vistas (3)

| vista | opciones |
| --- | --- |
| v_articulos_bajo_stock | {security_invoker=true} |
| v_inventario_cocina | {security_invoker=true} |
| v_productos_pos | {security_invoker=true} |

## Politicas RLS (42)

| tabla | nombre | roles | cmd | qual | with_check |
| --- | --- | --- | --- | --- | --- |
| caja_sesiones | leer_caja_sesiones | {authenticated} | SELECT | true |  |
| caja_sesiones | operativo_caja_sesiones | {authenticated} | ALL | ((usuario_id = auth.uid()) OR es_admin()) | ((usuario_id = auth.uid()) OR es_admin()) |
| categorias | admin_categorias | {authenticated} | ALL | es_admin() | es_admin() |
| categorias | leer_categorias | {authenticated} | SELECT | true |  |
| cocina_tickets | leer_cocina_tickets | {authenticated} | SELECT | true |  |
| cocina_tickets | operativo_tickets | {authenticated} | ALL | true | true |
| compra_detalles | admin_compra_detalles | {authenticated} | ALL | es_admin() | es_admin() |
| compra_detalles | leer_compra_detalles | {authenticated} | SELECT | true |  |
| compras | admin_compras | {authenticated} | ALL | es_admin() | es_admin() |
| compras | leer_compras | {authenticated} | SELECT | true |  |
| configuracion | admin_configuracion | {authenticated} | ALL | es_admin() | es_admin() |
| configuracion | leer_configuracion | {authenticated} | SELECT | true |  |
| gastos | leer_gastos | {authenticated} | SELECT | true |  |
| gastos | operativo_gastos | {authenticated} | ALL | ((usuario_id = auth.uid()) OR es_admin()) | ((usuario_id = auth.uid()) OR es_admin()) |
| inventario | admin_inventario | {authenticated} | ALL | es_admin() | es_admin() |
| inventario | leer_inventario | {authenticated} | SELECT | true |  |
| inventario_movimientos | leer_inventario_movimientos | {authenticated} | SELECT | true |  |
| inventario_movimientos | operativo_movs | {authenticated} | ALL | true | true |
| movimientos_caja | leer_movimientos_caja | {authenticated} | SELECT | true |  |
| movimientos_caja | operativo_caja_movs | {authenticated} | ALL | ((usuario_id = auth.uid()) OR es_admin()) | ((usuario_id = auth.uid()) OR es_admin()) |
| orden_detalles | leer_orden_detalles | {authenticated} | SELECT | true |  |
| orden_detalles | operativo_detalles | {authenticated} | ALL | true | true |
| ordenes | leer_ordenes | {authenticated} | SELECT | true |  |
| ordenes | operativo_ordenes | {authenticated} | ALL | true | true |
| pagos | leer_pagos | {authenticated} | SELECT | true |  |
| pagos | operativo_pagos | {authenticated} | ALL | true | true |
| perfiles | admin_perfiles | {authenticated} | ALL | es_admin() | es_admin() |
| perfiles | leer_perfiles | {authenticated} | SELECT | true |  |
| perfiles | perfiles_lectura | {authenticated} | SELECT | ((id = auth.uid()) OR es_admin()) |  |
| price_history | admin_price_history | {authenticated} | ALL | es_admin() | es_admin() |
| price_history | leer_price_history | {authenticated} | SELECT | true |  |
| price_list_items | admin_price_list_items | {authenticated} | ALL | es_admin() | es_admin() |
| price_list_items | leer_price_list_items | {authenticated} | SELECT | true |  |
| price_lists | admin_price_lists | {authenticated} | ALL | es_admin() | es_admin() |
| price_lists | leer_price_lists | {authenticated} | SELECT | true |  |
| productos | admin_productos | {authenticated} | ALL | es_admin() | es_admin() |
| productos | leer_productos | {authenticated} | SELECT | true |  |
| proveedores | admin_proveedores | {authenticated} | ALL | es_admin() | es_admin() |
| proveedores | leer_proveedores | {authenticated} | SELECT | true |  |
| recetas | admin_recetas | {authenticated} | ALL | es_admin() | es_admin() |
| recetas | leer_recetas | {authenticated} | SELECT | true |  |
| registro_auditoria | admin_auditoria | {authenticated} | SELECT | es_admin() |  |

