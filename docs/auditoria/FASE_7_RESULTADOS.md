# Fase 7 — automatización ejecutada

Fecha: 2026-11-02. Entorno: Windows, Node 24.16.0, Chrome del equipo y PGlite 0.5.14.
No hubo escrituras en Supabase ni cambios de lógica de aplicación.

## Resultado reproducible

| Suite | Casos | Pasa | Falla | Skip | TODO |
|---|---:|---:|---:|---:|---:|
| Cálculos | 8 | 4 | 1 | 0 | 3 |
| PostgreSQL embebido | 26 | 13 | 12 | 1 | 0 |
| E2E E1–E6 | 6 | 1 | 5 | 0 | 0 |
| Sincronización simulada | 4 | 1 | 3 | 0 | 0 |
| **Total** | **44** | **19** | **21** | **1** | **3** |

Hay 40 casos ejecutados con veredicto: 19 pasan y 21 fallan. Los TODO y Skip no
son aprobaciones. Las cuatro suites terminan con exit 1 por defectos actuales.
Se conservaron las aserciones de aceptación, sin corregir todavía esos defectos.

## Método y límites de la base

El DDL de `docs/supabase/schema_completo.sql` se cargó en una base **en memoria**:
se omitió el seed comercial y el texto final no SQL, y se omitió `CREATE EXTENSION
pgcrypto` porque se utiliza `gen_random_uuid()` nativo. Se conservaron RLS,
constraints, funciones, triggers y vistas. Se emuló `auth.uid()` y una tabla mínima
`auth.users`. Se probaron roles SQL sin BYPASSRLS, no tokens JWT ni PostgREST.

La semilla ejecutada contiene 3 usuarios, 15 productos, 20 insumos, 3 recetas
(dos ingredientes por receta), 2 proveedores, movimientos de saldo inicial y
datos de caja/órdenes/pagos para conciliar. Cada caso de rol termina en ROLLBACK.
No es una semilla para importar sin más en Supabase Auth.

## Cálculos: pasos, esperado y real

Cada prueba llama las funciones reales de `js/core/utils.js`.

| ID | Descripción/pasos y esperado | Real | Estado |
|---|---|---|---|
| CAL-01 | ITBIS 18% sobre 99.99: impuesto 18, total 117.99 | Coincide | ✅ |
| CAL-02 | ITBIS de 0.01: 0 tras redondeo | 0 | ✅ |
| CAL-03 | Tasa 0 y tasa 10% sobre 495 | 0 y 49.50 | ✅ |
| CAL-04 | Redondear 1.005 y 10.075 a 1.01 y 10.08 | El segundo devuelve 10.07 | ❌ |
| CAL-05 | Tres unidades de 999999.99, impuesto 539999.99 y total 3539999.96 | Coincide | ✅ |
| CAL-06 | Descuentos con autorización/motivo y orden de impuestos | No hay función integrada a verificar | TODO |
| CAL-07 | Efectivo insuficiente, exacto y vuelto | No hay función integrada a verificar | TODO |
| CAL-08 | ITBIS incluido y tasas por producto | Falta implementación integrada | TODO |

Evidencia: `tests/audit/calculations.test.mjs`; `js/core/utils.js:15-20`.

## SQL/RLS/RPC: cada caso ejecuta la operación indicada

