-- 1. TIPOS PERSONALIZADOS (ENUMS)
CREATE TYPE rol_usuario AS ENUM ('admin', 'cajero', 'cocinero');
CREATE TYPE estado_orden AS ENUM ('nueva', 'preparando', 'lista', 'entregada', 'anulada');
CREATE TYPE tipo_movimiento_inv AS ENUM ('entrada', 'consumo_venta', 'merma', 'desperdicio', 'ajuste', 'devolucion', 'consumo_interno');
CREATE TYPE metodo_pago AS ENUM ('efectivo', 'tarjeta', 'transferencia', 'mixto');
CREATE TYPE tipo_movimiento_caja AS ENUM ('entrada', 'retiro', 'gasto');

-- 2. USUARIOS
CREATE TABLE perfiles (
    id UUID REFERENCES auth.users(id) PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    rol rol_usuario NOT NULL DEFAULT 'cajero',
    pin_autorizacion VARCHAR(6),
    activo BOOLEAN DEFAULT true,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. CATÁLOGOS Y PRODUCTOS
CREATE TABLE categorias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(50) NOT NULL UNIQUE,
    orden INT DEFAULT 0,
    activa BOOLEAN DEFAULT true
);

CREATE TABLE productos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo VARCHAR(20) UNIQUE NOT NULL,
    categoria_id UUID REFERENCES categorias(id),
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT,
    precio NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    costo_estimado NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    tasa_itbis NUMERIC(5,2) DEFAULT 18.00,
    imagen_url TEXT,
    activo BOOLEAN DEFAULT true,
    disponible BOOLEAN DEFAULT true,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. PROVEEDORES E INVENTARIO
CREATE TABLE proveedores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre_empresa VARCHAR(100) NOT NULL,
    contacto_nombre VARCHAR(100),
    telefono VARCHAR(20),
    activo BOOLEAN DEFAULT true
);

CREATE TABLE inventario (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(100) NOT NULL,
    unidad_medida VARCHAR(20) NOT NULL,
    costo_unitario NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    existencia NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (existencia >= 0),
    stock_minimo NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    proveedor_pref_id UUID REFERENCES proveedores(id),
    activo BOOLEAN DEFAULT true
);

CREATE TABLE recetas (
    producto_id UUID REFERENCES productos(id) ON DELETE CASCADE,
    inventario_id UUID REFERENCES inventario(id) ON DELETE RESTRICT,
    cantidad_requerida NUMERIC(10,4) NOT NULL CHECK (cantidad_requerida > 0),
    PRIMARY KEY (producto_id, inventario_id)
);

-- 5. CAJA Y GASTOS
CREATE TABLE caja_sesiones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID REFERENCES perfiles(id) NOT NULL,
    monto_inicial NUMERIC(10,2) NOT NULL,
    monto_esperado NUMERIC(10,2),
    monto_declarado NUMERIC(10,2),
    fecha_apertura TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    fecha_cierre TIMESTAMP WITH TIME ZONE,
    estado VARCHAR(20) DEFAULT 'abierta' CHECK (estado IN ('abierta', 'cerrada'))
);

CREATE TABLE movimientos_caja (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    caja_sesion_id UUID REFERENCES caja_sesiones(id) ON DELETE CASCADE,
    tipo tipo_movimiento_caja NOT NULL,
    monto NUMERIC(10,2) NOT NULL CHECK (monto > 0),
    concepto TEXT NOT NULL,
    fecha TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    usuario_id UUID REFERENCES perfiles(id) NOT NULL
);

CREATE TABLE gastos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    categoria VARCHAR(50) NOT NULL,
    descripcion TEXT,
    monto NUMERIC(10,2) NOT NULL CHECK (monto > 0),
    fecha TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    usuario_id UUID REFERENCES perfiles(id) NOT NULL,
    salio_de_caja BOOLEAN DEFAULT false,
    caja_sesion_id UUID REFERENCES caja_sesiones(id)
);

-- 6. VENTAS Y COCINA
CREATE TABLE ordenes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_orden SERIAL,
    caja_sesion_id UUID REFERENCES caja_sesiones(id) NOT NULL,
    usuario_id UUID REFERENCES perfiles(id) NOT NULL,
    subtotal NUMERIC(10,2) NOT NULL,
    descuento NUMERIC(10,2) DEFAULT 0.00,
    itbis NUMERIC(10,2) NOT NULL,
    total NUMERIC(10,2) NOT NULL,
    metodo_pago metodo_pago,
    estado estado_orden DEFAULT 'nueva',
    fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE orden_detalles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    orden_id UUID REFERENCES ordenes(id) ON DELETE CASCADE,
    producto_id UUID REFERENCES productos(id),
    nombre_snapshot VARCHAR(100) NOT NULL,
    cantidad INT NOT NULL CHECK (cantidad > 0),
    precio_unitario NUMERIC(10,2) NOT NULL,
    costo_unitario NUMERIC(10,2) NOT NULL,
    itbis_aplicado NUMERIC(10,2) NOT NULL,
    notas TEXT
);

CREATE TABLE cocina_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    orden_id UUID REFERENCES ordenes(id) UNIQUE NOT NULL,
    numero_orden INT NOT NULL,
    estado estado_orden DEFAULT 'nueva',
    fecha_entrada TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    fecha_entregada TIMESTAMP WITH TIME ZONE
);

-- 7. AUDITORÍA
CREATE TABLE inventario_movimientos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventario_id UUID REFERENCES inventario(id) NOT NULL,
    tipo tipo_movimiento_inv NOT NULL,
    cantidad NUMERIC(10,2) NOT NULL,
    existencia_anterior NUMERIC(10,2) NOT NULL,
    existencia_resultante NUMERIC(10,2) NOT NULL,
    usuario_id UUID REFERENCES perfiles(id) NOT NULL,
    motivo TEXT,
    fecha TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE registro_auditoria (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID REFERENCES perfiles(id),
    accion VARCHAR(100) NOT NULL,
    tabla_afectada VARCHAR(50),
    registro_id UUID,
    detalles JSONB,
    fecha TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);