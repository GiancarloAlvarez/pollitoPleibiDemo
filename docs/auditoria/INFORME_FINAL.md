# Informe consolidado de auditoría — Pollito Pleibi

**Fecha:** 2026-11-02. **Dictamen: NO-GO para producción.**
Se han recorrido las fases 0–7, con pendientes explícitos de despliegue remoto,
concurrencia PostgreSQL multiconexión, hardware, usuarios reales y validación fiscal.
Se añadieron documentación y pruebas; **no se corrigió la lógica de la app**.

## 1. Resumen ejecutivo

Funciona una base local de catálogo, ventas, cocina, entradas, reportes y exportación.
En un recorrido local, cinco ventas de 118 se procesaron hasta Entregada y
sumaron 590 adicionales, iguales en dashboard, reportes y Excel. El precio histórico
se conservó al cambiar el precio de catálogo.

Sin embargo, existen bloqueos demostrados:
- XSS almacenado en dashboard a través de cliente, producto e insumo.
- Cambio de rol y precios por llamadas al repositorio local sin autorización.
- Sincronización sin detalles, con pagos mal clasificados y cobros de órdenes pendientes.
- Numeración duplicada, actualizaciones perdidas y persistencia parcial ante fallos.
- RLS de lectura demasiado amplia y RPC privilegiadas sin controles suficientes.
- Cierre de caja SQL con doble conteo de efectivo; consumo de receta no idempotente.
- Primera recarga offline fallida por dependencia fuera del precaché.
- Funciones principales de caja, recetas, anulación y pagos divididos ausentes en la UI.

### Porcentajes y método

Se ofrece un **índice orientativo de cumplimiento observado**, no una certificación:
20 dominios funcionales normalizados de la ficha/casos, todos con igual peso;
✅ completo=1, ⚠️ parcial=0.5, ❌ falla integral o ➖ ausente=0.

- Ficha: 13 parciales, 3 con fallo integral y 4 ausentes: **32.5%** (6.5/20).
- Estándares del sector: 10 parciales y 4 no identificados: **35.7%** (5/14).
- Dominios aprobados integralmente para producción: **0/20**.

La ponderación simplifica amplitud/criticidad: un fallo de seguridad impide lanzamiento
aunque suba el índice. No equivale al porcentaje de todos los requisitos individuales,
ni al avance comercial o a un porcentaje de código terminado.

### Pruebas nuevas reproducibles

44 casos: **19 pasan, 21 fallan, 1 omitido y 3 TODO**. Los fallos se dejan visibles.
Las pruebas usan funciones reales, navegador aislado, transporte simulado y PostgreSQL
embebido con RLS real. No hubo escrituras en Supabase. Véase [Fase 7](FASE_7_RESULTADOS.md).

## 2. Fuentes, método y límites

- Referencia: `docs/Ficha_Tecnica_Pollito_Pleibi_JyB.pdf` y casos aportados por el usuario.
- Aplicación: `index.html`, `css/`, `js/`; esquema: `docs/supabase/schema_completo.sql`.
- El DDL se probó en PGlite con identidad `auth.uid()` emulada, sin alterar sus políticas.
- La inspección anónima remota de 21 tablas respondió HTTP 200 con cero filas por
  consulta limitada. Eso **no demuestra** por sí solo RLS correcto ni tablas pobladas.
- Faltan tokens reales de los tres roles y acceso SQL a un proyecto Supabase de pruebas.
- No se verificaron restore cloud, impresión física, accesibilidad humana o emisión fiscal.
- No existe historial Git accesible en esta copia; no se puede certificar su contenido pasado.

Las evidencias de fases 2–6 se produjeron en
`C:\Users\jean2\AppData\Local\Temp\opencode`: scripts `audit-security-local.mjs`,
`audit-integrity-local.mjs`, `audit-integrity-sync.mjs`, `audit-foodtruck-pwa.mjs`,
`audit-phase5.mjs`, `audit-phase6.mjs`, `phase5-results.json` y `phase6-results.json`.
Las pruebas permanentes nuevas están en `tests/audit/`; las evidencias temporales
son específicas de este equipo y no deben ser el único archivo de aceptación futuro.

## 3. Matriz de trazabilidad

La evidencia indica implementación y defectos, no aprobación de cada campo/pantalla.

