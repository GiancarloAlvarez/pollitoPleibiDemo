-- Migración revisable. Ejecutar primero en proyecto de pruebas, nunca como seed.
-- Precondición: schema_completo.sql ya desplegado (tablas, perfiles y enums).
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

-- Las policies permisivas se combinan por OR: sustituir la lectura general de caja.
DROP POLICY IF EXISTS leer_caja_sesiones ON public.caja_sesiones;
DROP POLICY IF EXISTS operativo_caja_sesiones ON public.caja_sesiones;
DROP POLICY IF EXISTS caja_lectura_propia ON public.caja_sesiones;
CREATE POLICY caja_lectura_propia ON public.caja_sesiones FOR SELECT TO authenticated
  USING (usuario_id = auth.uid() OR EXISTS (SELECT 1 FROM public.perfiles
    WHERE id = auth.uid() AND rol = 'admin' AND activo IS TRUE AND deleted_at IS NULL));
-- Apertura por RPC; no permitir modificar fondo/propietario o borrar sesiones vía REST.
REVOKE INSERT, UPDATE, DELETE ON public.caja_sesiones FROM authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
