# Suite de auditoría — Fase 7

## Ejecución

Probado con Node 24.16.0, Chromium del equipo, PGlite 0.5.14 y Windows.
Desde `vanilla/tests`, después de `npm install`:

```powershell
npm run audit:unit
npm run audit:db
npm run audit:e2e
npm run audit:sync
```

Cada comando es independiente. No necesita `.env`, credenciales Supabase, Docker,
un servidor 4173 abierto ni un proyecto remoto. Los E2E levantan un servidor HTTP
temporal en loopback, bloquean peticiones externas y cierran servidor/navegador.

## Línea base observada el 2026-11-02

| Comando | Pasa | Falla | Skip | TODO |
|---|---:|---:|---:|---:|
| `audit:unit` | 4 | 1 | 0 | 3 |
| `audit:db` | 13 | 12 | 1 | 0 |
| `audit:e2e` | 1 | 5 | 0 | 0 |
| `audit:sync` | 1 | 3 | 0 | 0 |
| **Total: 44 casos** | **19** | **21** | **1** | **3** |

Los comandos devuelven código 1 mientras existan fallos. Es la línea base de una
auditoría del código existente: no se han corregido sus defectos. No convertirlos
en skips, invertir aserciones ni ampliar tolerancias para ocultarlos.
Los TODO pueden aparecer con una marca en el reporter de Node, pero **no cuentan
como casos aprobados**. El warning MODULE_TYPELESS_PACKAGE_JSON de Node no es un
fallo de negocio y no justifica cambiar la configuración del proyecto Next vecino.

## Base aislada

`database-harness.mjs` crea PostgreSQL embebido **en memoria**. No admite URL remota.
Emula `auth.users`, `auth.uid()` y los roles `anon`/`authenticated` sin BYPASSRLS.
La identidad se establece mediante un setting de sesión, **no mediante JWT**.

Se carga el DDL real de `docs/supabase/schema_completo.sql` hasta antes del seed:
- Se omite la instalación de `pgcrypto`; se usa `gen_random_uuid()` nativo.
- Se excluyen el seed comercial y el texto final no SQL para poder probar el DDL.
- No se cambian políticas, constraints, vistas, funciones o triggers.
- SQL-00 comprueba por separado el defecto de importación del archivo con su texto final.

`seed-test.sql` requiere el setting de fixture y crea exactamente 3 usuarios,
15 productos, 20 insumos, 3 productos con receta (6 relaciones) y 2 proveedores,
además de datos mínimos de caja, ventas, pagos y saldos iniciales para conciliar.
No crea cuentas utilizables en Supabase Auth ni contiene contraseñas reales.
Cada prueba de rol termina en ROLLBACK, incluso cuando falla una aserción.

PGlite prueba semántica SQL, pero **no** despliegue Supabase, GoTrue, PostgREST,
JWT, revocación de sesiones o concurrencia multiconexión. CONC-01 se omite por
esa limitación. No describe como remotos los resultados embebidos.

## Cobertura

- `calculations.test.mjs`: funciones reales de ITBIS y redondeo. Descuento,
  vuelto y precio con impuesto incluido quedan como TODO por falta de función.
- `database.test.mjs`: RLS por perfil, RPC, constraints, auditoría y conciliación.
- `scenarios.test.mjs`: contratos E1–E6. E1/E2/E3 fallan al encontrar requisitos
  ausentes; no significan que se ejecutaron etapas posteriores. El recorrido
  parcial de cinco ventas está documentado en el informe de Fase 6.
- `sync.test.mjs`: invoca `syncNow` real y captura transporte simulado. La respuesta
  simulada no ejecuta triggers, FKs ni RLS, y no prueba persistencia remota.
- `reconciliation.sql`: consultas de solo lectura; ejecutadas sobre la semilla
  aislada. Los saldos iniciales deben representarse como movimientos.

## Pruebas remotas pendientes

En un proyecto separado: tres usuarios Auth con sus perfiles reales; lectura y
escritura REST por rol; RPC ajenas; pérdida de red con reconexión; dos conexiones
vendiendo el último ingrediente; backup y restauración; certificación fiscal si aplica.
La antigua suite `supabase-integration.js` usa otro contrato en varios campos y
realiza escrituras. No se utilizó para esta auditoría ni certifica el esquema actual.

`npm audit` revisa las dependencias npm del entorno de pruebas, no los archivos
vendorizados de `assets/vendor`.