| ID | Descripción/pasos y esperado | Real | Estado |
|---|---|---|---|
| SQL-00 | Importar el fuente completo salvo pgcrypto; debe parsearse | `syntax error at or near "https"` por texto final sin comentar | ❌ |
| SQL-01 | Contar fixtures: 3/15/20/3/2 | Coincide | ✅ |
| RLS-01 | Consultar catálogo: 21 tablas con RLS | 21/21 | ✅ |
| RLS-02 | Establecer caller cajero; comprobar auth.uid y rol SQL | Identidad correcta, `authenticated` | ✅ |
| RLS-03 | Admin actualiza precio a 125 | Devuelve 125 | ✅ |
| RLS-04 | Cajero intenta UPDATE de precio; no modifica filas | Cero filas | ✅ |
| RLS-05 | Cocina intenta UPDATE de stock; no modifica filas | Cero filas | ✅ |
| RLS-06 | Cajero intenta leer costos; no debe obtenerlos | Lee 15 costos | ❌ |
| RLS-07 | Cocina intenta leer totales; no debe obtenerlos | Lee 2 totales | ❌ |
| RLS-08 | Cajero consulta cajas; solo la propia | Puede consultar la otra caja | ❌ |
| RLS-09 | Cajero intenta elevar su perfil; no modifica rol | Cero filas; es_admin=false | ✅ |
| RLS-10 | Desactivar admin y consultar es_admin; debe ser false | Sigue true | ❌ |
| AUD-01 | Admin intenta editar/borrar logs desde tablas | Cero filas modificadas/borradas | ✅ |
| AUD-02 | Cambiar precio; log debe conservar anterior/nuevo | Solo conserva NEW | ❌ |
| RPC-01 | Anon invoca reporte financiero; debe denegarse | Puede ejecutar reporte_resumen | ❌ |
| RPC-02 | Cajero intenta cerrar caja del admin; debe denegarse | El RPC permite cerrarla | ❌ |
| RPC-03 | Consumir dos veces misma orden; segundo intento no descuenta | Stock 8; se esperaba 9 | ❌ |
| RPC-04 | Ingrediente insuficiente; rollback al savepoint sin consumo parcial | Stock y movimientos previos conservados | ✅ |
| CAJA-01 | Inicial 100 + venta/pago efectivo 118: esperado 218 | Calcula 336 | ❌ |
| FK-01 | Detalle con producto inexistente | Error 23503 | ✅ |
| FK-02 | Pago sin orden asociada | Acepta orden_id NULL | ❌ |
| CHECK-01 | Stock -1 debe rechazarse | Error 23514 | ✅ |
| CHECK-02 | Precio -1 debe rechazarse | Lo acepta | ❌ |
| SQL-INJ-01 | Insertar texto SQL mediante parámetro; tratarlo como dato | Conserva literal; tabla productos intacta | ✅ |
| REC-01 | Ejecutar reconciliation.sql sobre fixture coherente | Sin discrepancias; pagos suman 354 | ✅ |
| CONC-01 | Último ingrediente con dos conexiones simultáneas | PGlite no proporciona esta prueba multiconexión | Skip |

Evidencia: `tests/audit/database.test.mjs`, `database-harness.mjs`, `seed-test.sql`
y `reconciliation.sql`. SQL-INJ-01 prueba parámetros SQL del harness, no toda la
superficie REST. Los resultados no certifican el proyecto Supabase desplegado.

## E2E E1–E6

| Caso | Pasos/esperado | Resultado actual | Estado |
|---|---|---|---|
| E1 | Crear producto e iniciar día completo con receta/caja | Se detiene al faltar gestión de recetas | ❌ contrato incompleto |
| E2 | Registrar entrada y comprobar margen por receta | Stock aumenta; falta receta vinculada | ❌ contrato incompleto |
| E3 | Vender y encontrar anulación con motivo | No hay acción de anulación identificada | ❌ contrato incompleto |
| E4 | Stock 5/mínimo 5 debe alertar | UI muestra En buen nivel | ❌ |
| E5 | Vender a 100, cambiar a 150, volver a vender | Orden vieja 100/118; nueva 150/177 | ✅ local |
| E6 | Cajero: rutas y API local deben denegar | Rutas bloqueadas; repositorio acepta precio | ❌ |

No se presentan E1–E3 como recorridos completos ejecutados. El subconjunto de E1
de la Fase 6 sí procesó cinco órdenes hasta Entregada y concilió 590 adicionales
entre dashboard, reportes y XLSX; faltaron receta/caja/mixto.

Evidencia: `tests/audit/scenarios.test.mjs` y `browser-harness.mjs`.

## Transporte de sincronización

| Caso | Esperado | Real | Estado |
|---|---|---|---|
| SYNC-01 | Orden de 2 productos transmite 2 detalles | Cero detalles | ❌ |
| SYNC-02 | Pago conserva método tarjeta | Transmite efectivo | ❌ |
| SYNC-03 | Orden pendiente no genera cobro | Transmite un pago | ❌ |
| SYNC-04 | Fallo conserva cola e ID; reintento usa on_conflict=id | Lo conserva y reutiliza | ✅ transporte simulado |

Se invoca `syncNow` real, con todas las peticiones interceptadas. No hay ejecución
de PostgreSQL detrás de las respuestas simuladas. Evidencia: `tests/audit/sync.test.mjs`.

## Comandos

```powershell
# Desde vanilla/tests; cada comando independiente
npm run audit:unit
npm run audit:db
npm run audit:e2e
npm run audit:sync
```

La Fase 7 aporta pruebas ejecutables y un fixture SQL real aislado. Continúan
pendientes JWT/REST reales por rol, concurrencia multiconexión, recuperación
remota, hardware, pruebas humanas y aceptación fiscal.

## Verificación del cierre documental

- Siete archivos JavaScript nuevos comprobados con `node --check`: cero fallos de sintaxis.
- Doce documentos revisados: 28 enlaces locales válidos y bloques de código equilibrados.
- Siete diagramas Mermaid parseados y renderizados con Mermaid 10.9.3; SVG disponibles
  en `docs/auditoria/diagramas/`.
- `tests/package.json` y `package-lock.json` parseados correctamente; PGlite fijado a 0.5.14.
- No se alteraron archivos de `js/`, `css/`, `index.html`, `sw.js` ni el esquema de aplicación.
