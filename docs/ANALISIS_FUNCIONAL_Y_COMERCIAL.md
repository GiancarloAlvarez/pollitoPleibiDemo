# Análisis Funcional y Comercial — Pollito Pleibi (vanilla)

| Campo | Valor |
|---|---|
| Proyecto | Pollito Pleibi — Sistema Integral de Ventas, Inventario y Operaciones |
| Documento | Análisis funcional del código `vanilla/`, brechas vs. Ficha Técnica, estrategia de precios (RD$) y plan comercial |
| Versión | 1.0 |
| Fecha | 2026-11-01 |
| Autor | JyB Technology Solutions SRL — Innovamos. Desarrollamos. Conectamos. |
| Fuentes | `vanilla/js/**` (32 módulos, 4,819 líneas), `Ficha_Tecnica_Pollito_Pleibi_JyB.pdf`, esquemas SQL en `vanilla/docs/gemini-code-*.sql`, precios oficiales 2026 citados por sección |

---

## 1. Resumen ejecutivo

**Cobertura funcional vs. la Ficha Técnica: ~58 % (estimada).**
De las 22 secciones de la ficha: **5 cumplen, 13 están parciales y 4 no existen**. El núcleo operativo (POS, productos, inventario simple, cocina, reportes base) está sólido —probado E2E con Playwright: login, carrito, checkout, kanban de cocina, entrada de inventario, exportación Excel, roles y modo offline—. El back-office de control de dinero y trazabilidad (recetas, caja, gastos, auditoría) **no existe todavía**.

**Cinco hallazgos clave**

1. **Faltan 4 módulos completos**: Recetas + descuento automático (§9), Caja (§12), Gastos (§13) y Auditoría (§18). Es exactamente el bloque que da valor de "sistema integral" y que los competidores de RD ya venden.
2. **El esquema Supabase enviado (4 archivos SQL) está bien encaminado pero no es compatible con el sync actual**: sin `updated_at`/`deleted_at` en la mayoría de tablas (rompe el *last-write-wins*), `ordenes.caja_sesion_id NOT NULL` (bloquea el POS actual), sin `configuracion`, sin pagos mixtos, sin listas de precios, y un RLS con **solo 3 políticas `SELECT` y ninguna de escritura**.
3. **La e-CF es el riesgo comercial número uno**: la Ley 32-23 obliga a migrar la facturación electrónica antes de 2027 y la ficha no la contempla. Lo mismo aplica a la **propina legal 10 %** (Ley 392-98), ya estándar del mercado.
4. **La infraestructura es barata**: el sistema puede operarse por ~RD$1,600–2,300/mes por negocio en modo dedicado (Supabase Pro + Cloudflare Pages + dominio), o ~RD$1,600/mes en total en modo SaaS compartido para hasta 8–10 negocios.
5. **El precio recomendado por negocio está entre RD$2,900 y RD$8,500/mes + setup**, posicionado entre RestaurantOS Pro (RD$1,989) y ComandPos Premium (RD$9,999), con pagos de implementación coherentes con el mercado (RD$18,000–45,000).

**Recomendación**: NO vender bajo contrato antes de cerrar **F0–F2** (~53 días de desarrollo): esquema compatible + recetas + caja + gastos + auditoría + talonario. Con eso, el producto entra en el rango de funcionalidad que el mercado dominicano paga hoy, y la venta completa por negocio (con datos reales y contrato) puede ejecutarse con margen ≥ 25 %.

---

## 2. Metodología, fuentes y supuestos

### 2.1 Metodología
- **Inventario estático**: lectura de los 32 módulos de `vanilla/js/` con conteo programático de líneas y símbolos exportados (script Node 24, ejecutado 2026-11-01). Total: **4,819 líneas, 180 símbolos exportados**.
- **Análisis funcional**: cada característica se evaluó contra el comportamiento real del código (render + eventos + modelos de datos), con evidencia `archivo:línea`.
- **Matriz de cumplimiento**: criterio **Cumple** (implementado y probado), **Parcial** (implementado con brechas funcionales) o **Falta** (no existe), sobre las 22 secciones de la ficha.
- **Esquema Supabase**: revisión de los 4 archivos SQL provistos; *diff* contra el modelo local; análisis de RLS, triggers y funciones; plan de compatibilidad con `sync.js`/`db.js`.
- **Costos y precios**: fuentes oficiales con fecha de consulta; conversión USD→RD$ a tasa Banco Central.

### 2.2 Fuentes primarias consulta 2026-11-01
| Fuente | Dato clave |
|---|---|
| Ficha Técnica PDF (ReportLab, 4 págs.) | 22 secciones de alcance |
| supabase.com/pricing | Free $0; Pro $25/mes; Team $599 |
| developers.cloudflare.com/pages | Free: 500 builds/mes, 20k archivos, dominios ilimitados |
| vercel.com/pricing | Hobby $0 (no comercial); Pro $20/mes |
| midominio.do / dominios.com.do | `.com.do` RD$800/año; `.do` RD$2,000/año |
| webpoint.com.do | `.com` RD$635/año |
| Banco Central RD (tasaus_mc.pdf, 30-oct-2026) | USD/DOP **60.1617 compra / 60.5689 venta** (vigente 1–2 nov) |
| Resend | Free 3,000 emails/mes (100/día); Pro $20/mes |
| gestiondo.com.do, cuadre.do, comandpos.com, wiposcloud.com, kuenta.me, pos.com.do | benchmark de precios POS en RD 2026 |
| Ley 32-23 / Norma 06-2023 DGII | e-CF obligatorio antes de 2027 |

### 2.3 Supuestos y conversiones
- **Tipo de cambio operativo: RD$60.5689 por US$** (BCRD, venta). Todas las conversiones usan esta tasa; los precios en RD$ no cambian con el FX salvo cláusula anual.
- **ITBIS 18 %** (Art. 341, Ley 11-92): los precios de este documento se expresan **sin ITBIS**; el ITBIS se suma y declara aparte. El ITBIS no es margen.
- Mes comercial de **22 días hábiles**; desarrollador mixto a costo interno **RD$4,000/día** (escenario) y tarifa de soporte **RD$800/hora**.
- La venta definida por el cliente es **completa y personalizada por negocio** (paquete cerrado por cliente, que incluye base de datos real y contrato). El escenario de venta del activo a un solo comprador se incluye como anexo (§13.6).
- Márgenes: se presentan **las dos lecturas** — *markup sobre costo* (+10 % / +25 %) y *margen bruto sobre precio de venta* (10 % / 25 %) — en §10.

---

## 3. Inventario técnico de la sección vanilla

### 3.1 Arquitectura
- **Estática y local-first**: HTML/CSS/JS vanilla + ES modules; requiere servidor estático (no funciona por `file://`). Los datos viven en **IndexedDB** (`pollito-pleibi-db` v1, 9 stores) con fallback a localStorage; el carrito persiste en `pollito-cart`.
- **Sync opcional**: cola **outbox** local → push/upsert REST con la anon key → pull incremental por `updated_at` → **last-write-wins**; soft delete (`deleted_at`) en lugar de DELETE físico; mapeo lógico↔remoto configurable (`config.js:6-19`).
- **Auth**: local con PBKDF2 (120k iteraciones, `crypto.subtle`) + sesión en localStorage; integración Supabase Auth disponible vía `supabase.js` (token refresh, sign-in/out).
- **PWA completa**: `manifest.webmanifest`, service worker con precache de app + vendor (lucide 0.468.0, Chart.js 4.4.7, XLSX 0.18.5), probada offline real (reload sin red funciona).
- **Roles de demo**: admin (todo), cajero (`pos`, `cocina`, `inventario`), cocina (mismo set). Rutas protegidas por `ALLOWED` (`router.js:4-13`) y guarda de redirección.

### 3.2 Inventario de módulos (32 archivos, 4,819 líneas, 180 exportaciones)

| Archivo | Líneas | Exports | Responsabilidad |
|---|---:|---:|---|
| `app.js` | 366 | 0 | Bootstrap, shell/nav, eventos globales, binds de vistas |
| `config.js` | 59 | 6 | Versión de app/esquema, configuración Supabase (LS `pollito-supabase-config`) |
| `components/icons.js` | 10 | 2 | SVG inline + `renderIcons` |
| `components/modal.js` | 127 | 4 | Modales genéricos, confirmación, **checkout del POS** |
| `components/theme.js` | 39 | 4 | Claro/oscuro, persistido |
| `components/toast.js` | 21 | 2 | Notificaciones |
| `core/analytics.js` | 160 | 13 | Rangos de fecha, ventas, top productos, stock bajo, KPIs |
| `core/auth.js` | 155 | 7 | Sesión local, login/logout, restauración |
| `core/charts.js` | 141 | 6 | Chart.js ventas/pagos + fallback CSS sin librería |
| `core/db.js` | 198 | 10 | IndexedDB 9 stores + fallback |
| `core/excel.js` | 204 | 1 | Exportación XLSX multi-hoja |
| `core/repo.js` | 410 | 23 | CRUD de dominio, seed, órdenes, settings |
| `core/router.js` | 118 | 9 | Rutas por rol, labels, navegación |
| `core/state.js` | 92 | 7 | Estado en memoria, carrito, filtros |
| `core/supabase.js` | 211 | 14 | REST/PostgREST, auth, `testConnection` |
| `core/sync.js` | 222 | 7 | Outbox, push/pull, LWW, badge, `initSync` |
| `core/utils.js` | 224 | 29 | Fechas, dinero, ITBIS, PBKDF2, descargas |
| `data/seed.js` | 284 | 8 | Dataset demo determinista (timestamps escalonados) |
| `views/*.view.js` (14) | 1,727 | 28 | Reportes visuales: login, dashboard, pos, cocina, productos, formularios, inventario(+entrada), proveedores, reportes, usuarios, config |

