# Entorno de pruebas — Pollito Pleibi (vanilla)

Suite E2E + integración que no descarga navegadores: usa **Chrome o Edge del sistema**.
Requiere Node >= 20 (probado con 24).

## 1. Instalación (una vez)

```powershell
cd C:\Projects\prototipo-pollito-pleibi\vanilla\tests
npm install
```

playwright-core usará el navegador presente en el sistema (Chrome/Edge). Si no encuentra
ninguno, define la variable de entorno `CHROME_PATH` con la ruta al ejecutable:

```powershell
$env:CHROME_PATH = "C:\Program Files\Google\Chrome\Application\chrome.exe"
```

## 2. Servidor estático

Sirve `vanilla/` como lo haría Cloudflare Pages (SPA + hash routing + SW deshabilitado
durante las pruebas):

```powershell
cd C:\Projects\prototipo-pollito-pleibi\vanilla\tests
npm run server
# Alternativa: node server.js
# Salida: Servidor de pruebas listo en http://127.0.0.1:4173/ (sirve: C:\Projects\prototipo-pollito-pleibi\vanilla)
```

## 3. Smoke test E2E (app local, sin Supabase)

```powershell
# en otra terminal
npm test
# o
node e2e-smoke.js
```

Sale `0` si todo pasa, `1` si hubo FAIL. Resultado actual verificado:

```
E2E Smoke: 25 PASS · 0 FAIL · 1 SKIP
```

Los SKIP son verificaciones condicionales y dependen del estado de la sesión
(por ejemplo, el carrito puede persistir de una corrida anterior vía localStorage).
Los FAIL sí rompen el código de salida final.

## 4. Integración con Supabase (proyecto real)

En el shell antes de lanzar:

```powershell
npm run test:remote
```

Las credenciales se toman de `tests/.env` (cargado con `node --env-file`). Rellena
`SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_TEST_PASSWORD` en ese archivo
(`.env` está en el `.gitignore`; no versionarlo).

Si falta alguna variable, el suite se salta a sí mismo (exit 0) sin FALLAS.

### Qué valida (9 checks)
1. Login con email/password (Auth REST).
2. Lectura de catálogo (`categorias` order by `orden`, `productos`).
3. Filtro por booleanos (`activo=false`).
4. `INSERT`/`PATCH`/`DELETE` sobre `configuracion` (RLS funcionando).
5. **`updated_at` automático** por trigger `trg_touch_*` (fecha POST < fecha PATCH).
6. **Auditoría automática**: insertar + editar una `categorias` de test y encontrarla en
   `registro_auditoria` con el texto `AUD-<timestamp>`.
7. Creación de `ordenes` + `orden_detalles` + trigger `cocina_tickets`.
8. Trigger `trg_sync_ticket_estado`: anular la orden y verificar el estado del ticket.
9. RLS de admin: PATCH de un `producto` existente (y volver a su precio original).

## 5. Variables de entorno

| Variable | Valor por defecto | Uso |
|---|---|---|
| `BASE_URL` | `http://127.0.0.1:4173` | URL del servidor estático (`server.js`) |
| `CHROME_PATH` | autodetección | Ruta al `chrome.exe`/`msedge.exe` |
| `TEST_ADMIN_EMAIL` | `admin@pollitopleibi.do` | Login demo admin |
| `TEST_ADMIN_PASSWORD` | `PollitoPleibi2026!` | Login demo admin |
| `TEST_CAJERO_EMAIL` / `_PASSWORD` | `cajero@pollitopleibi.do` / `PollitoPleibi2026!` | Login demo cajero |
| `SUPABASE_*` | vacío (en `.env`) | proyecta el suite `supabase-integration.js` |

Todas se definen en `tests/.env` (cargado por los scripts npm con `--env-file`); las
de la tabla son los fallbacks hardcodeados usados si la variable no existe.

## 6. Estructura

```
tests/
├── package.json
├── server.js                 servidor estático (4173)
├── helpers.js                launcher de Chrome/Edge + login + Trace
├── e2e-smoke.js              suite E2E principal (10 secciones)
├── supabase-integration.js   suite REST contra Supabase real
└── README.md
```

## 7. Depuración

Para ver el navegador en cualquier momento, cambia `headless: true` → `false` en
`e2e-smoke.js` (línea ~24). También puedes guardar screenshots:

```js
await page.screenshot({ path: 'debug.png', fullPage: true });
```

Si algún selector del smoke test quedó anticuado por cambios en la app, actualiza el
nombre del selector en `e2e-smoke.js` tomando como referencia el HTML del módulo en
cuestión, sin cambiar la assert correspondiente.

## 8. Notas finales
Las vistas de dashboard/charts no son parte del smoke test; se validan manualmente
en la vista de trabajo cuando sea relevante. Los scripts de server/helpers no dependen
de Supabase (pueden probarse offline).
