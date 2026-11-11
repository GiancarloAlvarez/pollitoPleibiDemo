# Supabase — Implementación y entorno de pruebas

> Versión del esquema: **2** (reemplaza los 4 archivos `gemini-code-*.sql`; consérvalos solo como historial).

## Contenido de esta carpeta
| Archivo | Propósito |
|---|---|
| `schema_completo.sql` | DDL completo e idempotente: tipos, 21 tablas, índices, triggers (`updated_at`, auditoría, cocina), funciones endurecidas, vistas `security_invoker`, RLS producción, grants y seed demo |
| `seed_admin.sql` | Plantilla para insertar tu perfil admin tras crear el usuario en Auth |
| `README.md` | Este documento: pasos de implementación, verificación y pruebas |

## 1. Implementar en Supabase (1 proyecto nuevo por negocio — recomendado)

1. Crea el proyecto en Supabase (región recomendada: `us-east-1` o `us-east-2` para latencia RD).
2. **SQL Editor → New query → pega TODO el contenido de `schema_completo.sql` → Run**.
3. Verifica que no aparezca ningún error; el script es idempotente (puede re-ejecutarse).
4. **Authentication → Users → Add user**: ingresa el email y contraseña del admin (ej. `admin@pollitopleibi.do`).
5. Copia el *UUID* del usuario creado y ejecuta en SQL Editor el bloque de `seed_admin.sql`
   (o inserta manualmente en `perfiles`).
6. Copia la **Project URL** y la **anon key** en la vista *Configuración → Conexión* de la app
   (se guarda en localStorage del negocio; nunca la service_role).
7. Activa el sync (badge en la app) y relaiza una acción (crear/editar producto) para validar el round-trip.

## 2. Conexión rápido (URL + token)
- URL: `https://<ref>.supabase.co`
- REST: `/rest/v1/…` con cabeceras `apikey` y `Authorization: Bearer <anon|jwt>`.
- Autentica: `POST /auth/v1/token?grant_type=password` (la app ya lo hace en `supabase.js`).

## 3. Tablas (comunes a la app y al talonario)
| Dominio | Tablas |
|---|---|
| Seguridad | `perfiles` (↓ `auth.users`), `registro_auditoria` |
| Catálogo | `categorias`, `productos`, `recetas`, `price_lists`, `price_list_items`, `price_history` |
| Compras | `proveedores`, `inventario`, `compras`, `compra_detalles`, `inventario_movimientos` |
| Ventas | `ordenes`, `orden_detalles`, `pagos`, `cocina_tickets` |
| Caja/Gastos | `caja_sesiones`, `movimientos_caja`, `gastos` |
| Sistema | `configuracion` |

## 4. Comportamiento de seguridad (RLS por defecto)
- `SELECT` para todos los usuarios `authenticated`.
- Escritura admin-only en: catálogo, precios, compras, configuración, perfiles.
- Escritura autenticada en: órdenes/detalles/pagos/tickets, movimientos de inventario,
  caja **propia** (`usuario_id = auth.uid()` o admin), gastos propios.
- `registro_auditoria`: escritura via trigger `SECURITY DEFINER` (bypass); lectura admin-only.
- Si necesitas pruebas con la **anon key sin JWT**, descomenta el bloque
  *"MODO PRUEBAS con anon key"* en la sección 19.5 del `schema_completo.sql`.
  Nunca dejes esta política en producción.

## 5. Verificación posterior a la implementación
```sql
-- 5.1 Perfil admin creado
SELECT id, nombre, rol FROM perfiles;

-- 5.2 updated_at funciona (debe regresar ~NOW() tras el UPDATE)
UPDATE configuracion SET valor = '{"jy":"b"}'::jsonb WHERE key = 'jyb-test' RETURNING updated_at;

-- 5.3 Auditoría automática (debe crecer tras editar productos)
SELECT count(*) FROM registro_auditoria;

-- 5.4 Ticket de cocina se sincroniza al cambiar estado
SELECT o.numero_orden, o.estado, t.estado
FROM ordenes o JOIN cocina_tickets t ON t.orden_id = o.id
ORDER BY o.numero_orden DESC LIMIT 5;
```

## 6. Cómo probar en la app (offline + sync)
1. Login en la app con el usuario de `config.demo` (sigue funcionando local).
2. Config tabs → *Conexión*: pega URL + anon key del proyecto recién implementado; guarda.
3. Cualquier cambio local se pondrá en outbox; al recuperar conexión, el sync lo envía con JWT
   del login de Supabase solo si hiciste `signIn`; usa el botón "Sync" para forzar push/pull.
4. En la vista *Inventario* agrega una entrada y verifica que al recargarla persiste desde el respaldo local
   (IndexedDB → `vanilla/local`) después de reactivar el modo offline con el DevTools.

## 7. Tabs de pruebas en `vanilla/tests/`
Ver `../tests/README.md` para las instrucciones completas de las siguientes verificaciones
(Playwright + Chrome del sistema + servidor estático local):
- `e2e-smoke.js` — sin Supabase (login, dashboard, POS, cocina, inventario, reportes, dark mode, roles).
- `supabase-integration.js` — con variables `SUPABASE_*` (auth, perfiles, `price_lists`,
  auditoría con trigger, todo vía REST con anon key o según tu setup).

## 8. Nota sobre versiones previas (gemini-code-*)
Los 4 archivos anteriores en `vanilla/docs/` son Canvas, ya no se ejecutan individualmente.
El esquema de `schema_completo.sql` es un **superset** y además incluye:
- `updated_at`/`deleted_at` en todas las tablas de sync (crítico para `sync.js`).
- `caja_sesion_id` nullable (para que POS funcione antes de implementar Caja en la app).
- `pagos` (permite pago mixto), `compras`/`compra_detalles` (compra multi-línea con ITBIS),
  `price_lists`/`price_list_items`/`price_history` (talonario).
- Triggers de auditoría sobre tablas sensibles.
- Funciones endurecidas (`SECURITY DEFINER` con `search_path` fijo + `auth.uid()` requerido).
- `cerrar_caja` corregido: propinas, pago mixto, gastos de caja sin doble conteo.
- Vista/trigger de cocina como proyección de `ordenes.estado` (fuente de verdad única).