| Dominio de ficha | Implementación | Estado integral | Brecha principal |
|---|---|---|---|
| Dashboard | `js/views/dashboard.view.js`, `core/analytics.js` | ⚠️ | XSS, cobertura financiera incompleta |
| POS | `views/pos.view.js`, `components/modal.js`, `core/repo.js` | ⚠️ | Sin efectivo recibido/vuelto, mixto, descuentos o anulación |
| Cocina | `views/kitchen.view.js` | ⚠️ | Estados locales funcionan; tiempo real remoto/notificaciones pendientes |
| Productos | `views/products.view.js`, `product-form.view.js` | ⚠️ | Código, imagen, descripción, impuestos y receta no administrables completos |
| Categorías | `data/seed.js`, tabla `categorias` | ➖ | Sin CRUD operativo |
| Inventario | `views/inventory*.js`, `core/repo.js` | ⚠️ | CRUD incompleto, unidades incompatibles y mínimo mal evaluado |
| Movimientos | `repo.addInventoryEntry`, tabla remota | ❌ | Stock sin movimiento y saldos incoherentes bajo concurrencia/fallo |
| Entradas/compras | `views/inventory-entry.view.js` | ⚠️ | Entrada simple; falta documento multiítem, confirmación/anulación |
| Proveedores | `views/suppliers.view.js`, `supplier-form.view.js` | ⚠️ | Campos incompletos y borrado lógico permitido con relaciones |
| Caja | Tablas/RPC SQL; indicador fijo en POS | ➖ | Sin apertura/cierre operativo en frontend |
| Gastos | Tabla SQL; etiqueta de reporte | ➖ | Sin CRUD operativo |
| Reportes | `views/reports.view.js`, `core/analytics.js` | ❌ | Incluye anuladas pagadas y depende de zona del navegador |
| Excel | `core/excel.js` | ⚠️ | Hojas faltantes, CSV incorrecto para tipos no ventas |
| Usuarios | `views/users*.js`, `core/repo.js` | ⚠️ | Gestión local no equivale a alta/baja Auth; permisos locales insuficientes |
| Auditoría | Triggers y tabla SQL | ⚠️ | Sin UI, antes/después incompleto y acciones offline/login sin demostrar |
| Configuración | `views/config.view.js` | ⚠️ | Formularios existentes; controles no garantizan comportamiento real |
| Recetas/consumo | Tabla/RPC SQL | ➖ | Sin flujo frontend conectado a venta |
| ITBIS | `core/utils.js`, configuración, POS | ⚠️ | Global configurable; falta tratamiento por producto/incluido y redondeo robusto |
| Seguridad/autenticación | Auth local/remota, router, RLS | ❌ | XSS, autoridad local manipulable y permisos SQL excesivos |
| Responsive/experiencia | `css/`, vistas y modales | ⚠️ | 81 layouts sin overflow global; contraste, foco y tactilidad con fallos |

### Inventario de BD corregido

La carga aislada del DDL produjo **21 tablas, 6 enums, 30 FKs, 45 índices** (incluidos
PK/UNIQUE), **31 triggers de usuario, 9 funciones, 3 vistas y 42 políticas RLS**.
Los bloques dinámicos crean 9 triggers de auditoría y 20 de updated_at, además de
2 de cocina. El reconocimiento inicial omitió esos objetos dinámicos.
La lista completa está en [INVENTARIO_SQL.md](INVENTARIO_SQL.md), sin afirmar que
el mismo catálogo esté desplegado en el Supabase remoto.

## 4. Hallazgos priorizados

L=ejecución local; T=transporte simulado; P=PostgreSQL embebido; C=lectura de código.

