-- ============================================================================
-- Pollito Pleibi — Esquema completo para Supabase (v2)
-- Sustituye a los 4 archivos anteriores:
--   gemini-code-1793550228913.sql  (DDL)
--   gemini-code-1793550239989.sql  (RLS + vistas)
--   gemini-code-1793550244332.sql  (funciones)
--   gemini-code-1793550261768.sql  (seed)
-- Idempotente: puede ejecutarse sobre una base nueva o una que ya tenga los
-- archivos anteriores. Compatible con el sync de vanilla (updated_at/detele_at
-- + outbox + last-write-wins). Ver README.md para el orden de ejecución.
--
-- Generado: 2026-11-01 · JyB Technology Solutions SRL
-- ============================================================================


-- ============================================================================
-- 0. EXTENSIONES Y TIPOS
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rol_usuario') THEN
    CREATE TYPE rol_usuario AS ENUM ('admin', 'cajero', 'cocinero');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_orden') THEN
    CREATE TYPE estado_orden AS ENUM ('nueva', 'preparando', 'lista', 'entregada', 'anulada');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_movimiento_inv') THEN
    CREATE TYPE tipo_movimiento_inv AS ENUM ('entrada', 'consumo_venta', 'merma', 'desperdicio', 'ajuste', 'devolucion', 'consumo_interno');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'metodo_pago') THEN
    CREATE TYPE metodo_pago AS ENUM ('efectivo', 'tarjeta', 'transferencia', 'mixto');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_movimiento_caja') THEN
    CREATE TYPE tipo_movimiento_caja AS ENUM ('entrada', 'retiro', 'gasto');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'canal_venta') THEN
    CREATE TYPE canal_venta AS ENUM ('Mostrador', 'Para llevar', 'Delivery');
  END IF;
END $$;


-- ============================================================================
-- 1. PERFILES (users de la app)
-- ============================================================================
CREATE TABLE IF NOT EXISTS perfiles (
  id                UUID REFERENCES auth.users(id) PRIMARY KEY,
  nombre            VARCHAR(100) NOT NULL,
  rol               rol_usuario NOT NULL DEFAULT 'cajero',
  pin_autorizacion  VARCHAR(255),          -- hash PBKDF2/argon2; NUNCA texto plano
  activo            BOOLEAN DEFAULT true,
  creado_en         TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);

