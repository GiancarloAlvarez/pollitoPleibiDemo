-- Migración revisable de caja: apertura, arqueo, cierre, movimientos y gastos.
-- Reemplaza y amplía 20261111_caja_comprobantes.sql. Es idempotente: puede
-- ejecutarse después de aquella o directamente sobre schema_completo.sql.
-- Ejecutar primero en un proyecto de PRUEBAS, con respaldo previo. No es un seed.
BEGIN;

DO $$ BEGIN
  IF EXISTS (SELECT usuario_id FROM public.caja_sesiones WHERE estado = 'abierta'
             AND deleted_at IS NULL GROUP BY usuario_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Hay cajas abiertas duplicadas: conciliar manualmente antes de migrar.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pagos WHERE orden_id IS NULL)
     OR EXISTS (SELECT 1 FROM public.orden_detalles WHERE orden_id IS NULL) THEN
    RAISE EXCEPTION 'Hay pagos o detalles sin orden: conciliar antes de aplicar NOT NULL.';
  END IF;
END $$;

ALTER TABLE public.pagos ALTER COLUMN orden_id SET NOT NULL;
ALTER TABLE public.orden_detalles ALTER COLUMN orden_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_caja_abierta_usuario
  ON public.caja_sesiones(usuario_id) WHERE estado = 'abierta' AND deleted_at IS NULL;

ALTER TABLE public.ordenes ADD COLUMN IF NOT EXISTS vendedor_nombre text;
ALTER TABLE public.ordenes ADD COLUMN IF NOT EXISTS comprobante_negocio jsonb;
ALTER TABLE public.ordenes ADD COLUMN IF NOT EXISTS efectivo_recibido numeric(10,2);
ALTER TABLE public.ordenes ADD COLUMN IF NOT EXISTS cambio numeric(10,2);

