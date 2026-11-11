CREATE OR REPLACE FUNCTION trg_enviar_orden_cocina() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO cocina_tickets (orden_id, numero_orden, estado) VALUES (NEW.id, NEW.numero_orden, 'nueva');
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_after_insert_orden AFTER INSERT ON ordenes FOR EACH ROW EXECUTE FUNCTION trg_enviar_orden_cocina();

CREATE OR REPLACE FUNCTION procesar_consumo_receta(p_orden_id UUID) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    item RECORD; ingrediente RECORD; v_existencia_actual NUMERIC;
BEGIN
    FOR item IN SELECT producto_id, cantidad FROM orden_detalles WHERE orden_id = p_orden_id LOOP
        FOR ingrediente IN SELECT inventario_id, cantidad_requerida FROM recetas WHERE producto_id = item.producto_id LOOP
            SELECT existencia INTO v_existencia_actual FROM inventario WHERE id = ingrediente.inventario_id;
            IF v_existencia_actual < (ingrediente.cantidad_requerida * item.cantidad) THEN
                RAISE EXCEPTION 'Stock insuficiente para el ingrediente %', ingrediente.inventario_id;
            END IF;
            UPDATE inventario SET existencia = existencia - (ingrediente.cantidad_requerida * item.cantidad) WHERE id = ingrediente.inventario_id;
            INSERT INTO inventario_movimientos (inventario_id, tipo, cantidad, existencia_anterior, existencia_resultante, usuario_id, motivo)
            VALUES (ingrediente.inventario_id, 'consumo_venta', (ingrediente.cantidad_requerida * item.cantidad), v_existencia_actual, v_existencia_actual - (ingrediente.cantidad_requerida * item.cantidad), auth.uid(), 'Consumo automático por Orden ' || p_orden_id);
        END LOOP;
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION cobrar_orden(p_orden_id UUID, p_metodo_pago metodo_pago) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE ordenes SET estado = 'entregada', metodo_pago = p_metodo_pago WHERE id = p_orden_id AND estado != 'entregada' AND estado != 'anulada';
    IF NOT FOUND THEN RAISE EXCEPTION 'Orden no válida.'; END IF;
    UPDATE cocina_tickets SET estado = 'entregada', fecha_entregada = NOW() WHERE orden_id = p_orden_id;
    PERFORM procesar_consumo_receta(p_orden_id);
    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION cerrar_caja(p_sesion_id UUID, p_declarado NUMERIC) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_estado VARCHAR; v_inicial NUMERIC; v_ventas_efectivo NUMERIC := 0; v_entradas NUMERIC := 0; v_salidas NUMERIC := 0; v_esperado NUMERIC := 0;
BEGIN
    SELECT estado, monto_inicial INTO v_estado, v_inicial FROM caja_sesiones WHERE id = p_sesion_id;
    IF v_estado != 'abierta' THEN RAISE EXCEPTION 'Caja no abierta.'; END IF;
    
    SELECT COALESCE(SUM(total), 0) INTO v_ventas_efectivo FROM ordenes WHERE caja_sesion_id = p_sesion_id AND metodo_pago = 'efectivo' AND estado = 'entregada';
    SELECT COALESCE(SUM(monto), 0) INTO v_entradas FROM movimientos_caja WHERE caja_sesion_id = p_sesion_id AND tipo = 'entrada';
    SELECT COALESCE(SUM(monto), 0) INTO v_salidas FROM movimientos_caja WHERE caja_sesion_id = p_sesion_id AND tipo IN ('retiro', 'gasto');
    
    v_esperado := v_inicial + v_ventas_efectivo + v_entradas - v_salidas;
    UPDATE caja_sesiones SET estado = 'cerrada', monto_esperado = v_esperado, monto_declarado = p_declarado, fecha_cierre = NOW() WHERE id = p_sesion_id;
    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION reporte_resumen(p_fecha_inicio DATE, p_fecha_fin DATE) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE resultado JSON;
BEGIN
    SELECT json_build_object('ventas_totales', COALESCE(SUM(total), 0), 'cantidad_ordenes', COUNT(id), 'ticket_promedio', CASE WHEN COUNT(id) > 0 THEN COALESCE(SUM(total)/COUNT(id), 0) ELSE 0 END, 'itbis_recaudado', COALESCE(SUM(itbis), 0)) 
    INTO resultado FROM ordenes WHERE estado = 'entregada' AND DATE(fecha_creacion AT TIME ZONE 'America/Santo_Domingo') BETWEEN p_fecha_inicio AND p_fecha_fin;
    RETURN resultado;
END;
$$;