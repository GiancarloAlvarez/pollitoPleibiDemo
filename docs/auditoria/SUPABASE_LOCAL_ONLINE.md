# Supabase, operación local y sincronización online

Estado: propuesta técnica derivada de pruebas, **no migración aplicada**.
Complementa [informe](INFORME_FINAL.md), [inventario](INVENTARIO_SQL.md) y
[pruebas](../../tests/audit/README.md).

## 1. Qué se comprobó y qué no

- DDL ejecutado en PostgreSQL embebido con RLS, triggers y funciones reales del archivo.
- Identidad `auth.uid()` emulada; no se verificaron JWT, GoTrue ni PostgREST.
- GET anónimos al proyecto configurado: 21 tablas, HTTP 200 y cero filas en consultas limitadas.
- `testConnection()` comprueba `/auth/v1/settings`: demuestra acceso a Auth, **no**
  que las tablas, permisos, recetas, caja o sincronización estén operativos.
- No hubo cambios de datos/esquema en Supabase. Faltan credenciales de un proyecto de pruebas.

## 2. Entornos y modelo de identidad

| Entorno | Datos/identidad | Uso |
|---|---|---|
| Demo local | Usuarios y datos ficticios, aviso visible | Presentación sin afirmar integridad cloud |
| QA embebido | PGlite, fixtures y roles SQL emulados | Constraints, RLS y funciones del DDL |
| Supabase de pruebas | Usuarios Auth reales y perfiles aislados | JWT/REST, RPC, Realtime, concurrencia y recuperación |
| Producción | Datos del negocio y reglas aceptadas | Solo después de pasar Go/No-Go |

El rol canónico debe proceder de una autoridad controlada por servidor. `perfiles`
ya permite esa función: RLS y RPC deben consultar identidad, rol, activo y baja.
No usar `user_metadata.role` como autoridad. Un perfil/caché local modificable no
garantiza autorización remota; las operaciones deben volver a validarse al sincronizar.

Crear usuarios mediante Dashboard o servicio seguro que use Auth Admin API;
vincular `perfiles.id = auth.users.id` y verificar alta/baja de ambas partes.
Nunca poner service_role ni claves de firma en HTML, JS o configuración del navegador.
Resolver `remote_id` también cuando la cuenta ya existía en IndexedDB y preservarlo al editar.

### Offline y revocación

Definir cuánto puede operar una sesión sin red, qué acciones quedan permitidas y
qué ocurre si el usuario fue desactivado en otra terminal. El backend no debe aceptar
rol/autor falsificado por el dispositivo. Una firma/caché controlada, caducidad y
revalidación ayudan, pero no se debe prometer revocación instantánea sin conexión.
Separar logout local, cierre/revocación remota y vencimiento del access token.

## 3. Cambios de esquema y permisos a preparar

1. Limpiar el texto final no SQL de `schema_completo.sql` mediante cambio revisado.
   No asumir que `CREATE TABLE IF NOT EXISTS` migra constraints de tablas existentes.
2. Comparar catálogo desplegado con `INVENTARIO_SQL.md`; identificar versión y datos reales.
3. Diseñar migraciones versionadas, con precondiciones, rollback y comprobaciones de datos.
4. Sustituir las lecturas generales por permisos de negocio reales. RLS filtra filas,
   no oculta columnas de costo por sí sola: usar privilegios de columna/vistas o API adecuadas.
5. Quitar el acceso directo del cocinero a totales/pagos/costos y a acciones de venta no autorizadas.
6. Cajas/gastos: SELECT propio o admin. Las políticas permisivas se combinan por OR;
   añadir una policy restrictiva en apariencia no neutraliza otra `USING(true)`.
7. Movimientos: impedir UPDATE/DELETE generales; registrar correcciones vinculadas.
8. Validar activo/deleted_at en `es_admin` y funciones operativas.
9. Revisar privilegios EXECUTE de PUBLIC/anon/authenticated para cada función,
   además de verificar autorización dentro de las SECURITY DEFINER.
10. NOT NULL de relaciones obligatorias y CHECK de importes/cantidades/estados;
    definir invariantes de totales en el servicio transaccional, no solo en formularios.
11. Auditoría: guardar anterior/nuevo, autor y contexto, evitando hashes/tokens innecesarios.

No activar políticas demo anónimas para que desaparezcan errores de sync.
La prueba embebida permitió a anon ejecutar `reporte_resumen`; esto requiere una
corrección de permisos/función y comprobación en el proyecto remoto, no una conclusión
de que los GET de tablas vacíos protegían todos los accesos.

## 4. Venta y consumo: unidad transaccional propuesta

Una operación de venta debe recibir un UUID de operación y valores/solicitudes
validados; el backend decide identidad, permisos, estado, precios autorizados e impuestos.

Dentro de una transacción:
1. Rechazar o recuperar la operación ya procesada por una clave única de idempotencia.
2. Validar caja, catálogo, cantidades y autorizaciones de descuento/precio cuando correspondan.
3. Guardar cabecera con vendedor/canal, detalles snapshot y pagos correctos.
4. Resolver receta/unidades y bloquear o actualizar condicionalmente stock suficiente.
5. Guardar movimientos anterior/resultante y auditoría coherentes con el cambio real.
6. Crear/proyectar ticket de cocina una vez y confirmar toda la operación.