| ID | Módulo / descripción | Severidad | Evidencia | Recomendación |
|---|---|---|---|---|
| A01 | Dashboard ejecuta HTML de cliente/producto/insumo | Crítica | L; `dashboard.view.js:40-58` | Escape/renderizado como texto y regresión XSS |
| A02 | Sync omite detalles; pull sin detalles borra ítems locales | Crítica | T; `sync.js:90-108,142-143`; `schema-map.js:273-299` | Corregir contrato y validar venta completa |
| A03 | Pago tarjeta se envía efectivo; pendiente genera pago | Crítica | T; SYNC-02/03 | Usar estado/método correctos y conciliar |
| A04 | Stock/ledger/outbox no son una operación atómica | Crítica | L; `repo.js:115-118,226-227` | Transacción multistore local y operación de servidor |
| A05 | Dos entradas concurrentes suman 1 en vez de 2 | Crítica | L; `audit-integrity-local.mjs` | Actualización transaccional, bloqueo/revisión de versión |
| A06 | Cajero eleva rol/modifica precio en repositorio local | Alta | L; E6 y SEG-05 | Autoridad confiable y autorización de comandos |
| A07 | Credenciales demo públicas y fallback tras rechazo remoto | Alta | L simulado; `auth.js:129-135`, `seed.js:5` | Separar modo demo/producción y política offline |
| A08 | Cajero lee costos; cocina totales; cajero caja ajena | Alta | P; RLS-06/07/08 | Políticas/vistas y privilegios por rol/columna |
| A09 | Anon ejecuta reporte financiero privilegiado | Alta | P; RPC-01; SQL `:682-700` | Autorizar dentro del RPC y restringir EXECUTE |
| A10 | RPC permite cerrar caja ajena | Alta | P; RPC-02 | Comprobar propietario y rol bajo bloqueo |
| A11 | Cierre calcula 336 en vez de 218 | Crítica | P; CAJA-01 | Fuente única para pagos y gastos |
| A12 | Receta ejecutada dos veces descuenta dos veces | Crítica | P; RPC-03 | Idempotencia por orden/operación |
| A13 | Dos pestañas generan #1049; doble Enviar crea dos órdenes | Alta | L; INT-01/08 | ID de operación y numeración coordinada |
| A14 | Anulada pagada entra en métricas | Alta | L; `analytics.js:58-65` | Estado válido común y anulaciones separadas |
| A15 | Fecha 23:55 RD cambia de día con navegador UTC | Alta | L; `analytics.js:40-42` | Zona de negocio explícita |
| A16 | Texto final no SQL impide importar esquema | Alta | P; SQL-00; SQL `:1020-1021` | Migración/importación limpia y reproducible |
| A17 | Admin inactivo sigue siendo admin SQL | Alta | P; RLS-10; SQL `:466-473` | Revisar activo/deleted_at en autorización |
| A18 | Role frontend acepta user_metadata.role | Alta | L sintético; `supabase.js:199-203` | Fuente de rol controlada por servidor |
| A19 | Edición acepta contraseña de un carácter | Alta | L; `repo.js:284-290` | Misma política al crear/editar y Auth seguro |
| A20 | Hash de fallback no criptográfico y logout solo local | Media | C/L; `utils.js:194-217`; `supabase.js:124-126` | Rechazar fallback débil y definir revocación |
| A21 | FK nullable admite pago sin orden; precio negativo permitido | Alta | P; FK-02/CHECK-02 | NOT NULL/CHECK y validación de invariantes |
| A22 | Movimientos remotos modificables por FOR ALL autenticados | Alta | C; SQL `:794-796` | Ledger inmutable y corrección con contramovimiento |
| A23 | Primera recarga offline vacía; falta schema-map en precaché | Alta | L con SW real; FT-01/03 | Revisar grafo de módulos y probar instalación limpia |
| A24 | Backup JSON sin restore probado incluye hashes | Alta | L; `config.view.js:222-229` | Custodia, restauración y minimización de datos |
| A25 | Stock igual al mínimo no alerta | Media | L; E4 | Criterio <= consistente |
| A26 | Entrada 2 lb se suma como 2 kg | Crítica | L; INV-05 | Unidad base/conversión o rechazo |
| A27 | Proveedor/producto con relaciones permite borrado lógico | Media | L; `repo.js:155-162,263-269` | Restringir eliminación y desactivar |
| A28 | Faltan cuatro hojas y formatos de Excel | Media | L; `excel.js:185-194` | Vendedores/Compras/Gastos/Mermas y formatos |
| A29 | Fallback inventory.csv contiene ventas | Alta | L; `excel.js:166-172` | Exportar según tipo o rechazar claramente |
| A30 | Cajero invoca exportación local; UI sí restringe | Media | L; XLS-09/10 | Guard de rol y acceso real a datos protegido |
| A31 | round2(10.075)=10.07 | Media | CAL-04; `utils.js:15-16` | Política decimal coherente y prueba de frontera |
| A32 | Modal deja salir foco y no lo devuelve al cerrar | Alta | L; `modal.js:54-88` | Contener/restaurar foco y fondo no interactivo |
| A33 | Contraste insuficiente y Mostrar contraseña de 16px de alto | Media | 24 análisis axe; A11Y-01/02 | Colores y áreas táctiles accesibles |
| A34 | Gastos, caja, recetas, fiscal y tickets no operativos completos | Alta | C/E1–E3/E8 | Implementar por módulos con aceptación |
| A35 | Sync descarta movimientos de usuario sin remote_id | Alta | C; `sync.js:144-150` | No perder trazabilidad; resolver identidad pendiente |
| A36 | Método Mixto cae íntegro en efectivo en analytics | Alta | L; `analytics.js:100-106` | Distribuir desde pagos reales |

A09/A10/A11/A12/A17/A21 se comprobaron en el DDL embebido, no como ataque al
despliegue remoto. Las FKs existentes sí rechazaron referencias inexistentes y
el CHECK de existencia rechazó stock negativo en los casos ejecutados.

## 5. Brechas de estándares POS

Todos tienen el mismo peso únicamente para el índice de la sección 1.