-- ============================================================================
-- 2. CATÁLOGO: CATEGORÍAS Y PRODUCTOS
-- ============================================================================
CREATE TABLE IF NOT EXISTS categorias (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      VARCHAR(50) NOT NULL UNIQUE,
  orden       INT DEFAULT 0,
  activa      BOOLEAN DEFAULT true,
  creado_en   TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS productos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo          VARCHAR(20) UNIQUE NOT NULL,          -- SKU (ALI-006, EXT-PAP…)
  categoria_id    UUID REFERENCES categorias(id),
  nombre          VARCHAR(100) NOT NULL,
  descripcion     TEXT,
  precio          NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  costo_estimado  NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  tasa_itbis      NUMERIC(5,2)  DEFAULT 18.00,          -- 0.00 = exento
  itbis_incluido  BOOLEAN DEFAULT false,                -- precio de venta incluye ITBIS
  imagen_url      TEXT,
  emoji           VARCHAR(8),                           -- tarjeta visual (app)
  color           VARCHAR(16),                          -- tarjeta visual (app)
  activo          BOOLEAN DEFAULT true,                 -- administrable
  disponible      BOOLEAN DEFAULT true,                 -- sale en el POS
  creado_en       TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

-- ============================================================================
-- 3. PROVEEDORES E INVENTARIO
-- ============================================================================
CREATE TABLE IF NOT EXISTS proveedores (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_empresa         VARCHAR(100) NOT NULL,
  contacto_nombre        VARCHAR(100),
  telefono               VARCHAR(20),
  email                  VARCHAR(120),
  direccion              TEXT,
  productos_suministrados TEXT,                        -- nota libre
  notas                  TEXT,
  activo                 BOOLEAN DEFAULT true,
  creado_en              TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW(),
  deleted_at             TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS inventario (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre            VARCHAR(100) NOT NULL,
  categoria         VARCHAR(60),                        -- agrupación libre (app)
  unidad_medida     VARCHAR(20) NOT NULL,
  costo_unitario    NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  itbis             NUMERIC(5,2) DEFAULT 18.00,
  existencia        NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (existencia >= 0),
  stock_minimo      NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  proveedor_pref_id UUID REFERENCES proveedores(id),
  fecha_entrada     TIMESTAMPTZ,
  notas             TEXT,
  activo            BOOLEAN DEFAULT true,
  creado_en         TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);

-- ============================================================================
-- 4. RECETAS (descuento automático por venta)
-- ============================================================================
CREATE TABLE IF NOT EXISTS recetas (
  producto_id        UUID REFERENCES productos(id) ON DELETE CASCADE,
  inventario_id      UUID REFERENCES inventario(id) ON DELETE RESTRICT,
  cantidad_requerida NUMERIC(10,4) NOT NULL CHECK (cantidad_requerida > 0),
  notas              TEXT,
  creado_en          TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (producto_id, inventario_id)
);

-- ============================================================================
-- 5. CAJA Y GASTOS
-- ============================================================================
CREATE TABLE IF NOT EXISTS caja_sesiones (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id      UUID REFERENCES perfiles(id) NOT NULL,
  monto_inicial   NUMERIC(10,2) NOT NULL,
  monto_esperado  NUMERIC(10,2),
  monto_declarado NUMERIC(10,2),
  diferencia      NUMERIC(10,2),                       -- declarado - esperado
  fecha_apertura  TIMESTAMPTZ DEFAULT NOW(),
  fecha_cierre    TIMESTAMPTZ,
  notas           TEXT,
  estado          VARCHAR(20) DEFAULT 'abierta' CHECK (estado IN ('abierta', 'cerrada')),
  creado_en       TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS movimientos_caja (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caja_sesion_id UUID REFERENCES caja_sesiones(id) ON DELETE CASCADE,
  tipo           tipo_movimiento_caja NOT NULL,
  monto          NUMERIC(10,2) NOT NULL CHECK (monto > 0),
  concepto       TEXT NOT NULL,
  fecha          TIMESTAMPTZ DEFAULT NOW(),
  usuario_id     UUID REFERENCES perfiles(id) NOT NULL,
  creado_en      TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  deleted_at     TIMESTAMPTZ
);

-- Gastos operativos. Regla anti doble-conteo: si salio_de_caja = true, el
-- arqueo lo suma UNA vez (por caja_sesion_id) y NO debe volver a insertarse
-- en movimientos_caja.
CREATE TABLE IF NOT EXISTS gastos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria      VARCHAR(50) NOT NULL,
  descripcion    TEXT,
  monto          NUMERIC(10,2) NOT NULL CHECK (monto > 0),
  fecha          TIMESTAMPTZ DEFAULT NOW(),
  usuario_id     UUID REFERENCES perfiles(id) NOT NULL,
  salio_de_caja  BOOLEAN DEFAULT false,
  caja_sesion_id UUID REFERENCES caja_sesiones(id),
  creado_en      TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  deleted_at     TIMESTAMPTZ
);

-- ============================================================================
-- 6. COMPRAS (entradas de mercancía multi-línea)
-- ============================================================================
CREATE TABLE IF NOT EXISTS compras (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor_id  UUID REFERENCES proveedores(id),
  fecha         TIMESTAMPTZ DEFAULT NOW(),
  usuario_id    UUID REFERENCES perfiles(id) NOT NULL,
  subtotal      NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  itbis         NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  total         NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  notas         TEXT,
  creado_en     TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS compra_detalles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compra_id       UUID REFERENCES compras(id) ON DELETE CASCADE,
  inventario_id   UUID REFERENCES inventario(id) ON DELETE RESTRICT,
  cantidad        NUMERIC(10,2) NOT NULL CHECK (cantidad > 0),
  unidad          VARCHAR(20),
  costo_unitario  NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  itbis           NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  creado_en       TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 7. VENTAS: ÓRDENES, DETALLES, PAGOS Y COCINA
-- ============================================================================
CREATE TABLE IF NOT EXISTS ordenes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_orden    SERIAL,                               -- secuencia del negocio
  caja_sesion_id  UUID REFERENCES caja_sesiones(id),    -- NULLABLE (F0): el POS
                  -- debe poder insertar antes de que exista el módulo de caja.
  usuario_id      UUID REFERENCES perfiles(id),         -- vendedor
  cliente         VARCHAR(120) DEFAULT 'Mostrador',
  canal           canal_venta DEFAULT 'Mostrador',
  notas           TEXT,
  subtotal        NUMERIC(10,2) NOT NULL,
  descuento       NUMERIC(10,2) DEFAULT 0.00 CHECK (descuento >= 0),
  propina         NUMERIC(10,2) DEFAULT 0.00 CHECK (propina >= 0),  -- 10 % legal opcional
  itbis           NUMERIC(10,2) NOT NULL,
  total           NUMERIC(10,2) NOT NULL,
  pagado          BOOLEAN DEFAULT true,
  metodo_pago     metodo_pago,
  estado          estado_orden DEFAULT 'nueva',
  notas_anulacion TEXT,
  fecha_creacion  TIMESTAMPTZ DEFAULT NOW(),
  creado_en       TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ordenes_numero ON ordenes (numero_orden);

CREATE TABLE IF NOT EXISTS orden_detalles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id        UUID REFERENCES ordenes(id) ON DELETE CASCADE,
  producto_id     UUID REFERENCES productos(id),
  nombre_snapshot VARCHAR(100) NOT NULL,
  cantidad        INT NOT NULL CHECK (cantidad > 0),
  precio_unitario NUMERIC(10,2) NOT NULL,
  costo_unitario  NUMERIC(10,2) NOT NULL DEFAULT 0,
  itbis_aplicado  NUMERIC(10,2) NOT NULL DEFAULT 0,
  notas           TEXT,                                 -- indicaciones para cocina
  creado_en       TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Pagos desglosados (permite mixto y amortiza propina)
CREATE TABLE IF NOT EXISTS pagos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id     UUID REFERENCES ordenes(id) ON DELETE CASCADE,
  metodo       metodo_pago NOT NULL,
  monto        NUMERIC(10,2) NOT NULL CHECK (monto > 0),
  referencia   VARCHAR(60),
  creado_en    TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cocina_tickets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id        UUID REFERENCES ordenes(id) UNIQUE NOT NULL,
  numero_orden    INT NOT NULL,
  estado          estado_orden DEFAULT 'nueva',
  fecha_entrada   TIMESTAMPTZ DEFAULT NOW(),
  fecha_entregada TIMESTAMPTZ,
  creado_en       TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 8. MOVIMIENTOS DE INVENTARIO Y AUDITORÍA
-- ============================================================================
CREATE TABLE IF NOT EXISTS inventario_movimientos (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventario_id          UUID REFERENCES inventario(id) NOT NULL,
  tipo                   tipo_movimiento_inv NOT NULL,
  cantidad               NUMERIC(10,2) NOT NULL,
  unidad                 VARCHAR(20),
  costo_unitario         NUMERIC(10,2),
  total                  NUMERIC(12,2),
  existencia_anterior    NUMERIC(10,2) NOT NULL,
  existencia_resultante  NUMERIC(10,2) NOT NULL,
  proveedor_id           UUID REFERENCES proveedores(id),
  usuario_id             UUID REFERENCES perfiles(id) NOT NULL,
  motivo                 TEXT,
  orden_id               UUID REFERENCES ordenes(id),
  creado_en              TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW(),
  deleted_at             TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS registro_auditoria (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id     UUID REFERENCES perfiles(id),
  accion         VARCHAR(100) NOT NULL,
  tabla_afectada VARCHAR(50),
  registro_id    UUID,
  detalles       JSONB,
  fecha          TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 9. TALONARIO DE PRECIOS (listas por canal + historial)
-- ============================================================================
CREATE TABLE IF NOT EXISTS price_lists (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre          VARCHAR(60) NOT NULL,
  canal           VARCHAR(24) NOT NULL DEFAULT 'Mostrador',
  moneda          VARCHAR(3)  NOT NULL DEFAULT 'RD$',
  activa          BOOLEAN DEFAULT true,
  vigencia_desde  DATE,
  vigencia_hasta  DATE,
  creado_en       TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS price_list_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lista_id      UUID REFERENCES price_lists(id) ON DELETE CASCADE,
  producto_id   UUID REFERENCES productos(id) ON DELETE CASCADE,
  precio        NUMERIC(10,2) NOT NULL CHECK (precio >= 0),
  itbis_incluido BOOLEAN DEFAULT false,
  creado_en     TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (lista_id, producto_id)
);

CREATE TABLE IF NOT EXISTS price_history (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id    UUID REFERENCES productos(id),
  lista_id       UUID REFERENCES price_lists(id),
  precio_anterior NUMERIC(10,2),
  precio_nuevo   NUMERIC(10,2) NOT NULL,
  usuario_id     UUID REFERENCES perfiles(id),
  motivo         TEXT,
  creado_en      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 10. CONFIGURACIÓN (equivale al store local "settings")
-- ============================================================================
CREATE TABLE IF NOT EXISTS configuracion (
  key         TEXT PRIMARY KEY,
  valor       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================================
-- 11. ÍNDICES
-- ============================================================================
CREATE INDEX IF NOT EXISTS ix_productos_categoria ON productos (categoria_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_productos_activo    ON productos (activo, disponible);
CREATE INDEX IF NOT EXISTS ix_recetas_inventario  ON recetas (inventario_id);
CREATE INDEX IF NOT EXISTS ix_orden_detalles      ON orden_detalles (orden_id);
CREATE INDEX IF NOT EXISTS ix_orden_detalles_prod ON orden_detalles (producto_id);
CREATE INDEX IF NOT EXISTS ix_ordenes_sesion      ON ordenes (caja_sesion_id);
CREATE INDEX IF NOT EXISTS ix_ordenes_estado      ON ordenes (estado);
CREATE INDEX IF NOT EXISTS ix_ordenes_fecha       ON ordenes (fecha_creacion);
CREATE INDEX IF NOT EXISTS ix_pagos_orden         ON pagos (orden_id);
CREATE INDEX IF NOT EXISTS ix_inv_mov_insumo      ON inventario_movimientos (inventario_id);
CREATE INDEX IF NOT EXISTS ix_inv_mov_orden       ON inventario_movimientos (orden_id);
CREATE INDEX IF NOT EXISTS ix_mov_caja_sesion     ON movimientos_caja (caja_sesion_id);
CREATE INDEX IF NOT EXISTS ix_gastos_fecha        ON gastos (fecha);
CREATE INDEX IF NOT EXISTS ix_compras_proveedor   ON compras (proveedor_id);
CREATE INDEX IF NOT EXISTS ix_pli_lista           ON price_list_items (lista_id);
CREATE INDEX IF NOT EXISTS ix_ph_producto         ON price_history (producto_id);
CREATE INDEX IF NOT EXISTS ix_sync_updated_at     ON productos (updated_at);
CREATE INDEX IF NOT EXISTS ix_sync_updated_at_ord ON ordenes (updated_at);
CREATE INDEX IF NOT EXISTS ix_sync_updated_at_inv ON inventario (updated_at);


-- ============================================================================
-- 12. MIGRACIÓN DE ESQUEMAS ANTERIORES (delta sobre los 4 gemini files)
-- Ejecutar ALTER idempotentes NO daña bases nuevas (columna ya existe → no-op)
-- ============================================================================
DO $$
BEGIN
  ALTER TABLE ordenes        ALTER COLUMN caja_sesion_id DROP NOT NULL;
  ALTER TABLE ordenes        ADD COLUMN IF NOT EXISTS cliente         VARCHAR(120) DEFAULT 'Mostrador';
  ALTER TABLE ordenes        ADD COLUMN IF NOT EXISTS canal           VARCHAR(24) DEFAULT 'Mostrador';
  ALTER TABLE ordenes        ADD COLUMN IF NOT EXISTS notas           TEXT;
  ALTER TABLE ordenes        ADD COLUMN IF NOT EXISTS pagado          BOOLEAN DEFAULT true;
  ALTER TABLE ordenes        ADD COLUMN IF NOT EXISTS propina         NUMERIC(10,2) DEFAULT 0.00;
  ALTER TABLE ordenes        ADD COLUMN IF NOT EXISTS notas_anulacion TEXT;
  ALTER TABLE ordenes        ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ DEFAULT NOW();
  ALTER TABLE ordenes        ADD COLUMN IF NOT EXISTS deleted_at      TIMESTAMPTZ;
  ALTER TABLE productos      ADD COLUMN IF NOT EXISTS itbis_incluido  BOOLEAN DEFAULT false;
  ALTER TABLE productos      ADD COLUMN IF NOT EXISTS emoji           VARCHAR(8);
  ALTER TABLE productos      ADD COLUMN IF NOT EXISTS color           VARCHAR(16);
  ALTER TABLE productos      ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ DEFAULT NOW();
  ALTER TABLE productos      ADD COLUMN IF NOT EXISTS deleted_at      TIMESTAMPTZ;
  ALTER TABLE productos      ADD COLUMN IF NOT EXISTS creado_en       TIMESTAMPTZ DEFAULT NOW();
  ALTER TABLE categorias     ADD COLUMN IF NOT EXISTS creado_en       TIMESTAMPTZ DEFAULT NOW();
  ALTER TABLE categorias     ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ DEFAULT NOW();
  ALTER TABLE categorias     ADD COLUMN IF NOT EXISTS deleted_at      TIMESTAMPTZ;
  ALTER TABLE proveedores    ADD COLUMN IF NOT EXISTS email           VARCHAR(120);
  ALTER TABLE proveedores    ADD COLUMN IF NOT EXISTS direccion       TEXT;
  ALTER TABLE proveedores    ADD COLUMN IF NOT EXISTS productos_suministrados TEXT;
  ALTER TABLE proveedores    ADD COLUMN IF NOT EXISTS notas           TEXT;
  ALTER TABLE proveedores    ADD COLUMN IF NOT EXISTS creado_en       TIMESTAMPTZ DEFAULT NOW();
  ALTER TABLE proveedores    ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ DEFAULT NOW();
  ALTER TABLE proveedores    ADD COLUMN IF NOT EXISTS deleted_at      TIMESTAMPTZ;
  ALTER TABLE inventario     ADD COLUMN IF NOT EXISTS categoria       VARCHAR(60);
  ALTER TABLE inventario     ADD COLUMN IF NOT EXISTS itbis           NUMERIC(5,2) DEFAULT 18.00;
  ALTER TABLE inventario     ADD COLUMN IF NOT EXISTS fecha_entrada   TIMESTAMPTZ;
  ALTER TABLE inventario     ADD COLUMN IF NOT EXISTS notas           TEXT;
  ALTER TABLE inventario     ADD COLUMN IF NOT EXISTS creado_en       TIMESTAMPTZ DEFAULT NOW();
  ALTER TABLE inventario     ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ DEFAULT NOW();
  ALTER TABLE inventario     ADD COLUMN IF NOT EXISTS deleted_at      TIMESTAMPTZ;
  ALTER TABLE recetas        ADD COLUMN IF NOT EXISTS notas           TEXT;
  ALTER TABLE recetas        ADD COLUMN IF NOT EXISTS creado_en       TIMESTAMPTZ DEFAULT NOW();
  ALTER TABLE recetas        ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ DEFAULT NOW();
  ALTER TABLE caja_sesiones  ADD COLUMN IF NOT EXISTS diferencia      NUMERIC(10,2);
  ALTER TABLE caja_sesiones  ADD COLUMN IF NOT EXISTS notas           TEXT;
  ALTER TABLE caja_sesiones  ADD COLUMN IF NOT EXISTS creado_en       TIMESTAMPTZ DEFAULT NOW();
  ALTER TABLE caja_sesiones  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ DEFAULT NOW();
  ALTER TABLE caja_sesiones  ADD COLUMN IF NOT EXISTS deleted_at      TIMESTAMPTZ;
  ALTER TABLE movimientos_caja ADD COLUMN IF NOT EXISTS creado_en     TIMESTAMPTZ DEFAULT NOW();
  ALTER TABLE movimientos_caja ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ DEFAULT NOW();
  ALTER TABLE movimientos_caja ADD COLUMN IF NOT EXISTS deleted_at    TIMESTAMPTZ;
  ALTER TABLE gastos         ADD COLUMN IF NOT EXISTS creado_en       TIMESTAMPTZ DEFAULT NOW();
  ALTER TABLE gastos         ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ DEFAULT NOW();
  ALTER TABLE gastos         ADD COLUMN IF NOT EXISTS deleted_at      TIMESTAMPTZ;
  ALTER TABLE orden_detalles ADD COLUMN IF NOT EXISTS creado_en       TIMESTAMPTZ DEFAULT NOW();
  ALTER TABLE orden_detalles ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ DEFAULT NOW();
  ALTER TABLE inventario_movimientos ADD COLUMN IF NOT EXISTS unidad            VARCHAR(20);
  ALTER TABLE inventario_movimientos ADD COLUMN IF NOT EXISTS costo_unitario    NUMERIC(10,2);
  ALTER TABLE inventario_movimientos ADD COLUMN IF NOT EXISTS total             NUMERIC(12,2);
  ALTER TABLE inventario_movimientos ADD COLUMN IF NOT EXISTS proveedor_id       UUID REFERENCES proveedores(id);
  ALTER TABLE inventario_movimientos ADD COLUMN IF NOT EXISTS orden_id           UUID REFERENCES ordenes(id);
  ALTER TABLE inventario_movimientos ADD COLUMN IF NOT EXISTS creado_en          TIMESTAMPTZ DEFAULT NOW();
  ALTER TABLE inventario_movimientos ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ DEFAULT NOW();
  ALTER TABLE inventario_movimientos ADD COLUMN IF NOT EXISTS deleted_at         TIMESTAMPTZ;
  ALTER TABLE cocina_tickets ADD COLUMN IF NOT EXISTS creado_en           TIMESTAMPTZ DEFAULT NOW();
  ALTER TABLE cocina_tickets ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMPTZ DEFAULT NOW();
  ALTER TABLE perfiles       ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMPTZ DEFAULT NOW();
  ALTER TABLE perfiles       ADD COLUMN IF NOT EXISTS deleted_at          TIMESTAMPTZ;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;


-- ============================================================================
-- 13. FUNCIONES DE UTILIDAD
-- ============================================================================
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END $fn$;

CREATE OR REPLACE FUNCTION es_admin() RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth, extensions AS $fn$
BEGIN
  RETURN COALESCE(
    (SELECT rol = 'admin'::rol_usuario FROM perfiles WHERE id = auth.uid()),
    false
  );
END $fn$;

-- ============================================================================
-- 14. AUDITORÍA AUTOMÁTICA (sensitive ops → registro_auditoria)
-- ============================================================================
CREATE OR REPLACE FUNCTION log_auditoria() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, extensions AS $$
DECLARE
  v_reg  UUID;
  v_user UUID;
  v_payload JSONB;
BEGIN
  v_user := auth.uid();
  IF TG_OP = 'DELETE' THEN
    v_payload := to_jsonb(OLD);
    v_reg := OLD.id;
  ELSE
    v_payload := to_jsonb(NEW);
    v_reg := NEW.id;
  END IF;
  INSERT INTO registro_auditoria (usuario_id, accion, tabla_afectada, registro_id, detalles)
  VALUES (v_user, TG_OP, TG_TABLE_NAME, v_reg, v_payload);
  RETURN COALESCE(NEW, OLD);
END $$;

-- Trigger factory idempotente para auditoría
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'productos','inventario','ordenes','caja_sesiones','gastos',
    'price_lists','price_list_items','compras','perfiles'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_audit_%I ON %I;
       CREATE TRIGGER trg_audit_%I AFTER INSERT OR UPDATE OR DELETE ON %I
       FOR EACH ROW EXECUTE FUNCTION log_auditoria();',
      t, t, t, t
    );
  END LOOP;
END $$;

-- ============================================================================
-- 15. TRIGGERS updated_at EN TODAS LAS TABLAS SINCRONIZADAS (crítico para sync)
-- ============================================================================
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'perfiles','categorias','productos','proveedores','inventario','recetas',
    'caja_sesiones','movimientos_caja','gastos','compras','compra_detalles',
    'ordenes','orden_detalles','pagos','cocina_tickets','inventario_movimientos',
    'price_lists','price_list_items','price_history','configuracion'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_touch_%I ON %I;
       CREATE TRIGGER trg_touch_%I BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      t, t, t, t
    );
  END LOOP;
END $$;

-- ============================================================================
-- 16. TRIGGERS DE COCINA (proyección de ordenes)
-- ============================================================================
CREATE OR REPLACE FUNCTION trg_enviar_orden_cocina() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, extensions AS $$
BEGIN
  INSERT INTO cocina_tickets (orden_id, numero_orden, estado)
  VALUES (NEW.id, NEW.numero_orden, NEW.estado);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_after_insert_orden ON ordenes;
CREATE TRIGGER trg_after_insert_orden
AFTER INSERT ON ordenes
FOR EACH ROW EXECUTE FUNCTION trg_enviar_orden_cocina();

CREATE OR REPLACE FUNCTION trg_sync_ticket_estado() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, extensions AS $$
BEGIN
  UPDATE cocina_tickets
  SET estado = NEW.estado,
      fecha_entregada = CASE WHEN NEW.estado = 'entregada' THEN NOW() ELSE fecha_entregada END
  WHERE orden_id = NEW.id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ordenes_estado_changed ON ordenes;
CREATE TRIGGER trg_ordenes_estado_changed
AFTER UPDATE OF estado ON ordenes
FOR EACH ROW
WHEN (OLD.estado IS DISTINCT FROM NEW.estado)
EXECUTE FUNCTION trg_sync_ticket_estado();


-- ============================================================================
-- 17. FUNCIONES DE NEGOCIO (endurecidas: search_path fijo + usuario requerido)
-- ============================================================================
CREATE OR REPLACE FUNCTION procesar_consumo_receta(p_orden_id UUID) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, extensions AS $$
DECLARE
  item RECORD;
  ingrediente RECORD;
  v_existencia_actual NUMERIC;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Operación requiere sesión autenticada.';
  END IF;
  FOR item IN SELECT producto_id, cantidad FROM orden_detalles WHERE orden_id = p_orden_id LOOP
    FOR ingrediente IN
      SELECT inventario_id, cantidad_requerida FROM recetas WHERE producto_id = item.producto_id
    LOOP
      SELECT existencia INTO v_existencia_actual FROM inventario WHERE id = ingrediente.inventario_id;
      IF v_existencia_actual < (ingrediente.cantidad_requerida * item.cantidad) THEN
        RAISE EXCEPTION 'Stock insuficiente para el ingrediente %', ingrediente.inventario_id;
      END IF;
      UPDATE inventario
      SET existencia = existencia - (ingrediente.cantidad_requerida * item.cantidad),
          updated_at = NOW()
      WHERE id = ingrediente.inventario_id;
      INSERT INTO inventario_movimientos
        (inventario_id, tipo, cantidad, existencia_anterior, existencia_resultante,
         usuario_id, motivo, orden_id)
      VALUES (
        ingrediente.inventario_id, 'consumo_venta',
        (ingrediente.cantidad_requerida * item.cantidad),
        v_existencia_actual, v_existencia_actual - (ingrediente.cantidad_requerida * item.cantidad),
        auth.uid(), 'Consumo automático por Orden ' || p_orden_id, p_orden_id
      );
    END LOOP;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION cobrar_orden(p_orden_id UUID, p_metodo_pago metodo_pago)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, extensions AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Operación requiere sesión autenticada.';
  END IF;
  UPDATE ordenes
  SET estado = 'entregada', metodo_pago = p_metodo_pago, pagado = true, updated_at = NOW()
  WHERE id = p_orden_id AND estado != 'entregada' AND estado != 'anulada';
  IF NOT FOUND THEN RAISE EXCEPTION 'Orden no válida.'; END IF;
  UPDATE cocina_tickets
  SET estado = 'entregada', fecha_entregada = NOW(), updated_at = NOW()
  WHERE orden_id = p_orden_id;
  PERFORM procesar_consumo_receta(p_orden_id);
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION cerrar_caja(p_sesion_id UUID, p_declarado NUMERIC)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, extensions AS $$
DECLARE
  v_estado         VARCHAR;
  v_inicial        NUMERIC;
  v_ventas_efectivo NUMERIC := 0;
  v_ventas_mixto   NUMERIC := 0;
  v_entradas       NUMERIC := 0;
  v_salidas        NUMERIC := 0;
  v_gastos_caja    NUMERIC := 0;
  v_propinas       NUMERIC := 0;
  v_esperado       NUMERIC := 0;
  v_diferencia     NUMERIC := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Operación requiere sesión autenticada.';
  END IF;

  SELECT estado, monto_inicial INTO v_estado, v_inicial FROM caja_sesiones WHERE id = p_sesion_id;
  IF v_estado IS NULL THEN RAISE EXCEPTION 'Sesión de caja no encontrada.'; END IF;
  IF v_estado != 'abierta' THEN RAISE EXCEPTION 'Caja no abierta.'; END IF;

  -- Ventas en efectivo puro
  SELECT COALESCE(SUM(total - COALESCE(propina,0)), 0) INTO v_ventas_efectivo
  FROM ordenes WHERE caja_sesion_id = p_sesion_id AND metodo_pago = 'efectivo' AND estado = 'entregada';

  -- Pagos mixtos: en efectivo registrado en pagos (metodo='mixto' => la parte efectiva)
  SELECT COALESCE(SUM(monto), 0) INTO v_ventas_mixto
  FROM pagos p JOIN ordenes o ON o.id = p.orden_id
  WHERE o.caja_sesion_id = p_sesion_id AND p.metodo = 'efectivo' AND o.estado = 'entregada';

  SELECT COALESCE(SUM(monto), 0) INTO v_entradas
  FROM movimientos_caja WHERE caja_sesion_id = p_sesion_id AND tipo = 'entrada';

  SELECT COALESCE(SUM(monto), 0) INTO v_salidas
  FROM movimientos_caja WHERE caja_sesion_id = p_sesion_id AND tipo = 'retiro';

  -- Gastos que salieron de caja (fuente única: tabla gastos; NO recontar en movimientos_caja)
  SELECT COALESCE(SUM(monto), 0) INTO v_gastos_caja
  FROM gastos WHERE caja_sesion_id = p_sesion_id AND salio_de_caja = true;

  -- Propinas cobradas en efectivo
  SELECT COALESCE(SUM(propina), 0) INTO v_propinas
  FROM ordenes WHERE caja_sesion_id = p_sesion_id AND metodo_pago = 'efectivo' AND estado = 'entregada';

  v_esperado := v_inicial + v_ventas_efectivo + v_ventas_mixto + v_entradas - v_salidas - v_gastos_caja + v_propinas;
  v_diferencia := p_declarado - v_esperado;

  UPDATE caja_sesiones
  SET estado = 'cerrada', monto_esperado = v_esperado, monto_declarado = p_declarado,
      diferencia = v_diferencia, fecha_cierre = NOW(), updated_at = NOW()
  WHERE id = p_sesion_id;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION reporte_resumen(p_fecha_inicio DATE, p_fecha_fin DATE)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, extensions AS $$
DECLARE resultado JSON;
BEGIN
  SELECT json_build_object(
    'ventas_totales',   COALESCE(SUM(total), 0),
    'cantidad_ordenes', COUNT(id),
    'ticket_promedio',  CASE WHEN COUNT(id) > 0 THEN COALESCE(SUM(total) / COUNT(id), 0) ELSE 0 END,
    'itbis_recaudado',  COALESCE(SUM(itbis), 0),
    'propinas',         COALESCE(SUM(propina), 0),
    'descuentos',       COALESCE(SUM(descuento), 0)
  )
  INTO resultado
  FROM ordenes
  WHERE estado = 'entregada'
    AND DATE(fecha_creacion AT TIME ZONE 'America/Santo_Domingo') BETWEEN p_fecha_inicio AND p_fecha_fin;
  RETURN resultado;
END $$;


-- ============================================================================
-- 18. VISTAS SEGURAS (security_invoker respeta RLS del caller)
-- ============================================================================
DROP VIEW IF EXISTS v_productos_pos;
CREATE VIEW v_productos_pos WITH (security_invoker = true) AS
SELECT id, codigo, categoria_id, nombre, descripcion, precio, tasa_itbis,
       itbis_incluido, imagen_url, emoji, color, activo, disponible
FROM productos WHERE activo = true AND disponible = true AND deleted_at IS NULL;

DROP VIEW IF EXISTS v_inventario_cocina;
CREATE VIEW v_inventario_cocina WITH (security_invoker = true) AS
SELECT id, nombre, unidad_medida, existencia, activo
FROM inventario WHERE activo = true AND deleted_at IS NULL;

DROP VIEW IF EXISTS v_articulos_bajo_stock;
CREATE VIEW v_articulos_bajo_stock WITH (security_invoker = true) AS
SELECT id, nombre, unidad_medida, existencia, stock_minimo
FROM inventario WHERE existencia <= stock_minimo AND activo = true AND deleted_at IS NULL;


-- ============================================================================
-- 19. RLS (Row Level Security) — modo producción por defecto
-- Regla general:
--   SELECT  → todos los usuarios autenticados
--   WRITE   → solo admin (catálogo, precios, compras)
--   WRITE   → autenticados (ventas, cocina, caja propia, gastos propios,
--             movimientos de inventario que registra la app)
-- F3 endurecerá con granularidad por acción.
-- ============================================================================
ALTER TABLE perfiles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias              ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos               ENABLE ROW LEVEL SECURITY;
ALTER TABLE proveedores             ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario              ENABLE ROW LEVEL SECURITY;
ALTER TABLE recetas                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE caja_sesiones           ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_caja        ENABLE ROW LEVEL SECURITY;
ALTER TABLE gastos                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE compras                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE compra_detalles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordenes                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE orden_detalles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE cocina_tickets          ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario_movimientos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE registro_auditoria      ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_lists             ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_list_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history           ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracion           ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 19.1 LECTURA (todos autenticados)
-- ----------------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'perfiles','categorias','productos','proveedores','inventario','recetas',
    'caja_sesiones','movimientos_caja','gastos','compras','compra_detalles',
    'ordenes','orden_detalles','pagos','cocina_tickets','inventario_movimientos',
    'price_lists','price_list_items','price_history','configuracion'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "leer_%s" ON %I;', t, t);
    EXECUTE format(
      'CREATE POLICY "leer_%s" ON %I FOR SELECT TO authenticated USING (true);',
      t, t
    );
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 19.2 OPERATIVO: autenticados pueden leer y escribir
--     (ventas → cocina → caja del propio usuario → gastos propios)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "operativo_ordenes" ON ordenes;
CREATE POLICY "operativo_ordenes" ON ordenes FOR ALL TO authenticated
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "operativo_detalles" ON orden_detalles;
CREATE POLICY "operativo_detalles" ON orden_detalles FOR ALL TO authenticated
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "operativo_pagos" ON pagos;
CREATE POLICY "operativo_pagos" ON pagos FOR ALL TO authenticated
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "operativo_tickets" ON cocina_tickets;
CREATE POLICY "operativo_tickets" ON cocina_tickets FOR ALL TO authenticated
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "operativo_movs" ON inventario_movimientos;
CREATE POLICY "operativo_movs" ON inventario_movimientos FOR ALL TO authenticated
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "operativo_caja_sesiones" ON caja_sesiones;
CREATE POLICY "operativo_caja_sesiones" ON caja_sesiones FOR ALL TO authenticated
USING (usuario_id = auth.uid() OR es_admin()) WITH CHECK (usuario_id = auth.uid() OR es_admin());

DROP POLICY IF EXISTS "operativo_caja_movs" ON movimientos_caja;
CREATE POLICY "operativo_caja_movs" ON movimientos_caja FOR ALL TO authenticated
USING (usuario_id = auth.uid() OR es_admin()) WITH CHECK (usuario_id = auth.uid() OR es_admin());

DROP POLICY IF EXISTS "operativo_gastos" ON gastos;
CREATE POLICY "operativo_gastos" ON gastos FOR ALL TO authenticated
USING (usuario_id = auth.uid() OR es_admin()) WITH CHECK (usuario_id = auth.uid() OR es_admin());

-- ----------------------------------------------------------------------------
-- 19.3 ADMIN: catálogo, precios, compras y configuración
-- ----------------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'perfiles','categorias','productos','proveedores','inventario','recetas',
    'price_lists','price_list_items','price_history',
    'compras','compra_detalles','configuracion'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "admin_%s" ON %I;', t, t);
    EXECUTE format(
      'CREATE POLICY "admin_%s" ON %I FOR ALL TO authenticated
       USING (es_admin()) WITH CHECK (es_admin());',
      t, t
    );
  END LOOP;
END $$;

-- perfiles: administradores visibles por todo; auto-servicio de perfil propio.
DROP POLICY IF EXISTS "perfiles_lectura" ON perfiles;
CREATE POLICY "perfiles_lectura" ON perfiles FOR SELECT TO authenticated
USING (id = auth.uid() OR es_admin());
-- (la policy "admin_perfiles" de 19.3 cubre UPDATE/DELETE por rol admin;
--  el auto-update de perfil propio se agrega en F3.)

-- ----------------------------------------------------------------------------
-- 19.4 AUDITORÍA: INSERT via trigger/SECURITY DEFINER; SELECT solo admin
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "admin_auditoria" ON registro_auditoria;
CREATE POLICY "admin_auditoria" ON registro_auditoria FOR SELECT TO authenticated
USING (es_admin());

-- ----------------------------------------------------------------------------
-- 19.5 (OPCIONAL) MODO PRUEBAS con anon key sin login
-- Descomentar SOLO en el entorno de pruebas para permitir el demonstrativo
-- del app sin sesión Supabase. NUNCA dejar activo en producción.
-- ----------------------------------------------------------------------------
-- DO $$
-- DECLARE t TEXT;
-- BEGIN
--   FOREACH t IN ARRAY ARRAY[
--     'perfiles','categorias','productos','proveedores','inventario','recetas',
--     'caja_sesiones','movimientos_caja','gastos','compras','compra_detalles',
--     'ordenes','orden_detalles','pagos','cocina_tickets','inventario_movimientos',
--     'price_lists','price_list_items','price_history','configuracion',
--     'registro_auditoria'
--   ] LOOP
--     EXECUTE format('DROP POLICY IF EXISTS "demo_anon_%s" ON %I;', t, t);
--     EXECUTE format(
--       'CREATE POLICY "demo_anon_%s" ON %I FOR ALL TO anon
--        USING (true) WITH CHECK (true);', t, t
--     );
--   END LOOP;
-- END $$;


-- ============================================================================
-- 20. GRANTS (Supabase ya habilita REST por defecto; explícito por seguridad)
-- ============================================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;


-- ============================================================================
-- 21. SEED (idempotente; solo si las tablas están vacías)
-- ============================================================================
DO $$
DECLARE
  v_cat_alitas UUID;
  v_cat_pechugas UUID;
  v_cat_combos UUID;
  v_cat_fritos UUID;
  v_cat_acomp UUID;
  v_cat_bebidas UUID;
  v_cat_extras UUID;
  v_cat_salsas UUID;
  v_inv_alitas UUID;
  v_inv_pechugas UUID;
  v_inv_papas UUID;
  v_inv_aceite UUID;
  v_inv_coca UUID;
  v_inv_cajas UUID;
  v_inv_salsa UUID;
  v_prod_alitas6 UUID;
  v_prod_papas UUID;
  v_prod_coca UUID;
  v_prod_pechuga UUID;
  v_prod_combo UUID;
  v_lista_base UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM categorias) AND EXISTS (SELECT 1 FROM productos)
     AND EXISTS (SELECT 1 FROM recetas) AND EXISTS (SELECT 1 FROM inventario) THEN
    RAISE NOTICE 'Seed omitido: ya hay datos.';
    RETURN;
  END IF;

  -- 21.1 categorías (orden de la ficha)
  INSERT INTO categorias (nombre, orden) VALUES ('Alitas', 1)
    ON CONFLICT (nombre) DO NOTHING RETURNING id INTO v_cat_alitas;
  INSERT INTO categorias (nombre, orden) VALUES ('Pechugas', 2)
    ON CONFLICT (nombre) DO NOTHING RETURNING id INTO v_cat_pechugas;
  INSERT INTO categorias (nombre, orden) VALUES ('Combos', 3)
    ON CONFLICT (nombre) DO NOTHING RETURNING id INTO v_cat_combos;
  INSERT INTO categorias (nombre, orden) VALUES ('Fritos', 4)
    ON CONFLICT (nombre) DO NOTHING RETURNING id INTO v_cat_fritos;
  INSERT INTO categorias (nombre, orden) VALUES ('Acompañamientos', 5)
    ON CONFLICT (nombre) DO NOTHING RETURNING id INTO v_cat_acomp;
  INSERT INTO categorias (nombre, orden) VALUES ('Bebidas', 6)
    ON CONFLICT (nombre) DO NOTHING RETURNING id INTO v_cat_bebidas;
  INSERT INTO categorias (nombre, orden) VALUES ('Extras', 7)
    ON CONFLICT (nombre) DO NOTHING RETURNING id INTO v_cat_extras;
  INSERT INTO categorias (nombre, orden) VALUES ('Salsas', 8)
    ON CONFLICT (nombre) DO NOTHING RETURNING id INTO v_cat_salsas;

  -- 21.2 proveedores demo
  INSERT INTO proveedores (nombre_empresa, contacto_nombre, telefono, email)
  SELECT 'Distribuidora del Caribe', 'Carlos Jiménez', '809-555-0200', 'compras@distri-cari.do'
  WHERE NOT EXISTS (SELECT 1 FROM proveedores WHERE nombre_empresa = 'Distribuidora del Caribe');
  INSERT INTO proveedores (nombre_empresa, contacto_nombre, telefono, email)
  SELECT 'Bebidas RD', 'María Santos', '809-555-0210', 'pedidos@bebidasrd.do'
  WHERE NOT EXISTS (SELECT 1 FROM proveedores WHERE nombre_empresa = 'Bebidas RD');

  -- 21.3 inventario
  INSERT INTO inventario (nombre, categoria, unidad_medida, costo_unitario, existencia, stock_minimo)
  VALUES ('Alitas Crudas', 'Proteínas', 'lb', 65.00, 100.00, 20.00)
  RETURNING id INTO v_inv_alitas;
  INSERT INTO inventario (nombre, categoria, unidad_medida, costo_unitario, existencia, stock_minimo)
  VALUES ('Pechugas Crudas', 'Proteínas', 'lb', 72.00, 80.00, 16.00)
  RETURNING id INTO v_inv_pechugas;
  INSERT INTO inventario (nombre, categoria, unidad_medida, costo_unitario, existencia, stock_minimo)
  VALUES ('Papas Fritas Congeladas', 'Congelados', 'lb', 45.00, 50.00, 10.00)
  RETURNING id INTO v_inv_papas;
  INSERT INTO inventario (nombre, categoria, unidad_medida, costo_unitario, existencia, stock_minimo)
  VALUES ('Aceite Vegetal', 'Insumos', 'lts', 250.00, 4.00, 2.00)
  RETURNING id INTO v_inv_aceite;
  INSERT INTO inventario (nombre, categoria, unidad_medida, costo_unitario, existencia, stock_minimo)
  VALUES ('Salsa BBQ', 'Salsas', 'und', 120.00, 12.00, 3.00)
  RETURNING id INTO v_inv_salsa;
  INSERT INTO inventario (nombre, categoria, unidad_medida, costo_unitario, existencia, stock_minimo)
  VALUES ('Coca Cola Normal', 'Bebidas', 'und', 25.00, 48.00, 12.00)
  RETURNING id INTO v_inv_coca;
  INSERT INTO inventario (nombre, categoria, unidad_medida, costo_unitario, existencia, stock_minimo)
  VALUES ('Cajas de Empaque (Logo)', 'Empaques', 'und', 15.00, 500.00, 50.00)
  RETURNING id INTO v_inv_cajas;

  -- 21.4 productos
  INSERT INTO productos (codigo, categoria_id, nombre, precio, costo_estimado, emoji, color)
  VALUES ('ALI-006', v_cat_alitas, '6 Alitas Clásicas', 350.00, 145.00, '🍗', 'coral')
  RETURNING id INTO v_prod_alitas6;
  INSERT INTO productos (codigo, categoria_id, nombre, precio, costo_estimado, emoji, color)
  VALUES ('ALI-BBQ', v_cat_alitas, '8 Alitas BBQ', 420.00, 175.00, '🍗', 'gold')
  RETURNING id INTO v_prod_pechuga; -- se reutiliza como segunda alita para receta
  INSERT INTO productos (codigo, categoria_id, nombre, precio, costo_estimado, emoji, color)
  VALUES ('EXT-PAP', v_cat_acomp, 'Porción de Papas', 150.00, 60.00, '🍟', 'yellow')
  RETURNING id INTO v_prod_papas;
  INSERT INTO productos (codigo, categoria_id, nombre, precio, costo_estimado, emoji, color)
  VALUES ('BEB-COC', v_cat_bebidas, 'Coca Cola', 80.00, 25.00, '🥤', 'cream')
  RETURNING id INTO v_prod_coca;
  INSERT INTO productos (codigo, categoria_id, nombre, precio, costo_estimado, emoji, color)
  VALUES ('COM-PLE', v_cat_combos, 'Combo Pleiboi', 520.00, 215.00, '🌟', 'green')
  RETURNING id INTO v_prod_combo;

  -- 21.5 recetas
  INSERT INTO recetas (producto_id, inventario_id, cantidad_requerida)
  VALUES (v_prod_alitas6, v_inv_alitas, 1.00);
  INSERT INTO recetas (producto_id, inventario_id, cantidad_requerida)
  VALUES (v_prod_alitas6, v_inv_cajas, 1.00);
  INSERT INTO recetas (producto_id, inventario_id, cantidad_requerida)
  VALUES (v_prod_pechuga, v_inv_alitas, 1.20);
  INSERT INTO recetas (producto_id, inventario_id, cantidad_requerida)
  VALUES (v_prod_pechuga, v_inv_salsa, 1.00);
  INSERT INTO recetas (producto_id, inventario_id, cantidad_requerida)
  VALUES (v_prod_pechuga, v_inv_cajas, 1.00);
  INSERT INTO recetas (producto_id, inventario_id, cantidad_requerida)
  VALUES (v_prod_papas, v_inv_papas, 0.50);
  INSERT INTO recetas (producto_id, inventario_id, cantidad_requerida)
  VALUES (v_prod_papas, v_inv_aceite, 0.10);
  INSERT INTO recetas (producto_id, inventario_id, cantidad_requerida)
  VALUES (v_prod_coca, v_inv_coca, 1.00);
  INSERT INTO recetas (producto_id, inventario_id, cantidad_requerida)
  VALUES (v_prod_combo, v_inv_alitas, 1.00);
  INSERT INTO recetas (producto_id, inventario_id, cantidad_requerida)
  VALUES (v_prod_combo, v_inv_papas, 0.50);
  INSERT INTO recetas (producto_id, inventario_id, cantidad_requerida)
  VALUES (v_prod_combo, v_inv_coca, 1.00);
  INSERT INTO recetas (producto_id, inventario_id, cantidad_requerida)
  VALUES (v_prod_combo, v_inv_cajas, 1.00);

  -- 21.6 talonario base (Mostrador)
  INSERT INTO price_lists (nombre, canal, moneda, activa)
  VALUES ('Base Mostrador', 'Mostrador', 'RD$', true) RETURNING id INTO v_lista_base;
  INSERT INTO price_list_items (lista_id, producto_id, precio)
  SELECT v_lista_base, id, precio FROM productos WHERE activo = true;

  RAISE NOTICE 'Seed aplicado: categorías, proveedores, inventario, recetas, productos y lista base.';
END $$;


-- ============================================================================
-- 22. POST-SEED (requiere UDP Shell / Auth Dashboard, ver README):
--   1) Crear usuario admin en Auth (Dashboard → Authentication → Users → Add)
--   2) Insertar su perfil:
--      INSERT INTO perfiles (id, nombre, rol)
--      VALUES ('<uuid-del-usuario>', 'Admin Pollito', 'admin');
-- ============================================================================

https://zoitwxgkawpiwgziomsn.supabase.co/rest/v1/
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaXR3eGdrYXdwaXdnemlvbXNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM1NTczMDEsImV4cCI6MjEwOTEzMzMwMX0.9HbmDlm1Ze3t3aUOb2lKFF9cphRPEfAYHHfTkYLTiIc