`cobrar_orden` actual pone la orden en **entregada** al cobrar. No conectarlo sin
revisar: pago y preparación son dimensiones diferentes del workflow.
`procesar_consumo_receta` debe protegerse contra ejecución repetida y cambios sobre órdenes ajenas.
La insuficiencia de ingrediente sí produjo rollback en la prueba embebida; falta
validar carreras multiconexión y movimientos correctos cuando varias ventas comparten ingrediente.

## 5. Contrato local/remoto y cola

| Campo conceptual | Local actual | Remoto actual | Regla |
|---|---|---|---|
| Identidad | `id` | `id` | UUID estable durante reintentos |
| Estado de pago | `paid` | `pagado` | No crear pago si no se cobró |
| Método | `payment_method` | `metodo_pago`, `pagos.metodo` | Desglose consistente, sin default silencioso a efectivo |
| Líneas | `items` | `orden_detalles` | Conservar producto/nombre/precio/costo/cantidad/notas |
| Autor | Usuario local + `remote_id` | `usuario_id` | Derivado/validado con sesión real |
| Tipo de orden | `channel` | `canal` | Separado del nombre del cliente |
| Número | `code` temporal | `numero_orden` | Estrategia acordada por negocio/terminal |

La sincronización actual transforma a remoto antes de llamar helpers que esperan
campos locales. Esa incompatibilidad fue reproducida y debe corregirse antes de
afirmar que una venta se guardó completa en cloud.

### Persistencia local
- Guardar orden/evento y outbox en la misma transacción IndexedDB.
- No perder el UUID al reintentar una acción cuyo resultado es incierto.
- Mantener pendiente/error visible hasta ACK de operación completa.
- No descartar movimientos porque falte remote_id: necesitan resolución de identidad.
- No sobrescribir snapshots válidos con una respuesta remota parcial sin detectar la anomalía.
- Cursor de pull paginado y confirmado; `limit=1000` con avance de timestamp puede omitir datos.
- Definir conflicto, borrado lógico y reparación; reloj local no equivale a versión confiable.

### Numeración

Dos terminales offline pueden crear el mismo contador local. Usar UUID para
identidad, número temporal identificable y asignación/coordinación de folio al
confirmar, o un sistema de bloques acordado. Una secuencia PostgreSQL puede tener
saltos al hacer rollback; **SERIAL no demuestra consecutivo estricto sin saltos**.
NCF/e-CF requiere su propia regla autorizada; no reutilizar `#1049` como comprobante fiscal.

## 6. Caja, pagos y conciliación

- Elegir la tabla de pagos como fuente del desglose por método y evitar volver a sumar
  el total de la misma orden en efectivo. El fixture mostró 336 en lugar de 218.
- Asociar órdenes y movimientos a la sesión correspondiente; cerrar bajo control de concurrencia.
- Definir devoluciones/contramovimientos y gastos de caja con una única contabilización.
- Diferencia = declarado - esperado; una sesión cerrada no se edita libremente.
- Reportes usan zona America/Santo_Domingo y excluyen anuladas del criterio de venta válido.
- Ejecutar `tests/audit/reconciliation.sql` en pruebas y reconciliar también datos históricos afectados.

## 7. Backups, instalación y operación

- Verificar qué backups/PITR ofrece el plan contratado; no inferirlo del código ni de precios antiguos.
- Probar restauración en otro proyecto y fijar RPO/RTO y responsables.
- Proteger respaldos locales: el JSON actual incluye hashes y no tiene restore validado.
- Completar precaché de módulos, versionado de SW y primer arranque offline limpio.
- Evitar que un dispositivo perdido o una copia vieja restaure operaciones ya cobradas sin idempotencia.

## 8. Matriz de aceptación remota pendiente

| Caso | Admin | Cajero | Cocinero | Anon |
|---|---|---|---|---|
| Leer/modificar catálogo completo | Sí | Solo datos operativos / no cambios | Solo datos operativos / no cambios | No |
| Leer costos/finanzas | Sí | No | No | No |
| Cobrar orden | Sí | Según permiso/caja | No | No |
| Avanzar cocina | Sí | Según permiso | Sí | No |
| Caja ajena / cierre ajeno | Admin autorizado | No | No | No |
| Ajustar inventario | Admin autorizado | Permiso explícito | Permiso explícito | No |
| Asignar roles | Administración segura | No | No | No |
| Consultar auditoría | Sí | No | No | No |
| Modificar/borrar auditoría | No por API ordinaria | No | No | No |

Realizar GET/POST/PATCH/DELETE/RPC con JWT de cada rol, sobre fixtures aislados,
sin imprimir tokens. Añadir usuario inactivo, recursos ajenos, reintento de operación,
dos conexiones por último stock y fallo después de commit antes de respuesta HTTP.

## 9. Secuencia de despliegue a acordar

Inventario real -> backup restaurado -> migraciones en pruebas -> fixtures/roles ->
RLS/RPC/conciliación -> app corregida -> E1–E8 -> dispositivos/recuperación ->
decisión Go/No-Go -> migración productiva planificada y monitorización.

La auditoría no realizó el último paso ni dispone de evidencia para autorizarlo.