### 3.3 Catálogo de API pública (108 funciones + ~30 constantes/export-bundles)

**`config.js`** — `APP_VERSION` 1.0.0, `SCHEMA_VERSION` 1, `DEFAULT_SUPABASE.tables{products,orders,inventory,users,suppliers,movements,settings}`, `getSupabaseConfig()`, `saveSupabaseConfig(patch)`, `isSupabaseConfigured()`.

**`db.js`** — `STORES{PRODUCTS,ORDERS,INVENTORY,USERS,SUPPLIERS,MOVEMENTS,SETTINGS,OUTBOX,META}`, `dbGetAll`, `dbGet`, `dbPut`, `dbPutMany`, `dbDelete`, `dbClear`, `dbCount`, `dbReady`, `usingFallback`. Nota: clave `key` para SETTINGS/META, `id` para el resto (`db.js:23-25`).

**`repo.js`** — `ensureSeed`, `initRepo`, `reload`, `nextOrderCode` (utils), `orderTotals(items)` (subtotal global + ITBIS global, no por ítem — `repo.js:108-113`), `saveProduct` (costo default = 39 % del precio — `repo.js:133`), `toggleProduct`, `deleteProduct` (soft), `saveInventory`, `addInventoryEntry` (crea movimiento tipo `entrada` con total = qty × costo — `repo.js:192-229`), `saveSupplier`, `toggleSupplier`, `deleteSupplier`, `saveUser`, `toggleUser`, `deleteUser`, `createOrder` (items snapshot en JSON, sin vendedor/descuento — `repo.js:330-363`), `advanceOrder` (Nueva→Preparando→Lista→Entregada — `repo.js:365`), `saveSettings`, `movementsThisMonth`, `todayOrders`, `DEMO_PASSWORD`, `DEFAULT_SETTINGS`.

**`sync.js`** — `initSync`, `syncNow` (push outbox → pull 7 tablas `sync.js:6`), `refreshPending`, `renderBadge`, `queueChange(table, op, payload)`, `scheduleSync(800ms)`, `getSyncStatus`. Pull con filtro `since=last_sync` y LWW por `updated_at` (`sync.js:115-155`).

**`supabase.js`** — `configured`, `session`, `clearSession`, `refreshSession`, `accessToken`, `signIn`, `signOut`, `testConnection`, `restRequest(path, opts)`, `upsertRow(table,row,key)`, `deleteRow(table,id)`, `pullRows(table,since=1970)`, `remoteRole(user)`, `remoteName(user)`.

**`auth.js`** — `SESSION_KEY`, `currentSession`, `establishSession(user, remember)`, `clearSession`, `restoreSessionUser`, `login`, `logout`.

**`analytics.js`** — `periodRange('today'|'yesterday'|'week'|'month'|'custom', from, to)`, `filterPaidOrders`, `metrics(orders)` (sales/count/units/ticket/profit), `salesSeries(orders, 7)`, `paymentDistribution`, `topProducts`, `inventoryValue`, `lowStockItems`, `kitchenOrders`, `todayMetrics`, `yesterdayMetrics`, `WEEKDAY_LABELS`, `PAYMENT_COLORS`.

**`excel.js`** — `exportReport(type='all', context)`. Hojas: Resumen, Ventas, Productos, Inventario, Movimientos, "Productos más vendidos" (`excel.js:185-198`); tipos individuales: sales, products, inventory, movements, top (`excel.js:149-157`).