| Estándar | Estado | Prioridad |
|---|---|---|
| Offline/PWA/cola confiable | ⚠️ | Crítica |
| Impresión y reimpresión térmica/web | ➖ | Alta |
| NCF/e-CF e identificación fiscal de cliente | ➖ | Alta; alcance fiscal a confirmar |
| Propina/servicio cuando aplique | ⚠️ solo estructura SQL | Alta según negocio |
| Gestión de clientes/facturas nominativas | ⚠️ texto de cliente | Media/alta |
| Agotado rápido desde POS | ⚠️ disponibilidad desde administración | Alta |
| Cierre Z imprimible | ➖ | Alta |
| Velocidad humana <15s | ⚠️ automatización rápida; humano pendiente | Alta |
| Claro/oscuro, fuente y exterior | ⚠️ | Alta |
| Backup y recuperación comprobada | ⚠️ | Crítica |
| Multi-terminal/multiubicación | ⚠️ | Alta/media |
| Recibo por WhatsApp/correo | ➖ | Media |
| Avisos de stock bajo | ⚠️ dentro de app | Alta |
| Privacidad y custodia | ⚠️ no demostrada integralmente | Alta |

Se consultaron las páginas oficiales de [comprobantes DGII](https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscales/Paginas/default.aspx)
y [facturación electrónica DGII](https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Paginas/default.aspx).
El régimen, plazos, contingencia y propina aplicables al food truck requieren
confirmación con DGII/contador; no se adopta una fecha genérica como dictamen.

XLSX vendorizado 0.18.5 aparece en [CVE-2023-30533](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6).
El aviso excluye el flujo de solo exportación sin lectura de archivos arbitrarios;
no se demostró explotación de esa CVE en esta app. La dependencia debe gestionarse.

## 6. Top 10 antes de producción

1. Eliminar XSS y comprobar salidas de todos los datos no confiables.
2. Corregir contrato de sync: detalles, pagado, método y preservación al pull.
3. Establecer autoridad de roles/usuarios activos y política offline de producción.
4. Endurecer RLS y RPC, incluyendo lectura financiera y cajas ajenas.
5. Transacciones, outbox durable, idempotencia y numeración bajo concurrencia.
6. Integrar receta/consumo/anulación y proteger unidades/ledger.
7. Caja real y conciliación sin doble conteo.
8. Cálculos monetarios, fechas RD y exclusión de anulaciones coherentes.
9. PWA con arranque offline limpio y recuperación de respaldos probada.
10. Cerrar aceptación E1–E8, accesibilidad y alcance fiscal/hardware aplicable.

Esto es un orden de riesgo, no una promesa de completar diez áreas en cuatro horas.
El [plan de presentación](PLAN_INTEGRACION_4_HORAS.md) limita el alcance y define salidas verificables.

## 7. Go / No-Go

- [ ] Sin XSS reproducible en campos mostrados.
- [ ] Cajero/cocinero no acceden a costos, caja ajena o funciones admin por UI/API/RPC.
- [ ] Roles y desactivación se validan en servidor y en política offline.
- [ ] Venta completa conserva cabecera, detalles, vendedor, método y pagos.
- [ ] Reintentos/doble clic/concurrencia no duplican ni pierden operaciones.
- [ ] Caja, stock y ledger concilian; unidades compatibles y saldos válidos.
- [ ] Anulación deja motivo, reversión y auditoría anterior/nueva.
- [ ] Los reportes excluyen anuladas y usan zona RD.
- [ ] Primera reapertura offline funciona; reconexión real conserva la venta.
- [ ] Restauración de respaldo probada y responsabilidades acordadas.
- [ ] Flujos E1–E8 aplicables pasan en base aislada y luego entorno remoto de pruebas.
- [ ] Contraste/foco, dispositivos físicos e impresión aplicable verificados.
- [ ] Requisitos fiscales y privacidad acordados con responsables competentes.

**Estado actual: NO-GO.** Un demo controlado y explícitamente limitado puede ser
objetivo de cuatro horas; no debe presentarse como operación financiera certificada.

## 8. Aclaraciones que sustituyen conclusiones anteriores

- Los triggers dinámicos sí existen en el DDL: véase inventario completo.
- La violación de `uq_ordenes_numero` era un riesgo plausible, no la causa exacta
  certificada de un error remoto: el POST anónimo anterior solo demostró bloqueo RLS.
- La elevación local no equivale a conseguir un JWT admin o vencer RLS remoto.
- E1/E2/E3/E8 no se completaron sustituyendo funciones ausentes por cambios manuales.
- La prueba de margen de ingrediente sin receta vinculada no prueba un algoritmo de recetas.
- HTTP 200 con cero filas y el smoke histórico no certifican seguridad.