-- ----------------------------------------------------------------------------
-- Apertura: una sesión abierta por usuario, idempotente por p_id.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.abrir_caja(p_id uuid, p_monto numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_actor uuid := auth.uid(); v_profile public.perfiles; v_session public.caja_sesiones;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Sesión autenticada requerida.'; END IF;
  -- Serializa aperturas del mismo usuario, incluso con diferentes IDs de operación.
  SELECT * INTO v_profile FROM public.perfiles WHERE id = v_actor FOR UPDATE;
  IF NOT FOUND OR v_profile.activo IS NOT TRUE OR v_profile.deleted_at IS NOT NULL
     OR v_profile.rol NOT IN ('admin', 'cajero') THEN
    RAISE EXCEPTION 'Usuario sin permiso para abrir caja.';
  END IF;
  IF p_id IS NULL OR p_monto IS NULL OR p_monto < 0 OR p_monto > 99999999.99
     OR p_monto <> round(p_monto, 2) THEN RAISE EXCEPTION 'Monto inicial inválido.'; END IF;
  SELECT * INTO v_session FROM public.caja_sesiones WHERE id = p_id;
  IF FOUND THEN
    IF v_session.usuario_id <> v_actor OR v_session.monto_inicial <> p_monto
       OR v_session.estado <> 'abierta' OR v_session.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'La operación de apertura ya existe con otro contenido o está cerrada.';
    END IF;
    RETURN to_jsonb(v_session);
  END IF;
  IF EXISTS (SELECT 1 FROM public.caja_sesiones WHERE usuario_id = v_actor
             AND estado = 'abierta' AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Ya tienes una caja abierta. Actualiza el estado de caja.';
  END IF;
  INSERT INTO public.caja_sesiones(id, usuario_id, monto_inicial)
    VALUES (p_id, v_actor, p_monto) RETURNING * INTO v_session;
  RETURN to_jsonb(v_session);
END $$;
REVOKE ALL ON FUNCTION public.abrir_caja(uuid,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.abrir_caja(uuid,numeric) TO authenticated;

-- ----------------------------------------------------------------------------
-- Validación de ventas vinculadas a una caja abierta del vendedor autenticado.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validar_caja_venta()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_profile public.perfiles; v_cash public.caja_sesiones; v_financial boolean := true;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_financial := (NEW.usuario_id, NEW.caja_sesion_id, NEW.total, NEW.subtotal, NEW.itbis, NEW.descuento, NEW.propina,
      NEW.pagado, NEW.metodo_pago, NEW.efectivo_recibido, NEW.cambio, NEW.comprobante_negocio)
      IS DISTINCT FROM (OLD.usuario_id, OLD.caja_sesion_id, OLD.total, OLD.subtotal, OLD.itbis, OLD.descuento, OLD.propina,
      OLD.pagado, OLD.metodo_pago, OLD.efectivo_recibido, OLD.cambio, OLD.comprobante_negocio);
    IF OLD.usuario_id IS NOT NULL AND NEW.usuario_id IS DISTINCT FROM OLD.usuario_id THEN
      RAISE EXCEPTION 'No se puede reasignar el vendedor histórico.';
    END IF;
    IF OLD.caja_sesion_id IS NOT NULL AND NEW.caja_sesion_id IS DISTINCT FROM OLD.caja_sesion_id THEN
      RAISE EXCEPTION 'No se puede reasignar la caja histórica.';
    END IF;
    NEW.vendedor_nombre := OLD.vendedor_nombre;
  END IF;
  -- Filas históricas sin caja no se rellenan ni atribuyen a un usuario inventado.
  IF NEW.caja_sesion_id IS NULL THEN RETURN NEW; END IF;
  IF NOT v_financial THEN RETURN NEW; END IF;
  SELECT * INTO v_profile FROM public.perfiles WHERE id = auth.uid();
  IF NOT FOUND OR v_profile.activo IS NOT TRUE OR v_profile.deleted_at IS NOT NULL
     OR v_profile.rol NOT IN ('admin', 'cajero') OR NEW.usuario_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'El vendedor debe ser el usuario autenticado autorizado.';
  END IF;
  SELECT * INTO v_cash FROM public.caja_sesiones WHERE id = NEW.caja_sesion_id FOR UPDATE;
  IF NOT FOUND OR v_cash.usuario_id <> auth.uid() OR v_cash.estado <> 'abierta' OR v_cash.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'La caja no está abierta o pertenece a otro usuario.';
  END IF;
  IF NEW.efectivo_recibido IS NOT NULL AND (NEW.pagado IS NOT TRUE OR NEW.metodo_pago <> 'efectivo'
     OR NEW.efectivo_recibido < NEW.total OR NEW.cambio IS DISTINCT FROM NEW.efectivo_recibido - NEW.total) THEN
    RAISE EXCEPTION 'Efectivo recibido o cambio inconsistente.';
  END IF;
  IF TG_OP = 'INSERT' THEN NEW.vendedor_nombre := v_profile.nombre; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validar_caja_venta() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_validar_caja_venta ON public.ordenes;
CREATE TRIGGER trg_validar_caja_venta BEFORE INSERT OR UPDATE ON public.ordenes
  FOR EACH ROW EXECUTE FUNCTION public.validar_caja_venta();

-- ----------------------------------------------------------------------------
-- Resumen interno del arqueo. Fuente única: pagos en efectivo. No se vuelve a
-- sumar el total de la orden, evitando el doble conteo del cierre anterior.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.caja_resumen(p_sesion_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH cobros AS (
    SELECT COALESCE(SUM(p.monto), 0) AS efectivo
    FROM public.pagos p
    JOIN public.ordenes o ON o.id = p.orden_id
    WHERE o.caja_sesion_id = p_sesion_id
      AND o.pagado IS TRUE
      AND o.estado <> 'anulada'
      AND o.deleted_at IS NULL
      AND p.metodo = 'efectivo'
  ), propinas AS (
    SELECT COALESCE(SUM(o.propina), 0) AS propinas
    FROM public.ordenes o
    WHERE o.caja_sesion_id = p_sesion_id
      AND o.pagado IS TRUE
      AND o.estado <> 'anulada'
      AND o.deleted_at IS NULL
      AND o.metodo_pago = 'efectivo'
  ), movimientos AS (
    SELECT COALESCE(SUM(monto) FILTER (WHERE tipo = 'entrada'), 0) AS entradas,
           COALESCE(SUM(monto) FILTER (WHERE tipo = 'retiro'), 0) AS retiros
    FROM public.movimientos_caja
    WHERE caja_sesion_id = p_sesion_id AND deleted_at IS NULL
  ), gastos AS (
    SELECT COALESCE(SUM(monto), 0) AS gastos
    FROM public.gastos
    WHERE caja_sesion_id = p_sesion_id AND salio_de_caja IS TRUE AND deleted_at IS NULL
  )
  SELECT jsonb_build_object(
    'sesion_id', s.id,
    'estado', s.estado,
    'usuario_id', s.usuario_id,
    'monto_inicial', s.monto_inicial,
    'cobros_efectivo', c.efectivo,
    'propinas_efectivo', t.propinas,
    'entradas', m.entradas,
    'retiros', m.retiros,
    'gastos_caja', g.gastos,
    'esperado', round(s.monto_inicial + c.efectivo + m.entradas - m.retiros - g.gastos, 2),
    'monto_declarado', s.monto_declarado,
    'diferencia', s.diferencia,
    'fecha_apertura', s.fecha_apertura,
    'fecha_cierre', s.fecha_cierre,
    'notas', s.notas
  )
  FROM public.caja_sesiones s
  CROSS JOIN cobros c CROSS JOIN propinas t CROSS JOIN movimientos m CROSS JOIN gastos g
  WHERE s.id = p_sesion_id
$$;
REVOKE ALL ON FUNCTION public.caja_resumen(uuid) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Lectura del arqueo por el propietario o un administrador activo (solo lectura).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resumen_caja(p_sesion_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_actor uuid := auth.uid(); v_session public.caja_sesiones; v_admin boolean := false;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Sesión autenticada requerida.'; END IF;
  IF p_sesion_id IS NULL THEN RAISE EXCEPTION 'Sesión de caja inválida.'; END IF;
  SELECT * INTO v_session FROM public.caja_sesiones WHERE id = p_sesion_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sesión de caja no encontrada.'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.perfiles WHERE id = v_actor
    AND rol = 'admin' AND activo IS TRUE AND deleted_at IS NULL) INTO v_admin;
  IF v_session.usuario_id <> v_actor AND NOT v_admin THEN
    RAISE EXCEPTION 'No autorizado para consultar esta caja.';
  END IF;
  RETURN public.caja_resumen(p_sesion_id);
END $$;
REVOKE ALL ON FUNCTION public.resumen_caja(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resumen_caja(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- Entradas y retiros de efectivo. Se validan por RPC para impedir escrituras
-- directas sobre el ledger de caja.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_movimiento_caja(
  p_id uuid, p_sesion_id uuid, p_tipo text, p_monto numeric, p_concepto text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_actor uuid := auth.uid(); v_profile public.perfiles; v_session public.caja_sesiones;
  v_existing public.movimientos_caja; v_row public.movimientos_caja; v_concepto text;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Sesión autenticada requerida.'; END IF;
  IF p_id IS NULL OR p_sesion_id IS NULL THEN RAISE EXCEPTION 'Operación de caja inválida.'; END IF;
  v_concepto := btrim(COALESCE(p_concepto, ''));
  IF p_tipo NOT IN ('entrada', 'retiro') THEN RAISE EXCEPTION 'Tipo de movimiento inválido.'; END IF;
  IF p_monto IS NULL OR p_monto <= 0 OR p_monto > 99999999.99 OR p_monto <> round(p_monto, 2) THEN
    RAISE EXCEPTION 'Monto de movimiento inválido.';
  END IF;
  IF length(v_concepto) = 0 OR length(v_concepto) > 200 THEN RAISE EXCEPTION 'Indica un concepto válido.'; END IF;
  SELECT * INTO v_profile FROM public.perfiles WHERE id = v_actor;
  IF NOT FOUND OR v_profile.activo IS NOT TRUE OR v_profile.deleted_at IS NOT NULL
     OR v_profile.rol NOT IN ('admin', 'cajero') THEN
    RAISE EXCEPTION 'Usuario sin permiso para mover caja.';
  END IF;
  SELECT * INTO v_session FROM public.caja_sesiones WHERE id = p_sesion_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sesión de caja no encontrada.'; END IF;
  IF v_session.usuario_id <> v_actor THEN RAISE EXCEPTION 'Solo el propietario puede mover esta caja.'; END IF;
  IF v_session.estado <> 'abierta' OR v_session.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'La caja no está abierta.'; END IF;
  SELECT * INTO v_existing FROM public.movimientos_caja WHERE id = p_id;
  IF FOUND THEN
    IF v_existing.caja_sesion_id <> p_sesion_id OR v_existing.tipo::text <> p_tipo
       OR v_existing.monto <> p_monto OR v_existing.concepto <> v_concepto
       OR v_existing.usuario_id <> v_actor THEN
      RAISE EXCEPTION 'La operación ya existe con otro contenido.';
    END IF;
    RETURN to_jsonb(v_existing);
  END IF;
  INSERT INTO public.movimientos_caja(id, caja_sesion_id, tipo, monto, concepto, usuario_id)
    VALUES (p_id, p_sesion_id, p_tipo::tipo_movimiento_caja, p_monto, v_concepto, v_actor)
    RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END $$;
REVOKE ALL ON FUNCTION public.registrar_movimiento_caja(uuid,uuid,text,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_movimiento_caja(uuid,uuid,text,numeric,text) TO authenticated;

-- ----------------------------------------------------------------------------
-- Gastos pagados desde la caja. Se registran en gastos (fuente única) y no se
-- duplican en movimientos_caja, por lo que el arqueo los cuenta una sola vez.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_gasto_caja(
  p_id uuid, p_sesion_id uuid, p_categoria text, p_monto numeric, p_descripcion text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_actor uuid := auth.uid(); v_profile public.perfiles; v_session public.caja_sesiones;
  v_existing public.gastos; v_row public.gastos; v_categoria text; v_descripcion text;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Sesión autenticada requerida.'; END IF;
  IF p_id IS NULL OR p_sesion_id IS NULL THEN RAISE EXCEPTION 'Operación de gasto inválida.'; END IF;
  v_categoria := btrim(COALESCE(p_categoria, ''));
  v_descripcion := btrim(COALESCE(p_descripcion, ''));
  IF length(v_categoria) = 0 OR length(v_categoria) > 50 THEN RAISE EXCEPTION 'Indica una categoría válida.'; END IF;
  IF p_monto IS NULL OR p_monto <= 0 OR p_monto > 99999999.99 OR p_monto <> round(p_monto, 2) THEN
    RAISE EXCEPTION 'Monto de gasto inválido.';
  END IF;
  IF length(v_descripcion) > 300 THEN RAISE EXCEPTION 'La descripción es demasiado larga.'; END IF;
  SELECT * INTO v_profile FROM public.perfiles WHERE id = v_actor;
  IF NOT FOUND OR v_profile.activo IS NOT TRUE OR v_profile.deleted_at IS NOT NULL
     OR v_profile.rol NOT IN ('admin', 'cajero') THEN
    RAISE EXCEPTION 'Usuario sin permiso para registrar gastos de caja.';
  END IF;
  SELECT * INTO v_session FROM public.caja_sesiones WHERE id = p_sesion_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sesión de caja no encontrada.'; END IF;
  IF v_session.usuario_id <> v_actor THEN RAISE EXCEPTION 'Solo el propietario puede registrar gastos en esta caja.'; END IF;
  IF v_session.estado <> 'abierta' OR v_session.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'La caja no está abierta.'; END IF;
  SELECT * INTO v_existing FROM public.gastos WHERE id = p_id;
  IF FOUND THEN
    IF v_existing.caja_sesion_id <> p_sesion_id OR v_existing.categoria <> v_categoria
       OR v_existing.monto <> p_monto OR COALESCE(v_existing.descripcion, '') <> v_descripcion
       OR v_existing.usuario_id <> v_actor OR v_existing.salio_de_caja IS NOT TRUE THEN
      RAISE EXCEPTION 'El gasto ya existe con otro contenido.';
    END IF;
    RETURN to_jsonb(v_existing);
  END IF;
  INSERT INTO public.gastos(id, categoria, descripcion, monto, usuario_id, salio_de_caja, caja_sesion_id)
    VALUES (p_id, v_categoria, NULLIF(v_descripcion, ''), p_monto, v_actor, true, p_sesion_id)
    RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END $$;
REVOKE ALL ON FUNCTION public.registrar_gasto_caja(uuid,uuid,text,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_gasto_caja(uuid,uuid,text,numeric,text) TO authenticated;

-- ----------------------------------------------------------------------------
-- Cierre: solo el propietario, bajo bloqueo de fila. El cierre es inmutable;
-- un reintento idéntico devuelve el arqueo ya guardado.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.cerrar_caja(uuid, numeric);
CREATE OR REPLACE FUNCTION public.cerrar_caja(p_sesion_id uuid, p_declarado numeric, p_notas text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_actor uuid := auth.uid(); v_profile public.perfiles; v_session public.caja_sesiones;
  v_resumen jsonb; v_esperado numeric; v_notas text;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Sesión autenticada requerida.'; END IF;
  IF p_sesion_id IS NULL THEN RAISE EXCEPTION 'Sesión de caja inválida.'; END IF;
  IF p_declarado IS NULL OR p_declarado < 0 OR p_declarado > 99999999.99
     OR p_declarado <> round(p_declarado, 2) THEN
    RAISE EXCEPTION 'Monto declarado inválido.';
  END IF;
  v_notas := NULLIF(btrim(COALESCE(p_notas, '')), '');
  IF v_notas IS NOT NULL AND length(v_notas) > 500 THEN RAISE EXCEPTION 'Las notas del cierre son demasiado largas.'; END IF;
  SELECT * INTO v_profile FROM public.perfiles WHERE id = v_actor;
  IF NOT FOUND OR v_profile.activo IS NOT TRUE OR v_profile.deleted_at IS NOT NULL
     OR v_profile.rol NOT IN ('admin', 'cajero') THEN
    RAISE EXCEPTION 'Usuario sin permiso para cerrar caja.';
  END IF;
  SELECT * INTO v_session FROM public.caja_sesiones WHERE id = p_sesion_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sesión de caja no encontrada.'; END IF;
  IF v_session.usuario_id <> v_actor THEN RAISE EXCEPTION 'Solo el propietario puede cerrar esta caja.'; END IF;
  IF v_session.estado = 'cerrada' THEN
    IF v_session.monto_declarado IS NOT DISTINCT FROM p_declarado
       AND v_session.notas IS NOT DISTINCT FROM v_notas THEN
      RETURN public.caja_resumen(p_sesion_id);
    END IF;
    RAISE EXCEPTION 'La caja ya está cerrada con otro arqueo.';
  END IF;
  IF v_session.estado <> 'abierta' OR v_session.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'La caja no está abierta.';
  END IF;
  v_resumen := public.caja_resumen(p_sesion_id);
  v_esperado := (v_resumen->>'esperado')::numeric;
  UPDATE public.caja_sesiones
  SET estado = 'cerrada', monto_esperado = v_esperado, monto_declarado = p_declarado,
      diferencia = round(p_declarado - v_esperado, 2), notas = v_notas,
      fecha_cierre = NOW(), updated_at = NOW()
  WHERE id = p_sesion_id;
  RETURN public.caja_resumen(p_sesion_id);
END $$;
REVOKE ALL ON FUNCTION public.cerrar_caja(uuid,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cerrar_caja(uuid,numeric,text) TO authenticated;

-- ----------------------------------------------------------------------------
-- Verificación de esquema usada por la app para explicar fallos de conexión.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.caja_estado_esquema()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Sesión autenticada requerida.'; END IF;
  RETURN jsonb_build_object(
    'version', 2,
    'abrir_caja', to_regprocedure('public.abrir_caja(uuid,numeric)') IS NOT NULL,
    'cerrar_caja', to_regprocedure('public.cerrar_caja(uuid,numeric,text)') IS NOT NULL,
    'resumen_caja', to_regprocedure('public.resumen_caja(uuid)') IS NOT NULL,
    'movimientos_caja', to_regprocedure('public.registrar_movimiento_caja(uuid,uuid,text,numeric,text)') IS NOT NULL,
    'gastos_caja', to_regprocedure('public.registrar_gasto_caja(uuid,uuid,text,numeric,text)') IS NOT NULL
  );
END $$;
REVOKE ALL ON FUNCTION public.caja_estado_esquema() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.caja_estado_esquema() TO authenticated;

-- ----------------------------------------------------------------------------
-- Permisos: lectura de caja propia o admin. Escrituras solo por RPC.
-- Las policies permisivas se combinan por OR: se sustituye la lectura general.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS leer_caja_sesiones ON public.caja_sesiones;
DROP POLICY IF EXISTS operativo_caja_sesiones ON public.caja_sesiones;
DROP POLICY IF EXISTS caja_lectura_propia ON public.caja_sesiones;
CREATE POLICY caja_lectura_propia ON public.caja_sesiones FOR SELECT TO authenticated
  USING (usuario_id = auth.uid() OR EXISTS (SELECT 1 FROM public.perfiles
    WHERE id = auth.uid() AND rol = 'admin' AND activo IS TRUE AND deleted_at IS NULL));

REVOKE INSERT, UPDATE, DELETE ON public.caja_sesiones FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.movimientos_caja FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.gastos FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