**`utils.js`** (29) — `uid` (UUIDv4), `money`, `round2`, `calcTax(subtotal, 0.18)`, `sum`, `clamp`, `normalize`, `escapeHtml`, `debounce`, `initials`, fechas (`startOfDay`, `endOfDay`, `addDays`, `startOfWeek`, `startOfMonth`, `dateKey`, `toDate`, `formatDateLong/Short`, `formatDateTime`, `relativeTime`, `percentChange`), `nextOrderCode` (#1049…), `formatPercent`, `compactMoney`, `downloadBlob`, `randomSalt`, `hashPassword`, `verifyPassword` (PBKDF2 120k).

**Componentes** — `icons.js: icon(name,size,cls)`, `renderIcons(root)`; `modal.js: openModal(cfg)`, `confirmAction(cfg)`, `closeModal()`, `openCheckoutModal({total, defaultCustomer, onConfirm})` (campos: Cliente + Método de pago — `modal.js:110-123`); `theme.js: getTheme/applyTheme/toggleTheme/initTheme`; `toast.js: showToast(msg,type,duration)`, `toastError(err)`.

**Vistas (render + bind por módulo)** — `login`, `dashboard` (4 stats: ventas hoy, órdenes hoy, ticket promedio, productos vendidos + 2 charts + recent orders + alertas stock — `dashboard.view.js:84-87`), `pos` (tabs de categorías, carrito, checkout), `kitchen` (kanban 4 columnas + tiempo relativo — `kitchen.view.js:8-28`), `products`, `product-form` (name, category, price, cost, emoji, color, available — sin SKU/imagen/ITBIS), `inventory` (+ stats), `inventory-entry` (insumo nuevo o existente, cantidad, unidad, costo, proveedor, nota), `suppliers`, `supplier-form` (name, contact, phone, email, notes, active — falta dirección/productos), `reports` (5 períodos + 6 reportes + export all/custom), `users`, `user-form`, `config` (5 tabs: business, taxes, notifications, roles, connection).

---

## 4. Análisis funcional por característica

### 4.1 Autenticación y sesión
- Local: login por email + PBKDF2; sesión en LS con expiración opcional; `remember` controla persistencia; restauración async al arrancar (`auth.js`). Demo con 3 usuarios.
- Supabase: `signIn/signOut/refreshSession/accessToken` listos, pero la app **authentica localmente aunque Supabase esté configurado**; el token remotor solo se usa para escribir via anon/JWT. Riesgo de dualidad auth que se resuelve en F3 (§14).

### 4.2 Enrutamiento y roles
- `ALLOWED` restringe rutas por rol; vendedor/cocina comparten exactamente el mismo set (`pos/cocina/inventario`), y servicios de roles fijo, sin permisos granulares por usuario ni acciones (p. ej. "cocina puede ver inventario pero no editarlo").

### 4.3 Dashboard
- Stats: ventas de hoy, órdenes de hoy, ticket promedio, unidades vendidas, con tendencia vs. ayer/semana (`dashboard.view.js:84-87`). Charts: serie 7 días y dona de métodos de pago. Órdenes recientes y alertas de stock bajo.
- **No tiene**: ventas semana/mes, ventas por vendedor, gastos, mermas, utilidad y costos (la métrica `profit` existe en `analytics.metrics` con costoestimado por producto pero no se muestra).

### 4.4 POS
- Categorías fijas (9, de la ficha), carrito con +/- cantidad, modal de checkout con cliente y método (Efectivo/Tarjeta/Tarjetas de crédito/Transferencia), orden numerada `#1049+`, snapshot de items JSON, ITBIS global 18 %, canal derivado del texto del cliente (`pos.view.js:168-194`).
- **Falta**: vendedor asociado (usuario logueado NO se guarda en la orden), descuentos con autorización, propina legal 10 %, pago mixto, notas e indicaciones por ítem (el esquema remoto sí las tiene en `orden_detalles.notas`), anulación/devolución, flujo a crédito (fiao).

### 4.5 Cocina
- Kanban 4 columnas alineado a la ficha, avance con un clic, tiempo transcurrido, **no expone montos** (correcto). Falta: indicaciones por producto (solo `items_text` agregado — `kitchen.view.js:27`) y métricas de tiempo promedio por orden.
- Conflicto de esquema: el SQL duplica el estado en `cocina_tickets`; decidir fuente única (recomendado: eliminar la tabla o tratarla como proyección generada).

### 4.6 Productos
- Crea/edita/activa/elimina (soft) con precio, costo estimado (default 39 %) y tarjeta (emoji + color). **Falta según ficha §5**: código interno (SKU), categoría administrada (hoy string fija), descripción, imagen, ITBIS por producto, receta asociada.

### 4.7 Inventario
- CRUD de insumos (nombre, categoría libre, stock, unidad, mínimo, costo unitario) + stats de valor/stock bajo. Entrada de mercancía que suma stock y registra movimiento tipo `entrada` con proveedor y nota (`repo.js:192-229`).
- **Falta según ficha §6–8**: ITBIS del artículo, proveedor preferente en el ítem, fecha de entrada, estado, observaciones, y tipos de movimiento adicionales (salida, merma, desperdicio, ajuste, devolución, consumo interno; stock anterior/resultante — el SQL sí los modela en `inventario_movimientos`).

### 4.8 Proveedores
- CRUD con contacto, teléfono, email, notas y estado; **falta** dirección, productos suministrados y link real a compras (la entrada usa `supplier_id` a fin, pero no hay vista de compras del proveedor).

### 4.9 Reportes y Excel
- Períodos: Hoy, Ayer, Esta semana, Este mes, **Rango personalizado** (cubre ficha §15). Tipos: ventas, productos, inventario, movimientos ("Gastos y mermas"), pagos ("Vendedores y métodos"), top productos. Export "todo" con 6 hojas y anchos col definidos; archivos tipo real `.xlsx` vía SheetJS offline.
- **Falta**: datos de gastos/mermas reales (solo hay entradas), reporte por vendedor (no hay vendedor en la orden), caja, compras, costo/utilidad desglosado, y hojas Excel de Vendedores, Métodos de pago, Compras, Gastos, Mermas (fichigos §15–16).

### 4.10 ITBIS e impuestos
- Configurable la tasa global y moneda (tab `config taxes`), cálculo automático en POS y reportes. **Falta**: ITBIS por producto (SQL ya lo contempla: `productos.tasa_itbis`), productos exentos, precios con ITBIS incluido, propina legal, NCF/e-CF.

### 4.11 Configuración y conexión
- Tabs: negocio (nombre, RNC, dirección, teléfono), impuestos (tasa, moneda), notificaciones (3 toggles, **no implementados reales**), matriz de roles (referencia), conexión Supabase (URL, anon key, test, sync con badge y contador de pendientes). Warn correcto: nunca usar service_role en el navegador.

### 4.12 Offline y sync
- SW precachea app+vendor; probado reload sin red. Outbox registra cambios y push automático al recuperar red (`sync.js:193-205`); pull con ventana incremental. **Riesgo**: si dos dispositivos editan el mismo registro, gana el último `updated_at` sin detección de conflicto; sin `device_id` de trazabilidad; la numeración de órdenes se genera localmente (`utils.nextOrderCode`) y puede duplicarse entre dispositivos → moverla a secuencia remota por negocio.

---

## 5. Matriz de cumplimiento — Ficha Técnica §1–22

| § | Sección de la ficha | Estado | Evidencia / brecha |
|---:|---|---|---|
| 1 | Descripción general | Parcial | Núcleo listo; faltan 4 módulos de control (caja/gastos/recetas/auditoría) |
| 2 | Usuarios y roles | Parcial | 3 roles con rutas (`router.js:4-13`); sin permisos granulares ni límite "según permisos" para cocina |
| 3 | Dashboard admin | Parcial | 4 KPIs + 2 charts (`dashboard.view.js:84-87`); sin semana/mes, por vendedor, gastos, mermas, utilidad |
| 4 | POS | Parcial | Ofer/checkout ok; sin vendedor, descuentos autorizados, propina, pago mixto, indicaciones |
| 5 | Productos | Parcial | CRUD + precio/costo/estado; sin SKU, imagen, descripción, ITBIS, receta, activar/desact plus |
| 6 | Inventario | Parcial | CRUD + entrada; sin ITBIS, proveedor en ítem, fecha entrada, estado, obs. |
| 7 | Movimientos | Parcial | Solo `entrada` (`repo.js:210`); faltan los 6 tipos restantes y stock anterior/resultante |
| 8 | Entradas y compras | Parcial | Entrada simple actualiza stock; sin ITBIS/subtotal/total de compra ni multi-línea |
| 9 | Recetas y descuento automático | **Falta** | No hay modelo ni consumo; SQL ya define `recetas` + función de consumo |
| 10 | Control de cocina | Cumple* | Kanban 4 estados + tiempo + sin montos (`kitchen.view.js:8-28`); *sin indicaciones |
| 11 | ITBIS e impuestos | Parcial | Tasa global; sin por-producto, exentos, ITBIS incluido, tasaloe specificas |
| 12 | Caja | **Falta** | Sin sesiones/movimientos/arqueo; SQL define `caja_sesiones`,`movimientos_caja`,`cerrar_caja` |
| 13 | Gastos | **Falta** | Sin módulo; SQL define `gastos` |
| 14 | Proveedores | Parcial | CRUD base; sin dirección, productos suministrados, historia de compras |
| 15 | Reportes | Parcial | 5 períodos + 6 tipos; sin gastos/mermas/vendedores/caja/compras/utilidad |
| 16 | Exportación Excel | Parcial | 6 hojas reales; faltan Vendedores, Métodos, Compras, Gastos, Mermas |
| 17 | Seguridad y autenticación | Parcial | PBKDF2 local + Supabase opcional; **RLS incompleto** (§7.4), datos sensibles no asegurados end-to-end |
| 18 | Auditoría | **Falta** | Sin `registro_auditoria` local; SQL lo contempla |
| 19 | Diseño y experiencia | Cumple | Responsive probado + dark mode + drawer móvil |
| 20 | Tecnologías | Cumple | HTML5/CSS3/JS + Supabase/Postgres vía REST; PWA offline |
| 21 | Estructura general | Parcial | 8 de 12 módulos; faltan Categorías, Caja, Gastos, Auditoría |
| 22 | Objetivo del proyecto | Cumple | Alineado a la visión de centralización |

**Resultado: 5 Cumple / 13 Parcial / 4 Falta ≈ 58 % de cobertura ponderada** (núcleo operativo ~80 %; control de negocio ~25 %).

---

## 6. Brechas priorizadas

Prioridad: **P0** = bloquea venta bajo contrato; **P1** = requerido para producto completo de ficha; **P2** = evolución.

| # | Brecha | Fichas | Estado | Esfuerzo (días) | Notas clave |
|---:|---|---|---|---:|---|
| 1 | **Esquema Supabase v2 + RLS real + Auth híbrido** + adaptadores sync | §17 | — | 10 | resolver incompatibilidades de §7; códigos de orden por secuencia remota |
| 2 | **Recetas + consumo automático** | §9 | Falta | 6 | UI de receta + llamada a función/procedimiento + movimiento `consumo_venta` |
| 3 | **Caja** (sesiones, entradas/retiros, arqueo, cierre) | §12 | Falta | 6 | `caja_sesion_id` nullable inicialmente para no romper POS |
| 4 | **Gastos operativos** | §13 | Falta | 3 | categorías fijas + nota + vínculo opcional a caja |
| 5 | **Vendedor + descuentos autorizados + anulación + propina legal** | §4, P0 | Falta | 5 | pin de autorización (ya en SQL `perfiles.pin_autorizacion`), propina 10 % |
| 6 | **Talonario de precios** (listas/historial/redondeo/ITBIS incluido) | §5, §11 | Falta | 4 | ver §8 |
| 7 | Categorías CRUD | §5, §21 | Falta | 2 | tabla `categorias` (orden+activa ya en SQL) |
| 8 | SKU + descripción + imagen + ITBIS por producto | §5 | Falta | 3 | migración: generar SKU p/ datos actuales |
| 9 | Movimientos completos (6 tipos + stock anterior/resultante + motivo) | §7 | Parcial | 4 | alinea con `inventario_movimientos` |
| 10 | Compras multi-línea con ITBIS/subtotal/total | §8 | Parcial | 4 | `compras` + `compra_detalles` |
| 11 | Auditoría | §18 | Falta | 4 | hook en persist() + vista `auditoria` |
| 12 | Reportes ampliados + Excel 10 hojas + dashboard KPIs | §15, §16, §3 | Parcial | 7 | gastos, mermas, vendedores, caja, compras, costos/utilidad |
| 13 | Permisos granulares por usuario | §2 | Falta | 3 | matriz accion × rol en `perfiles` |
| 14 | Cocina: indicaciones + tiempos/métricas | §10 | Parcial | 2 | `orden_detalles.notas` ya existe |
| 15 | Pagos mixtos / pagos parciales | §4 | Falta | 4 | tabla `pagos` (SQL solo enum `mixto`) |
| 16 | P1 varios (PWA push, notif reales, impresión térmica) | — | Falta | 6 | impresión útil para ticket físico |
| 17 | **P2 e-CF/NCF + 606/607** | extra ficha | Falta | 15–20 | obligatorio comercialmente (Ley 32-23) |
| 18 | P2 multi-sucursal | §6 N/D (no en ficha expl?cita) | Falta | 8 | `location_id` |
| 19 | P2 migración React+Vite | §20 | — | n/a | ficha lo prevé evolutivo, no urgente |

**Totales**: F0–F2 (ventas listas) ≈ **53 días** (items 1–5, 7, 11, 12). Producto completo de ficha ≈ **66–68 días** (sin e-CF). Con e-CF ≈ **83–88 días**.

---

## 7. Supabase — esquemas existentes, compatibilidad y seguridad

Fuente: `vanilla/docs/gemini-code-1793550228913.sql` (DDL), `…239989.sql` (RLS + vistas), `…244332.sql` (funciones), `…261768.sql` (seed). 14 tablas, 3 vistas, 4 funciones, 1 trigger.

### 7.1 DDL existente (resumen)
- Enums: `rol_usuario(admin,cajero,cocinero)`, `estado_orden(nueva..anulada)`, `tipo_movimiento_inv(entrada,consumo_venta,merma,desperdicio,ajuste,devolucion,consumo_interno)`, `metodo_pago(efectivo,tarjeta,transferencia,mixto)`, `tipo_movimiento_caja(entrada,retiro,gasto)`.
- Tablas: `perfiles(id←auth.users, nombre, rol, pin_autorizacion, activo)`, `categorias`, `productos(codigo UNIQUE, categoria_id, tasa_itbis, imagen_url)`, `proveedores`, `inventario(proveedor_pref_id)`, `recetas(PK producto+inventario, cantidad_requerida)`, `caja_sesiones`, `movimientos_caja`, `gastos(salio_de_caja, caja_sesion_id)`, `ordenes(numero_orden SERIAL, caja_sesion_id NOT NULL, descuento)`, `orden_detalles(nombre_snapshot, costo_unitario, itbis_aplicado, notas)`, `cocina_tickets`, `inventario_movimientos(existencia_anterior, existencia_resultante)`, `registro_auditoria(detalles JSONB)`.
- Funciones: `trg_enviar_orden_cocina` (trigger al insertar orden), `procesar_consumo_receta(orden)` (valida stock antes de descontar → rollback si insuficiente), `cobrar_orden(orden, metodo)` (marca entregada + tickets + consumo), `cerrar_caja(sesion, declarado)` (esperado = inicial + efectivo + entradas − retiros/gastos), `reporte_resumen(desde, hasta)` (timezone `America/Santo_Domingo`).
- RLS: `ALTER … ENABLE RLS x14` con **3 políticas** y 3 vistas (POS, cocina, stock bajo).

### 7.2 Mapeo app ↔ esquema

| App (logical) | Store local | Tabla SQL | Compatibilidad |
|---|---|---|---|
| users | USERS | `perfiles` | **Parcial**: falta email/en Supabase Auth; rol `cocina` vs `cocinero`; password local PBKDF2 no migra a Auth |
| products | PRODUCTS | `productos` | **Parcial**: falta `codigo`, `categoria_id`, `descripcion`, `tasa_itbis`, `imagen_url`, `activo`; SQL falta `updated_at`, `deleted_at`, emoji/color UI |
| orders | ORDERS | `ordenes` | **Parcial**: falta `caja_sesion_id`, vendedor (`usuario_id`), `descuento`, propina; SQL falta `cliente`, `canal`, `pagado`, `items_text`, timestamps; items JSON vs `orden_detalles` |
| inventory | INVENTORY | `inventario` | **Parcial**: falta categoría del ítem, ITBIS, notas, fecha entrada; SQL falta `updated_at`, `deleted_at` |
| suppliers | SUPPLIERS | `proveedores` | **Parcial**: app tiene email/notas; SQL falta dirección/productos; ambos sin timestamps |
| movements | MOVEMENTS | `inventario_movimientos` | **Parcial**: app solo `entrada` y no guarda stock previo; SQL cubre 7 tipos; falta unidad/costo/total/proveedor |
| settings | SETTINGS | **no existe** | Crear `configuracion` |
| — | — | `categorias`, `recetas`, `caja_sesiones`, `movimientos_caja`, `gastos`, `orden_detalles`, `cocina_tickets`, `registro_auditoria` | **No mapeadas localmente** (8 módulos nuevos en F1) |

### 7.3 Incompatibilidades que rompen hoy el sync/POS (P0 del esquema)
1. **`updated_at` ausente en 13/14 tablas** → el pull incremental y el LWW de `sync.js:135-147` no funcionan. Añadir columna + trigger `set_updated_at`.
2. **`deleted_at` ausente** → el app nunca borra físicamente; sin la columna un DELETE físico remoto chocaría con el soft delete local.
3. **`ordenes.caja_sesion_id NOT NULL`** → el POS actual no puede insertar. Opciones: (a) nullable en F0 y tight en F1; (b) auto-sesión "Mostrador". **Decisión recomendada: (a).**
4. **`productos.codigo NOT NULL UNIQUE`** → generar SKU al migrar (`ALI-006` estilo del seed ya es un buen patrón).
5. **Items JSON (app) vs `orden_detalles` (SQL)** → adaptador de sincronización: upsert `ordenes` (sin items) + reemplazar hijos. Con `updated_at` padre e hijos consistentes.
6. **`numero_orden SERIAL` global** vs `#1049` local → en deploy dedicado, seguir la secuencia remota y formatear `#`+secuencia; en SaaS compartido (si se usa), secuencia por negocio vía función.
7. **`cocina_tickets` duplica `ordenes.estado`** → tratar como vista materializada/projection o eliminar; el trigger se mantiene si se opta por de-normalizar para KDS.
8. **`cerrar_caja` ignora pago mixto y propina**, y los gastos pueden doble-contarse si van a `gastos` y también a `movimientos_caja(tipo=gasto)` → unificar: `gastos` con `salio_de_caja=true` entra al arqueo; evitar doble registro.
9. **Sin `configuracion`** (tasa ITBIS, moneda, redondeo, listas de precios). Añadir con formato key-value JSONB como `settings` local.
10. **Sin tenant/location** → decisión comercial (§13.2): deploy **dedicado por negocio** lo vuelve innecesario; si se escala a SaaS compartido, añadir `tenant_id` + RLS por tenant.

### 7.4 Seguridad (hallazgos del SQL actual)
- **Policies insuficientes**: solo 3 `SELECT`. Con RLS habilitado y sin políticas de escritura, **el cliente con anon/JWT no podrá INSERT/UPDATE** (debe corregirse). F3 define plantillas por rol.
- **Vistas sin `security_invoker=true`** (PG15+): pueden filtrar filas bajo RLS según el owner; crearlas con `WITH (security_invoker = true)`.
- **Funciones `SECURITY DEFINER` sin `SET search_path`, sin check de rol y sin `GRANT` restringido**: cualquier autenticado puede llamar `procesar_consumo_receta`, `cobrar_orden`, `cerrar_caja`, `reporte_resumen`; también exponen `auth.uid()` inconsistente en triggers. Añadir `SET search_path = public`, verificación de rol (`perfiles.rol`), y `REVOKE` a `anon`.
- **`pin_autorizacion` en texto plano** → hash (PBKDF2/argón2 vía extensión o Edge Function) y comparación servidor-side.
- **`perfiles` legible por todos los autenticados** expone el PIN (hoy texto plano): restringir columnas sensibles vía vista segura.
- Anon key en el navegador es **correcto** siempre que todas las tablas tengan RLS por rol; el service_role jamás debe salir del backend (ya está advertido en la UI de config).

### 7.5 Modelo canónico propuesto (delta sobre el SQL actual)
Nuevas tablas: `configuracion`, `pagos(orden_id, metodo, monto, referencia)`, `compras`, `compra_detalles`, `price_lists(id, nombre, canal, moneda, activa, vigencia_desde/hasta)`, `price_list_items(lista, producto, precio, itbis_incluido)`, `price_history(producto, precio_anterior, precio_nuevo, usuario, motivo, fecha)`. Columnas nuevas: `updated_at`/`deleted_at` en todas; `ordenes.usuario_id→vendedor`, `ordenes.propina`, `ordenes.cliente textual opcional`; `inventario.categoria, itbis, notas, fecha_entrada`; `proveedores.email, direccion, productos`; `registro_auditoria.ip/ua` (opcional). Estructural: `cocina_tickets` → proyección; secuencias de órdenes por negocio si se comparte 1 proyecto entre varios.

### 7.6 Plan de migración y validación (sin ejecutar SQL desde aquí)
1. Crear script `04-migraciones.sql` idempotente con el delta de §7.5 + triggers `updated_at`.
2. Reescribir `02-rls.sql` completo: policies por tabla/rol (SELECT todos autenticados; INSERT/UPDATE/DELETE admin; cocina solo `ordenes.estado` y `inventario_movimientos(consumo_venta)`; auditoría insert-only; configuración solo admin) + `security_invoker` en vistas.
3. Endurecer funciones (§7.4) y probar stock-insuficiente rollback.
4. Ajustar `config.js` (agregar tablas nuevas al mapeo), `sync.js` (`PULL_TABLES` + adaptador items/detalles), `db.js` (`DB_VERSION 2` con stores nuevos: `categories`, `order_details`, `payments`, `recipes`, `cash_sessions`, `cash_movements`, `expenses`, `audit_log`, `price_lists`, `price_list_items`, `price_history`), `seed.js` (`SCHEMA_VERSION 2`).
5. Checklist de prueba: dual-device conflict, offline→online, stock rollback, cierre de caja con mixto+propina, RLS por rol via PostgREST, migración de un cliente demo a producción.

---

## 8. Talonario de precios — módulo y tarifario

### 8.1 Capacidad actual vs. requerida
Hoy: precio único por producto (RD$, `productos.precio` placeholder del SQL), costo automático 39 %, tasa ITBIS global. No hay: listas por canal, redondeo, historial, ITBIS incluido/excluido, cambios programados, quién cambió qué.

### 8.2 Diseño funcional del módulo "Precios" (ruta `/precios`, admin)
- **Listas de precios**: por canal (Mostrador, Para llevar, Delivery, Promoción) con vigencia (desde/hasta), activa/inactiva, copia editable desde la lista base.
- **Reglas RD$**: factores globales (± %), **redondeo** al redondo comercial en 5/10/25 céntimos o al peso, y tolerancia de centavos por cálculos de ITBIS.
- **ITBIS por producto**: `tasa_itbis` por producto con flag `itbis_incluido` (precio de venta incluye el impuesto y el sistema lo separa en el ticket).
- **Historial**: cada cambio registra precio anterior/nuevo, origen (manual/lista/actualización masiva), usuario, fecha y motivo; **autorización con PIN** para cambios > X % (usa `pin_autorizacion`).
- **Update masivo por categoría** (p. ej. +4 % alitas por costo de producto) con previsualización y deshacer (usa historial).
- **Vista "talonario"** imprimible/exportable (PDF/Excel con logo del negocio, período, fecha de generación, vigencia) — reutiliza `excel.js`.
- **Margen por producto**: con receta activa, costo real (sum de ingredientes + empaque) vs. precio de la lista activa → % de margen bruto al usuario y semáforo.

### 8.3 Esquema propuesto (delta) — ver DDL en §14
`price_lists`, `price_list_items`, `price_history` (§7.5) + `productos.tasa_itbis` (ya existe) + `configuracion.redondeo/itbis_incluido`.

### 8.4 Talonario de ejemplo (RD$, con datos del seed actual del SQL)

| Código | Producto | Lista base | ITBIS excl. | ITBIS incl. (18 %) | Costo receta | % Margen bruto |
|---|---|---:|---:|---:|---:|---:|
| ALI-006 | 6 Alitas Clásicas | 350.00 | 350.00 | 413.00 | 145.00 | 58.6 % |
| EXT-PAP | Porción de Papas | 150.00 | 150.00 | 177.00 | 60.00 | 60.0 % |
| BEB-COC | Coca Cola 500 ml | 80.00 | 80.00 | 94.40 | 25.00 | 68.8 % |
| (nuevo) | Combo Pleiboi (6 alitas + papas + refresco) | 520.00 | 520.00 | 613.60 | 225.00 | 56.7 % |

Con lista "Delivery" (factor 1.05 + redondeo a 5): ALI-006 → 365; EXT-PAP → 155; BEB-COC → 85.

### 8.5 Criterios de aceptación (módulo)
1. Crear/editar lista por canal con vigencia y activar/desactivar sin tocar código.
2. Cambio masivo por categoría con preview + usuario + historial.
3. POS y tickets usan la lista activa por canal, respeta `itbis_incluido` y redondeo.
4. Solo admin edita; cambios > límite piden PIN; intentos quedan en auditoría.
5. Export del talonario con identifies del negocio y período.

---

## 9. Costos de infraestructura y operación (2026)

Tasa de conversión: **RD$60.5689/US$** (BCRD venta, 30-oct-2026).

### 9.1 Proveedores oficiales
| Servicio | Plan | Costo | Uso en este producto |
|---|---|---|---|
| Cloudflare Pages | Free | **US$0** | Hosting estático de la app (500 builds/mes, 20k archivos, 25 MiB/ítem, 100 dominios) |
| Cloudflare Pages | Pro (opc.) | US$5/mes (Workers Paid) | Solo si se añaden Functions
| Supabase | Free | US$0 | Demo/pilotos (500 MB, **pausa tras 1 semana de inactividad**, sin backups) |
| Supabase | Pro | **US$25/mes** + US$10 cada proyecto extra; **–US$10 crédito** → total N proyectos: `(15 + 10N)` USD/mes | Producción (8 GB disco, 250 GB egress, backups 7 días, sin pausa, 100 k MAU) |
| Supabase add-on PITR | opcional | US$100/mes | Solo clientes con exigencia de continuidad |
| Vercel | Pro | US$20/mes | Alternativa (no necesaria) |
| Dominio | `.com.do` | **RD$800/año** | Identidad `negocio.pollito.do` o propio |
| Dominio | `.com` | RD$635/año | Alternativa |
| Resend (email) | Free | US$0 | Hasta 3k/mes (100/día) — suficiente para notificaciones iniciales |
| Resend | Pro | US$20/mes | Si se añade resúmenes diarios a N clientes |
| e-CF / DGII | setup + mensualidad | **RD$15,000 + RD$2,500–3,000/mes** | Referencia de mercado (ComandPos); obligatorio 2027 |
| Equipos | impresora térmica 80 mm | RD$6,000–12,000 | **No incluido** en este modelo; licitación separada |

### 9.2 Costo recurrente por negocio (modo **dedicado**, organización única de Supabase)
Base: infra `(15 + 10N)×60.5689` y soporte 1.5 h/mes @ RD$800 + opex RD$250/desgl. bytes:

| Escala | Infra/negocio | Soporte+opex | **Costo total/mes/negocio** |
|---|---:|---:|---:|
| 4 clientes | RD$833 | RD$1,450 | **RD$2,283** |
| 10 clientes | RD$697 | RD$1,450 | **RD$2,147** |
| 1 piloto (org propia) | RD$1,514 | RD$1,450 | RD$2,964 |

**Modo compartido (SaaS multi-tenant, 1 proyecto)**: infra total ~RD$1,514/mes → RD$151/negocio a 10 → **costo total ~RD$1,601/mes/negocio**. Límite práctico: 8–10 negocios por proyecto (cuotas de disco/egress compartidas) → pasado eso, mover a dedicado o segunda organización.

### 9.3 Escenarios a 1 / 10 / 50 clientes (modo dedicado, RD$/mes total)
| N | Infra (15+10N)×60.57 | Soporte total | Dominio+email+monitoreo | **Total mes** | Por negocio |
|---:|---:|---:|---:|---:|---:|
| 1 | 1,514 | 1,450 | 137 | **3,101** | 3,101 |
| 10 | 6,966 | 14,500 | 137 | **21,603** | 2,160 |
| 50 | 31,193 | 72,500 | 137 | 103,830 | 2,077 |

Con 50 clientes conviene negociar plan anula de Supabase/Team o comprar capacity; el soporte escala lineal (se puede bajar a 1 h/negocio con tooling). **Modo compartido a 50 clientes: infra RD$1,514 + riesgo de cuotas**, no recomendable.

### 9.4 Costos ocultos y de oportunidad
- **Costo de desarrollo pendiente F0–F2** ≈ 53 días × RD$4,000 = **RD$212,000** (una vez, se amortiza en el precio de venta del paquete, no en el mensual).
- Soporte: el costo real es el tiempo; mantener logs de horas para reprecificar.
- Pasarela de cobro de suscripciones (si se usa tarjeta/ACH en RD): ~2–4 % del valor cobrado.
- Marketing de captación (p. ej. LinkedIn/paid 2,000–6,000 por conversión en RD**estimado**): incluir en el plan de ventas, no en el precio.
- Contabilidad/legal: RD$2,500–5,000/mes si se terceriza.

---

## 10. Precios por negocio — paquete completo personalizado

Leído del cliente: **venta completa, personalizada por negocio**, incluye base de datos real y contrato. Los planes a continuación son el **paquete cerrado por negocio** (todos los módulos incluidos, sin add-ons de venta); los add-ons opcionales se listan en §10.4.

### 10.1 Qué incluye el paquete (por cada negocio)
1. App PWA vanilla + sync Supabase (proyecto **dedicado** al negocio).
2. Personalización: logo/colores, menú/productos/precios (talonario), ITBIS/moneda, usuarios y roles, notificaciones, dominio y `ranking de categorías`.
3. Migración de datos actuales (hasta 500 productos/insumos; formato Excel/CSV/legado).
4. Capacitación (2 sesiones: admin/caja ~1.5 h, cocina ~0.5 h) + manual + tickets por 60/90 días.
5. **Base de datos real** del negocio migrada al Supabase nuevo + backup inicial + checklist de continuidad (§13.3).
6. Contrato mensual con SLA (según plan) y propiedad de datos del cliente.

### 10.2 Tres planes (precios en RD$, **sin ITBIS**)

| Plan | Setup (una vez) | Mensualidad | Usuarios | Infra | Ideal para |
|---|---:|---:|---:|---|---|
| **Esencial** | RD$18,000 | **RD$2,900** | hasta 5 | Compartido (o dedicado a 4+ clientes) | Food trucks y negocios con 1 caja |
| **Pro** (recomendado) | RD$25,000 | **RD$4,500** | hasta 15 | **Dedicado** | Restaurantes/food trucks en crecimiento |
| **Premium** | RD$45,000 | **RD$8,500** | ilimitados, multi-sucursal | Dedicado + herramientas | Multi-punto con exigencia de SLA 8h |

Promo de lanzamiento (fijada por JyB): **primer mes gratis y setup –25 %** para los primeros 5 negocios (equivale a Fundador). Preparación de e-CF: addon ú cursa cuando F4 esté disponible.

### 10.3 **Tabla 1 — Precio con markup sobre costo (+10 % y +25 %)**

`precio = costo base × (1 + markup)`

| Concepto | Costo base RD$ | **+10 % markup** | Margen bruto result. | **+25 % markup** | Margen bruto result. |
|---|---:|---:|---:|---:|---:|
| Costo recurrente/mes/negocio (10 clientes) | 2,147 | **2,362** | 9.09 % | **2,684** | 20.00 % |
| Costo recurrente/mes/negocio (4 clientes) | 2,283 | **2,511** | 9.09 % | **2,854** | 20.00 % |
| Implementación (Esencial, 5 d × 3,500) | 17,500 | **19,250** | 9.09 % | **21,875** | 20.00 % |
| Implementación (Pro, 8 d × 3,500) | 28,000 | **30,800** | 9.09 % | **35,000** | 20.00 % |
| Implementación (Premium, 12 d × 3,500) | 42,000 | **46,200** | 9.09 % | **52,500** | 20.00 % |
| Desarrollo pendiente F0–F2 (53 d) | 212,000 | **233,200** | 9.09 % | **265,000** | 20.00 % |
| Infra año 1 (org+dominio+7d backups) | 18,970 | **20,867** | 9.09 % | **23,713** | 20.00 % |
| **Paquete técnico completo F0–F2 (desarrollo+infra)** | **230,970** | **254,067** | 9.09 % | **288,713** | 20.00 % |

### 10.4 **Tabla 2 — Precio con margen bruto fijo (+10 % y +25 %)**

`precio = costo base / (1 − margen)` → markup implícito 11.11 % y 33.33 %

| Concepto | Costo base RD$ | **Margen bruto 10 %** | Markup implícito | **Margen bruto 25 %** | Markup implícito |
|---|---:|---:|---:|---:|---:|
| Costo recurrente/mes/negocio (10 clientes) | 2,147 | **2,386** | 11.11 % | **2,863** | 33.33 % |
| Costo recurrente/mes/negocio (4 clientes) | 2,283 | **2,537** | 11.11 % | **3,044** | 33.33 % |
| Implementación (Esencial) | 17,500 | **19,444** | 11.11 % | **23,333** | 33.33 % |
| Implementación (Pro) | 28,000 | **31,111** | 11.11 % | **37,333** | 33.33 % |
| Implementación (Premium) | 42,000 | **46,667** | 11.11 % | **56,000** | 33.33 % |
| Desarrollo pendiente F0–F2 | 212,000 | **235,556** | 11.11 % | **282,667** | 33.33 % |
| **Paquete técnico completo F0–F2** | **230,970** | **256,633** | 11.11 % | **307,960** | 33.33 % |

**Lectura ejecutiva**
- El **piso** para no operar en pérdida es la columna "Costo base". Con **+25 % markup** el precio de venta del mensual queda en RD$2,684 (10 clientes) — el plan **Esencial a RD$2,900** cubre ese piso **con margen bruto 26 % logrado reales sobre precio** (2,900 − 2,147)/2,900; y el estado a 4 clientes es 21 %.
- El plan **Pro a RD$4,500** sobre costo RD$2,147 logra 52 % de margen bruto — defensible contra Cuadre (RD$4,000) con infra dedicada, backups y SLA.
- El desarrollo F0–F2 debe recuperarse vía los setup a lo largo de… los **primeros 8–12 ventas**; el paquete técnico "puro" (si se vendiera como activo) tiene piso RD$231k, con rangos de comercialización RD$254k–308k según margen objetivo (§13.6).
- **ITBIS 18 % se suma aparte** en todas las cotizaciones (RD$4,500 + ITBIS = RD$5,310 como Cuadre muestra en su web).

### 10.5 Comparativa de mercado RD (2026) — referencia de posicionamiento
| Competidor | Precio | Notas |
|---|---|---|
| Kuenta POS | RD$650/mes + setup RD$10,000 | Básico, límites de productos/usuarios |
| RestaurantOS Pro | RD$1,989/mes (+ITBIS) | Todo incluido; setup DGII incluido de regalo; precio fundador |
| POS DO | RD$2,249/mes | POS restaurante + e-CF vía pasarela |
| **Pollito Pleibi (nuestro)** | **RD$2,900–8,500/mes + setup 18k–45k** | nombre comercial del paquete |
| Cuadre | RD$4,000/mes (+ITBIS) | 14 días prueba; todo ilimitado |
| WiPOS (FoodTruck) | US$58/mes + equipo desde US$999 | Rápido pero requiere hardware propio |
| ComandPos | RD$5,000–9,999/mes/sucursal + impl RD$30k–65k | Nivel empresarial |

**Posicionamiento recomendado**: anclar el Pro a RD$4,500 (justo encima de Cuadre con infra dedicada, bajo ComandPos Starter con implementación más referida a comida venezolana/caribeña y customización por negocio), y el Esencial a RD$2,900 (compite directa con RestaurantOS Pro).

### 10.6 Add-ons (opcionales, precio en RD$ sin ITBIS)
| Add-on | Precio |
|---|---:|
| Migración extendida (más de 500 registros o datos legado complejos) | 5,000–15,000 |
| e-CF/NCF (cuando esté F4) | setup 15,000 + 2,800/mes |
| Terminal adicional (caja extra) | 900/mes |
| Hora de soporte fuera de plan | 1,200 |
| Capacitación adicional (sesión 1.5 h) | 3,500 |
| Gestión de dominio propio del cliente (.com.do + DNS) | 900/año |
| Integración pasarela de pagos (Azul/CardNet/ACH) | 10,000 + variable |
| Reporte o filtro personalizado a medida | 6,000 c/u |

---

## 11. Planes de pago para vender la aplicación

### 11.1 Modalidades (ejemplo numérico con plan **Pro**: setup RD$25,000 + RD$4,500/mes)
| Plan de pago | Estructura | Recargo / descuento | Total año 1 (sin ITBIS) |
|---|---|---|---:|
| **Híbrido estándar (recomendado)** | 50 % setup a la firma, 50 % en puesta en marcha; mensualidad desde el paso 1 | — | 79,000 |
| **Contado anual** | Setup completo + 12 mensualidades por adelantado | **−5 %** | **75,050** |
| **3 pagos (sin recargo)** | Setup: 50/25/25; mensualidad normal | — | 79,000 |
| **6 cuotas setup** | Setup +8 % en 6 pagos; mensualidad normal | +8 % | 80,500 |
| **12 cuotas setup** | Setup +15 % en 12 pagos igual a 2,396/mes; mensualidad normal | +15 % | 82,250 |
| **Suscripción pura (sin setup)** | RD$5,900/mes, permanencia 12 meses, setup amortizado | — | 70,800 |

### 11.2 Ejemplo de flujo de caja (Pro estándar, año 1) — sin ITBIS
| Mes | Ingresos | Costos (impl+recurrentes) | **Saldo del mes** |
|---:|---:|---:|---:|
| M1 | 12,500 + 4,500 = 17,000 | 14,000 (impl) + 2,147 = **16,147** | **853** |
| M2 | 12,500 + 4,500 = 17,000 | 14,000 + 2,147 = 16,147 | **853** |
| M3–M12 | 4,500/mes | 2,147/mes | **2,353/mes** |
| **Año 1** | **79,000** | **49,767** | **29,233 (37 %)** |

Con bonus de Fundador (setup −25 % y 1er mes gratis): año 1 ingresos = 18,750+18 = 49,250; margen aún positivo 992 si se acepta el impulso de captación. **Recomendación**: usar Fundador solo en 5 negocios con testimonial referido.

### 11.3 Cláusulas del contrato
- **Permanencia 12 meses** si el setup tuvo descuento o se financió; cancelación anticipada paga el setup restante amortizado.
- **Propiedad del código**: licencia de uso al negocio en el modelo mensual; **cesión total** solo en el modelo de activo (§13.6).
- **Propiedad de los datos**: 100 % del cliente; exportación Excel/JSON cualquier momento; al terminar, entrega del dump Postgres.
- **e-CF**: la habilitación DGII es responsabilidad del negocio; JyB configura y soportaогда el módulo.
- **SLA por plan**: Esencial 2 días hábiles (WhatsApp), Pro 1 día hábil + backups gestionados, Premium 8 h hábiles.
- **Ajuste anual** de precios por inflación/FGX (tipo "las mensualidades pueden ajustarse una vez al año según inflación y tipo de cambio del dólar" — práctica de mercado ya aplicada por ComandPos).
- **Mora/desconexión**: 5 días hábiles de gracia, luego lectura solo-fichero hasta Regularizar.
- **Hardware**: no incluido (impresoras/gaveta/tablet), se asesora la compra.

---

## 12. Unit economics y punto de equilibrio

Supuestos: soporte 1.5 h/mes @RD$800; opex RD$250; infra dedicada/sean compartidas según plan; sin pasarela (cobro por transferencia/ACH manual en fases iniciales).

| Plan | Precio/mes | Costo variable/mes | **Contribución** | % margen bruto |
|---|---:|---:|---:|---:|
| Esencial (compartido, 10c) | 2,900 | 1,601 | **1,299** | 45 % |
| Esencial (dedicado, 4c) | 2,900 | 2,283 | **617** | 21 % |
| Pro (dedicado, 4c) | 4,500 | 2,283 | **2,217** | 49 % |
| Pro (dedicado, 10c) | 4,500 | 2,147 | **2,353** | 52 % |
| Premium (dedicado, 10c) | 8,500 | 2,147 | **6,353** | 75 % |

**Punto de equilibrio mes **fijo** (costos del negocio de JyB, nómina mínima, herramientas): usar el plan Pro y dedicado como referencia: a 10 clientes, contribución mensual total ≈ RD$23,530 → cubre RD$23,500 de estructura. **A 4–6 clientes Pro se cubre la estructura de un desarrollador part-time + comercial.**

**Interpretación comercial**: la mensualidad paga la operación temprana; el setup paga el desarrollo y customización individual. Con 25 clientes Pro, margen bruto anual ≈ RD$705,600 (2,353×25×12) — el negocio se sostiene con 2 personas de soporte y una de desarrollo.

---

## 13. Venta completa personalizada por negocio (incluye DB real + contrato)

### 13.1 Definición del paquete
Cada negocio llama a comprar **una instancia completa**: la app personalizada + su propio proyecto Supabase + sus datos + su contrato mensual. No se venden módulos sueltos (evita soporte fragmentado).

### 13.2 Arquitectura recomendada por venta: **proyecto Supabase dedicado por negocio**
- Ventas frente a compartido: aislamiento total de datos (incidentes, RLSD, backup del cliente), transferencia limpia cuando el cliente pida "salir con sus datos", sin `tenant_id` nuevo, numeración de órdenes sin hacks, quota por negocio.
- Costo: el primero de la organización **incluye** (US$25 org) y los demás **+US$10/mes**: a 10 negocios, infra total RD$6,966/mes (RD$697/negocio) — aún viable con el plan Esencial a RD$2,900.
- Cuando el negocio supere ~RD$40k/mes de factura propia, evaluar cotización que dedujo infra en su Setup (transparencia de costos).

### 13.3 Transferencia de la base de real y el contrato
1. **Tratamiento legal**: el negocio es dueño de sus datos; la venta/cauación requiere **consentimiento explícito del cliente** (Ley 172-13 de Protección de Datos Personales, DR) y actualización del contrato.
2. **Backup previo**: dump `pg_dump` completo + export local Excel/JSON antes de cualquier cambio.
3. **Procedimiento**: (a) BAF de los reportes históricos; (b) migración al proyecto Supabase nuevo con delta; (c) pruebas con dataset real (anonymized if Multi-tenant) + comparación de totales; (d) firma de acta de entregado y recibido; (e) rotación de credenciales y anon keys.
4. **Confidencialidad testigo**: clause NDA durante la transición y provisión de datos a JyB hasta el día del cutover; **recurso de escrow** (depositar código y configuración en un custodio o usar Supabase "Organization Transfer") para asegurar continuidad.
5. **Validación de migración** (datos anonimizados de terceros / PII de clientes del negocio): reglas de retención (p. ej. eliminar PII de pedidos > 12 meses) al ir a PRO nuevo.

### 13.4 Personalización por negocio
La customización se resuelve **sin fork de código** la primera etapa: `configuracion` (nombre business, RNC, teléfono, dirección, moneda, ITBIS, redondeo, listas de precios, notificaciones) + branding CSS variables (colors/emoji/logo). Fork real ADD-ON solo si el negocio paga customization cumplidas por demanda a tarifa RD$1,200/h.

### 13.5 "Salida del cliente" (exit)
Si el cliente quiere cancelar: se entrega dump de DB + código de despliegue estático (dominio propio opcional) + scripts de re-config, y se retira la supervisión/compromiso. Con eso el producto **no queda de rehén** y el contrato es honesto (aluded por ComandPos/RestaurantOS Pro como diferenciador).

### 13.6 Anexo: venta del activo completo (opcional, si en algún momento se vende el "proyecto" entero)
- **Valor base** (costo presente): desarrollo F0–F2 RD$230,970 + valor de lo ya construido (prototipo ≈ 30 días × RD$4,000 = RD$120,000) + infra año 1 RD$18,970 + legal/contingencia 10 % = **≈ RD$410,970**.
  - **+10 % markup**: **≈ RD$452,000** (margin 9.1 %).
  - **+25 % markup**: **≈ RD$513,700** (margin 20 %).
  - **Margen bruto 10 % fijo**: ≈ RD$456,000. **Margen bruto 25 % fijo**: ≈ RD$547,960.
- **Mínimo considerar valor de cartera**: cada contrato mensual Pro (RD$4,500/mes) con 1.5–3× sobre su anualidad → +RD$81,000–162,000 por contrato activo.
- Incluye: código, documentación, dominio, organización Supabase, contratos cedidos, marca Polito Pleibi (licencia o transferencia), capacitación de implementación al comprador, 30 días de supporte de transición.
- Formas de pago del adquiriente: contado con descuento 3–5 %, 3–6 pagos o **earn-out** (20 % pagado según rendimientos 12 meses).

---

## 14. Roadmap de implementación de las funciones restantes

Principios: migraciones no destructivas; feature flags; sync compatible con datos existentes; pruebas E2E por funcionalidad; orden groomed por dependencias.

### F0 — Fundación (5 días)
- `DB_VERSION 2` y migración IndexedDB de stores nuevos; `SCHEMA_VERSION 2`.
- Migración SQL (delta §7.5): `updated_at`+trigger en 14 tablas, `deleted_at`, tablas nuevas (`configuracion`, `pagos`, `compras`+`compra_detalles`, `price_lists`+`price_list_items`+`price_history`); `caja_sesion_id` nullable; RLS de base.
- Adaptador de mapeo español↔inglés (`sync.js`: `mapTable` + `PULL_TABLES` extendidos; `config.js`: mapeo completo; `supabase.js` sin cambios).
- Feature flags en `configuracion` para activar módulos por negocio (beta/rollout).
- **Aceptación**: sync bidireccional de las 7 tablas actuales y las nuevas; offline→online sin pérdida; backup/restore local OK.

### F1 — Núcleo de negocio (37 días)
| # | Función | Archivos nuevos/modificados | Esquema | Aceptación |
|---:|---|---|---|---|
| 1 | Categorías CRUD | `views/categorias.view.js`, `repo.js saveCategory/deleteCategory` | `categorias` | CRUD + orden + activa; productos cambian de categoría sin romper stats |
| 2 | Producto completo (SKU, desc., imagen, ITBIS, estado) | `product-form.view.js` | `productos` | SKU autogenerado por categoría; imagen via URL o Storage; tasa ITBIS individual |
| 3 | **Talonario / listas de precios** | `core/pricing.js`, `views/precios.view.js` | `price_lists(+items)`+`price_history`; `configuracion.redondeo` | §8.5 completa |
| 4 | **Recetas + consumo automático** | `core/recipes.js`, `views/recetas.view.js` (dentro de producto), `repo.createOrder/advanceOrder` llama deducción | `recetas`; `inventario_movimientos(consumo_venta)` | vender ALI-006 descuenta 1 lb alitas + 1 caja; bloqueo con stock insuficiente y rollback |
| 5 | Movimientos completos | `inventory-entry.view.js` ampliado, `repo.logMovement` | `inventario_movimientos` (7 tipos) | salida/merma/ajuste/devolución/consumo interno con stock anterior/resultante y motivo obligatorio |
| 6 | Compras multi-línea con ITBIS | `views/compras.view.js`, `repo.addPurchase` | `compras`+`compra_detalles` | compra con varias líneas suma stock y registra ITBIS/subtotal/total y proveedor |
| 7 | **Caja** completa | `core/cash.js`, `views/caja.view.js` | `caja_sesiones`+`movimientos_caja`; `ordenes.caja_sesion_id` | apertura con monto inicial; ventas retiros/gastos por sesión; cierre con esperado vs declarado y diferencia; guard: cajero no puede crear orden si caja cerrada (configurable) |
| 8 | **Gastos** | `views/gastos.view.js`, `repo.saveExpense` | `gastos` | CRUD + categorías + reportes + vincular a caja opcional sin doble conteo |
| 9 | Vendedor + descuentos + anulación + propina | `pos.view.js`, `modal.js`, `repo.createOrder` | `ordenes.usuario_id`, `descuento`, `propina`, estado `anulada` | orden lleva vendedor = usuario de sesión; descuento requiere PIN si >x %; anulación deja traza; propina legal 10 % opcional (activable por tipo de negocio) |
| 10 | Pagos mixtos | `modal.js` checkout, `repo` | `pagos` | hasta 3 métodos con montos; total de pagos = total (o propina) |

### F2 — Control y visibilidad (11 días)
- Auditoría: hook en `repo.persist()` → acciones sensibles (login, producto creado/precio, ajuste inventario, anulación venta, admin changes, aperturas/cierres caja) → `registro_auditoria` + vista `views/auditoria.view.js` con filtros.
- Reportes: tipos nuevos (gastos, mermas, vendedores, caja, compras, costos/utilidad) + Excel 10 hojas (Ventas, Productos, Vendedores, Métodos, Inventario, Movimientos, Compras, Gastos, Mermas, Detailo) + dashboard KPIs ampliados (semana/mes, vendedor, utilidad real con recetas).
- Cocina: indicaciones (notas por ítem desde POS) y tiempo promedio por estatus.
- **Aceptación**: fiscales de cierre cuadran contra caja; Excel incluye todas las hojas de ficha §16.

### F3 — Seguridad, Auth y sync endurecimiento (10 días)
- RLS completo por rol (plantilla §7.4) + `security_invoker` en vistas + hardening de funciones + hash de PIN; GRANT content replay con PostgREST (test via bunnen).
- Supabase Auth híbrido: migración de usuarios locales → auth.users + perfiles; local-first mantiene sesión offline (offline login con credenciales cacheadas cifradas con la clave de plataforma/IndexedDB).
- Numeración de órdenes por secuencia remota; idempotencia de upsert por `id`+`updated_at`; `device_id` en outbox para trazabilidad.
- **Aceptación**: penetración de alto nivel: cajero no puede leer caja de otro, cocina no puede precios, auditoría inmutable.

### F4 — Cumplimiento RD (20 días, opcional pero comercial clave)
- NCF sencillos y consecutivos por tipo (B01/B02/B14/B15) + e-CF vía proveedor tecnológico autorizado (setup/apertura) + registros 606/607 listos.
- Propina legal 10 % separada en ticket, ITBIS por producto, impresión térmica (ticket de orden y de cobro — ESC/POS vía impresora compatible (ESC/POS) si el negocio tiene). 
- **Aceptación**: emisión real con ambiente de producción DGII para un cliente piloto.

### F5 — Endurecimiento y lanzamiento (10 días)
- E2E completo (Playwright) de los 15 flujos comerciales, pruebas de carga (~50 concurrentes en POS demo), UAT con 2 negocios reales, manuales y capacitación, despliegue supervisado del primer contrato (cutover §13.3).
- **Aceptación**: primera venta facturada con contrato y DB real.

**Sumario del esfuerzo**: F0–F2 = **53 d**; con F3/F5 = **73 d**; con F4 = **93 d**. Con 1 desarrollador: ~12–15 semanas; con 2: ~7–8 semanas. **El MVP vendible (F0–F2) desbloquea la venta completa a ~53 día**s y el resto se va soltando como Actualizaciones por negocio incluidas en la mensualidad.

### 14.1 DDL propuesto (extracto, sin ejecutar)
```sql
-- ajustes mínimos para compatibilidad con la app
ALTER TABLE ordenes ALTER COLUMN caja_sesion_id DROP NOT NULL;
ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS propina NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cliente VARCHAR(120), ADD COLUMN IF NOT EXISTS canal VARCHAR(24) DEFAULT 'Mostrador';
ALTER TABLE productos ADD COLUMN IF NOT EXISTS itbis_incluido BOOLEAN DEFAULT false;
CREATE TABLE IF NOT EXISTS configuracion (
  key TEXT PRIMARY KEY, valor JSONB NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS price_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), nombre VARCHAR(60) NOT NULL,
  canal VARCHAR(24) NOT NULL DEFAULT 'Mostrador', moneda VARCHAR(3) NOT NULL DEFAULT 'RD$',
  activa BOOLEAN DEFAULT true, vigencia_desde DATE, vigencia_hasta DATE,
  updated_at TIMESTAMPTZ DEFAULT NOW(), deleted_at TIMESTAMPTZ
);
-- ( price_list_items y price_history en el script completo del F0 )
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $fn$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $fn$;
-- trigger factory: FOR EACH ROW en las 14 tablas sincronizadas
```

---

## 15. Riesgos y supuestos

| # | Riesgo | Impacto | Mitigación |
|---:|---|---|---|
| 1 | e-CF obligatorio 2027 (Ley 32-23): no ir a mercado sin el módulo reduce ventas a negocios con NCF | Alto | Priorizar F4 (≤20 días) o pactar en contrato entrega antes de 2027 |
| 2 | Uso de `SECURITY DEFINER` sin revisión de rol puede escalar permisos | Alto | Revisi?n controlada de F3 + pruebas (§14) |
| 3 | Propina legal 10 % ausente en ficha | Medio | F1-9; activarse por tipo de negocio |
| 4 | Supabase Free se pausa: usarlo en producción | Alto | Pro desde día 1 en cada cliente (costo ya modelado) |
| 5 | Número de orden duplicado entre dispositivos | Medio | Secuencia remota (F3) |
| 6 | Conflictos offline LWW sin detección | Medio | Regla por tabla: `ordenes` solo-append; flag de conflicto en auditoría |
| 7 | Dependencia de un solo desarrollador para soporte | Medio | Manuales + runbooks + escrow (§13.3) |
| 8 | Costo por negocio si se usa e-CF vía pasarela tercero (RD$2,500–3,000/mes) | Medio | Pasar como add-on o negociar volumen |
| 9 | FX: precios colocados en RD$; si el USD sube, margen de la infra se comprime | Bajo-Medio | cláusula de ajuste anual (§11.3) |
| 10 | Migración de datos real del negocio (limpieza, cuadratura) | Medio | Alcance acotado (≤500 registros) + tarifa de migración extendida |

---

## 16. Anexos

### 16.1 Checklist de cierre de la ficha (estado final objetivo)
| § | Sección | Queda lista en |
|---:|---|---|
| 9, 12, 13, 18 | Recetas, Caja, Gastos, Auditoría | F1–F2 |
| 2, 4, 5, 6, 7, 8, 11, 14, 15, 16 | Permisos, POS completo, producto/inventario/movimientos/compras, ITBIS por producto, proveedores completos, reportes/Excel | F1–F2 |
| 17 | Seguridad end-to-end | F3 |
| extra | e-CF, propina legal, impresión | F4 |

### 16.2 Talonario imprimible plantilla (mínimo por negocio)
- Encabezado: nombre comercial, RNC, dirección, teléfono, fecha de generación, vigencia de la lista.
- Columnas: código, producto, precio lista base, precio por canal (Mostrador/Delivery/Promoción), ITBIS incluido Sí/No, % margen con receta, activo.
- Pie: generado por Pollito Pleibi, responsabilidad de precios, contacto del soporte.

### 16.3 Glosario
- **Talonario de precios**: lista/planilla oficial de precios por producto y canal en RD$.
- **e-CF**: envase comprobante fiscal electrónico (DGII). **NCF**: número de comprobante fiscal. **Propina legal**: 10 % en restaurantes (Ley 392-98).
- **LWW**: *last-write-wins* — resolución de conflicto del sync por `updated_at`.
- **Outbox**: cola de cambios pendientes de sincronizar.
- **Dedicado vs compartido**: proyecto Supabase por negocio vs. un solo proyecto multi-tenant.

### 16.4 Fuentes consultadas (2026-11-01)
- Código: `vanilla/js/**` (32 módulos, script de conteo propio).
- Ficha técnica: `vanilla/docs/Ficha_Tecnica_Pollito_Pleibi_JyB.pdf`.
- Esquemas: `vanilla/docs/gemini-code-1793550228913/239989/244332/261768.sql`.
- Precios: `supabase.com/pricing`, `developers.cloudflare.com/pages/platform/limits/`, `vercel.com/pricing`, `resend.com/pricing`, `midominio.do`, `webpoint.com.do`, `gestiondo.com.do`, `cuadre.do`, `comandpos.com/pricing`, `wiposcloud.com/food-truck`, `kuenta.me/pricing`, `pos.com.do`.
- Regulatorio: Ley 32-23 (facturación electrónica), Norma General 06-2023 DGII, Ley 392-98 (propina legal), Ley 172-13 (protección datos personales), Bank central RD `tasaus_mc.pdf`.
- Interesante: la equivalencia USD→RD$ presentada en §9 usa la tasa de venta del 30-oct-2026 vigente hasta el 2-nov-2026; para cotizaciones de largo plazo aplicar la cláusula de ajuste.

---

*Documento generado el 2026-11-01 para uso comercial interno de JyB Technology Solutions SRL. Los precios aquí recomendados son propuestos y sujetos a validación con contabilidad y al mercado.*
