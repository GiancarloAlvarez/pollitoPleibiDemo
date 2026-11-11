# Caja, comprobantes comerciales y relaciones Supabase

## Alcance implementado

Validación local solicitada por el usuario. No se consultaron ni modificaron ventas
del Supabase real y no se desplegó SQL. El respaldo de archivos anterior al cambio está en:
`C:\Users\jean2\AppData\Local\Temp\opencode\pollito-before-cash-receipt-20261111.zip`.

### Componentes reutilizados y personalizados

| Componente | Cambio |
|---|---|
| Modal existente | Mantiene botones/estilos; captura Tab/Shift+Tab, retorna foco, evita doble submit y elimina temporizador que robaba el foco. |
| Cabecera del POS | Reemplaza «Caja #01 abierta RD$12,500» fijo por sesión del cajero, fondo inicial y acciones Abrir/Consultar/Actualizar. |
| Checkout | Efectivo recibido, insuficiencia y cambio. Tarjeta/Transferencia no generan cambio en efectivo. |
| Órdenes | Nueva ruta `#/ordenes`: búsqueda, vendedor, pago/cocina separados y acceso al comprobante. |
| Comprobante | Vista previa y diálogo de impresión del navegador: 58 mm, 80 mm o A4/PDF. Reimpresión sin escritura de venta/pago. |
| Exportación | Añade vendedor y referencia de caja a la hoja de ventas. |
| Identidad | SVG propio de pollito amarillo con traje azul, basado en la imagen del chat; no es copia exacta del bitmap adjunto. PNG 32/180/192/512, favicon/PWA y caché versionada. |

El comprobante es comercial, no fiscal. Preserva datos del negocio al vender,
productos/precios/costos históricos, cajero, caja, recibido y cambio. Los campos de texto
se escapan. Los documentos de cuentas demo se identifican sin valor comercial.
En registros antiguos sin snapshot no se inventan datos: puede faltar el vendedor,
la caja, el cambio o la información comercial histórica.

## Flujo actual

1. Cajero/admin entra al POS y abre caja con fondo inicial.
2. Con identidad Supabase, `abrir_caja(p_id,p_monto)` confirma en servidor propietario,
   perfil activo, rol, monto, unicidad de caja abierta y repetición del mismo ID.
   La apertura remota necesita conexión. «Actualizar caja» recupera sesiones existentes
   después de perder una respuesta o cambiar de terminal.
3. Sin identidad remota, la UI identifica la apertura como demo. Conserva estas ventas
   localmente y en su cola para respaldo; no las envía al proyecto real ni las usa para
   bloquear el envío de ventas reales posteriores. El badge continúa mostrando pendientes.
4. La venta independiente guarda orden y outbox en una transacción IndexedDB.
   Asocia vendedor y caja, captura datos del comprobante y no cambia a Entregada por cobrar.
5. Después de cobrar se navega a Órdenes para consultar/imprimir. Enviar a cocina mantiene
   el flujo existente. El mensaje de cobro confirma guardado local, no éxito remoto.
6. Sync construye cabecera, detalles y pago desde la orden **local original**. Antes se
   pasaba la cabecera ya traducida a funciones que requerían `items/paid/payment_method`.
7. Tras los upserts se relee la composición remota. Solo se retira el pendiente si cabecera,
   líneas completas y pago (o ausencia de pago para pendiente) coinciden. Un 204/200 vacío
   no cuenta como confirmación. El pull protege órdenes con cambios pendientes y no borra
   líneas locales al recibir una cabecera sin detalles.

La apertura del modo LAN existente todavía requiere integrar sesiones en SQLite/servicio
local y su futura salida a nube. La UI lo muestra explícitamente; no presenta una caja
ficticia ni envía sus comandos directamente a Supabase. Las pruebas LAN existentes pasan.

## Relaciones de datos y migración propuesta

| Relación/campo | Contrato |
|---|---|
| `auth.users.id → perfiles.id` | Identidad remota real; no usar UUID de usuario demo como FK. |
| `caja_sesiones.usuario_id → perfiles.id` | Responsable autenticado; una abierta por usuario (regla elegida para este módulo). |
| `ordenes.usuario_id → perfiles.id` | Vendedor original; no reasignarlo por el usuario que imprime o sincroniza. |
| `ordenes.caja_sesion_id → caja_sesiones.id` | Caja propia y abierta para nuevas ventas vinculadas. |
| `orden_detalles.orden_id → ordenes.id` | Obligatorio; producto referenciado por ID y precio/costo snapshot preservados. |
| `pagos.orden_id → ordenes.id` | Obligatorio; pago solo si la orden está pagada, método original y monto total. |
| `cocina_tickets.orden_id → ordenes.id` | Proyección operativa separada del cobro. No se utiliza la antigua RPC `cobrar_orden`. |
| `ordenes.vendedor_nombre` | Snapshot asignado por trigger desde perfil en nuevas ventas con caja. |
| `ordenes.comprobante_negocio` | JSON del negocio al emitir, conservado en ida/vuelta. |
| `ordenes.efectivo_recibido`, `cambio` | Importe recibido y diferencia, comprobados para venta con caja. |

Archivos SQL:

- `supabase/diagnostico_ventas_caja.sql`: **solo SELECT** sobre columnas, composición de
  ventas, pagos, detalles, cajas duplicadas y policies. No confundir una respuesta vacía
  por RLS con ausencia de problemas. Los agregados de detalles y pagos se calculan por
  separado para evitar multiplicar importes al unir tablas.
- `supabase/20261111_caja_comprobantes.sql`: migración transaccional, sin seed. Se detiene
  si existen cajas abiertas duplicadas o pagos/detalles sin orden. Añade columnas de
  comprobante, NOT NULL en las relaciones orden-detalle/pago, índice único de caja,
  RPC de apertura y trigger para validar caja/vendedor. Restringe lectura de cajas y
  escritura directa de sesiones; apertura por RPC con privilegios explícitos.

### Aplicación y recuperación

1. En proyecto **de pruebas**, comparar el esquema desplegado y ejecutar diagnóstico con
   rol autorizado. El archivo `schema_completo.sql` original contiene seed y texto final
   no SQL; no es la migración a ejecutar sobre datos existentes.
2. Respaldar esquema/datos/policies del proyecto objetivo. Conciliar precondiciones sin
   borrar pendientes, pagos o cajas para hacer pasar la migración.
3. Aplicar la nueva migración antes de publicar este frontend. Sin sus columnas/RPC,
   apertura o sync fallarán y conservarán pendientes; no existe fallback anónimo.
4. Verificar con JWT reales de admin/cajero/cocina las FKs, políticas, reintento, apertura
   simultánea y una venta completa. Revisar policies adicionales: se combinan por OR.
5. Si falla durante ejecución, la transacción revierte. Si se requiere recuperación
   después del commit, detener nuevas operaciones, exportar sesiones/ventas nuevas y
   restaurar las definiciones previas desde el respaldo bajo una migración revisada.
   Conservar columnas/snapshots y datos nuevos; no ejecutar un DROP de tablas/columnas
   ni resembrar el negocio como mecanismo de rollback. El backup local de código no
   sustituye el backup de PostgreSQL.

### Reparación de ventas históricas

Usar IDs de orden y payloads de outbox/respaldo para comparar productos, cantidades,
precios, método y estado real de cobro. No reconstruir precios desde catálogo actual,
inferir un vendedor ni convertir un pendiente en efectivo. Si ya se borraron detalles
locales y la cola, la cabecera remota no permite recuperar por sí sola lo que se vendió.
El diagnóstico entrega candidatos a conciliación; este cambio no modifica esos datos
históricos automáticamente.

## Verificación local

Desde `tests/`:

- `npm run audit:sales`: **17 pasan**; SQL PGlite aislado y navegador con transporte simulado; incluye
  permisos/apertura/idempotencia, FKs, relación vendedor-caja, timeout, recibido/cambio,
  escape de texto, impresión sin duplicar venta y atomicidad local.
- `npm run audit:sync`: originalmente **1 pasa / 3 fallan**; ahora **4 pasan**.
  SYNC-01 comprueba dos filas remotas únicas y los cuatro intentos de escritura tras
  reintento. Cambió la aserción de contar dos HTTP a comprobar las dos filas y sus
  snapshots: los reenvíos legítimos no son ventas duplicadas. No se elimina el fallo de red.
- `npm run audit:e2e`: **2 pasan / 4 fallan**. Persisten ausencia de recetas (E1/E2),
  anulación (E3) y alerta al alcanzar stock mínimo (E4). E5 conserva precios y E6 permisos.
- `npm run audit:unit`: **4 pasan / 1 falla / 3 TODO**, fallo decimal histórico 10.075.
- `npm run audit:db`: **13 pasan / 12 fallan / 1 skip** sobre DDL base sin la nueva
  migración. Sus fallos generales de RLS/RPC/cierre/constraints siguen visibles.
- `npm run test:local`: **15 pasan**, servicio LAN existente.

Verificación de componentes en 360×800, 768×1024 y 1366×768; Tab/retorno del foco;
comprobante con texto #171717 sobre blanco. Service worker real y primera recarga offline
incluidos; el harness habitual bloquea el SW salvo este caso explícito. No se ensayó
una impresora física ni se considera una llamada a `print()` como entrega del papel.

## Pendientes aplicables

- Venta remota todavía usa varias peticiones REST: puede quedar parcial entre peticiones.
  Se detecta y conserva pendiente, pero falta una RPC de venta atómica e idempotente.
- Cierre/arqueo/retiros/gastos, cobro de órdenes pendientes, pagos mixtos y devoluciones
  requieren el siguiente módulo; no se añadieron acciones ficticias.
- La RPC antigua `cerrar_caja` conserva problemas de autorización y doble conteo;
  esta migración de apertura no la reescribe. Las policies generales de órdenes/detalles/
  pagos y funciones antiguas requieren endurecimiento integral antes de producción.
- La API aún no impide toda venta histórica/sin caja: se conserva compatibilidad con
  registros existentes. La UI nueva exige caja y el trigger valida las ventas vinculadas.
- Sincronización LAN→Supabase, conflictos multiconexión, paginación general y numeración
  global siguen pendientes. No se certifica despliegue, RLS/JWT reales ni producción.

## Archivos cambiados

- Datos: `js/core/db.js`, `repo.js`, `schema-map.js`, `sync.js`, `cash.js`, `excel.js`.
- UI: `js/components/modal.js`, `cash-session.js`, `receipt.js`; `js/views/pos.view.js`,
  `orders.view.js`; `js/core/router.js`, `js/app.js`; `css/07-sales.css`, `index.html`.
- Identidad/PWA: `assets/icons/pollito.svg`, `pollito-{32,180,192,512}.png`,
  `manifest.webmanifest`, `sw.js`. Los iconos originales quedan preservados sin referencias activas.
- SQL/docs: los dos SQL arriba, este documento y enlace en workflow de auditoría.
- Pruebas: `tests/audit/cash-database.test.mjs`, `cash-receipt.test.mjs`, `sync.test.mjs`,
  `browser-harness.mjs`, `tests/package.json`, `tests/render-brand-icons.mjs`.
