# Cambios funcionales restantes — Pollito Pleibi

> Con el esquema Supabase v2 (`vanilla/docs/supabase/schema_completo.sql`) ya implementado,
> este documento lista **lo que falta en la APP** (`vanilla/js/**`) para aprovecharlo por completo.
> Referencia: `ANALISIS_FUNCIONAL_Y_COMERCIAL.md` §14.

Estado: `[ ]` pendiente, `~` en diseño, `x` implícito por esquema ya cargado en Supabase.

## Leyenda de módulos a crear/modificar en `vanilla/js`
- `core/pricing.js` — talonario y listas de precios
- `core/cash.js` — caja (sesiones, movimientos, arqueo)
- `core/recipes.js` — recetas y consumo automático
- `core/audit.js` — hooks de auditoría (se apoyan en trigger REMOTO)
- `views/precios.view.js`, `views/caja.view.js`, `views/gastos.view.js`,
  `views/auditoria.view.js`, `views/categorias.view.js`, `views/recetas.view.js`

## Bloque F0 — Compatibilidad de datos (prerequisito para el resto)

- [ ] **Mapeo de tablas nuevas** en `config.js` (`DEFAULT_SUPABASE.tables`) añadir:
       `categorias`, `orden_detalles`, `pagos`, `recetas`, `caja_sesiones`, `movimientos_caja`,
       `gastos`, `inventario_movimientos`, `registro_auditoria`, `price_lists`,
       `price_list_items`, `price_history`, `compras`, `configuracion`.
- [ ] **Adaptador español↔inglés** en `sync.js` (`mapTable` y `PULL_TABLES`).
- [ ] **Migración IndexedDB v2** en `db.js`: añadir los mismos stores.
- [ ] **$SCHEMA_VERSION = 2** en `config.js`. Actualizado en `seed.js`.
- [ ] **`caja_sesion_id` nullable** ya resuelto en Supabase. Confirmar al primer push de orden.
- [ ] **Numero de orden (`#1049-style`)** → read remote `numero_orden` (Supabase ya lo asigna via SERIAL); cambiar `utils.nextOrderCode` a derivar del max remoto o usar el `id`.

## Bloque F1 — Núcleo de negocio

```
1. Recetas + consumo automático
   [ ] CRUD de recetas por producto (views/recetas.view.js, core/recipes.js)
   [ ] Llamada al consumo en advanceOrder() / cobrar_orden() usando RPC remota
   [ ] Fallback local: consumir receta por trigger local en repo.js (offline funciona)
   Aceptación: vender "6 Alitas Clásicas" descuenta 1 lb alitas + 1 caja; con stock insuficiente se
               aborta la operación y se muestra el error sin tocar stock.

2. Caja
   [ ] abrirSesion(), addMovimiento(tipo, monto), retiroGasto(), cerrarCaja(declarado)
   [ ] views/caja.view.js (sesión actual + historial)
   [ ] bloquea POS si caja cerrada (flag en configuracion, opcional)
   Aceptación: apertura con monto inicial; ventas afectan `monto_esperado`
               (suma ventas efectivo + mixto/propinas - retiros - gastos de caja);
               `diferencia` calculada al cierre; historial filtrable por usuario.

3. Gastos operativos
   [ ] CRUD con categorías (`combustible, gas, transporte, reparaciones, limpieza, servicios, compras menores`)
   [ ] vincular a caja opcional (checkbox `salio_de_caja`, respetar la regla "solo una vez")
   Aceptación: gastos aparecen en panel de gastos y en el arqueo del día.

4. Vendedor, descuentos, anulación, propina
   [ ] `createOrder` guarda `usuario_id` = session user (vendedor)
   [ ] modal de checkout con descuento (valida `pin_autorizacion` si > X %)
   [ ] botón "anular" (estado `'anulada'`, guarda `notas_anulacion`), disponible solo para admin
   [ ] propina legal 10 % opcional (checkbox en checkout si activado)
   Aceptación: orden lleva vendedor; descuento con PIN se audita; anulada no influye en reportes.

5. Pagos mixtos
   [ ] checkout permite hasta 3 métodos con montos (RPC remota `cobrar_orden` con p_metodo='mixto'
       + inserta en `pagos` las partes)
   Aceptación: suma de pagos igual al total; efecto-al-call aplica propina.

6. Categorías CRUD
   [ ] views/categorias.view.js + CRUD + reordenamiento por `orden`
   Aceptación: POS ordena por `orden` (no por nombre); productos cambian de categoría.

7. SKU, descripción, imagen, ITBIS por producto, disponibilidad
   [ ] product-form: campos `codigo` (autogenerada si vacía), `descripcion`, `imagen_url`,
       `tasa_itbis` (18/0/exento), `itbis_incluido`, `disponible`
   [ ] orderTotals respeta tasa por producto
   Aceptación: producto exento (tasa 0) no suma ITBIS; `itbis_incluido` separa el impuesto en el ticket.

8. Talonario de precios
   [ ] listas por canal + vigencia + activar/desactivar
   [ ] redondo RD$ (céntimos 5/10/25) en `configuracion`
   [ ] actualización masiva por categoría con preview + reversión
   [ ] historial automático (price_history) con PIN para cambios > X %
   [ ] export Excel/PDF tipo "talonario" (usa excel.js)
   Aceptación: ver §8.5 de ANALISIS_FUNCIONAL_Y_COMERCIAL.md (5 checks).

9. Movimientos completos
   [ ] tipos: salida, merma, desperdicio, ajuste, devolución, consumo_interno
   [ ] cada movimiento guarda `existencia_anterior`/`existencia_resultante` + motivo obligatorio
   Aceptación: Kardex por insumo con las 7 columnas correctas y trazabilidad de usuario.

10. Compras multi-línea con ITBIS
   [ ] views/compras.view.js (encabezado + N líneas)
   [ ] al confirmar: actualiza stock de cada ítem + registra `inventario_movimientos` tipo `entrada`
   Aceptación: subtotal + ITBIS + total cuadran contra detalle; historial por proveedor.
```

## Bloque F2 — Control y visibilidad

- [ ] **Auditoría**: `core/audit.js` para login/creación/precio/anulación de venta/aperturas-cierres
      (el Trigger de Supabase registra UPDATE/DELETE de tablas sensibles; el cliente necesita solo leer).
      Vista `views/auditoria.view.js` con filtros por usuario/acción/tabla/periodo.
- [ ] **Reportes ampliados** (gastos, mermas, vendedores, caja, compras, costos/utilidad).
- [ ] **Excel 10 hojas** (según ficha §16) reutilizando `excel.js`.
- [ ] **Dashboard KPIs**: semana/mes, ventas por vendedor, utilidad real (recetas), mermas, gastos.
- [ ] **Cocina**: ver `orden_detalles.notas` (indicaciones) y métricas tiempo promedio por status.

## Bloque F3 — Seguridad, Auth y sync endurecimiento

- [ ] **Supabase Auth híbrido**: migrar usuarios locales → `auth.users` + `perfiles`;
      `session offline` con credenciales cifradas en IndexedDB.
- [ ] **Numeración de órdenes** remota cuando esté disponible (dejar de usar `utils.nextOrderCode`).
- [ ] **`device_id`** en outbox y payload para trazabilidad.
- [ ] **RLS refinado** (acción por acción, separar "cocina actualiza estado" de "cocina edita orden").
- [ ] **Hash de `pin_autorizacion`** (texto plano no aceptable en producción).

## Bloque F4 — Cumplimiento RD (opcional pero comercialmente clave)
- [ ] NCF consecutivos por tipo (B01/B02/B14/B15) en ticket
- [ ] e-CF vía pasarela DGII autorizada
- [ ] impresión térmica: orden de cocina y comprobante
- [ ] reportes 606/607 para contador

## Bloque F5 — Endurecimiento y lanzamiento
- [ ] E2E completo con datos reales (suite Playwright en `vanilla/tests/`)
- [ ] UAT con 2 negocios reales
- [ ] manuales y capacitación (admin/caja/cocina)
- [ ] migración de datos del primer negocio (hasta 500 registros)

## Caducidad/dependencias (orden de ejecución)
```
F0 ──→ F1 (recetas, caja, gastos, vendedor, pagos, talonario, compras, SKU/ITBIS)
   └─→ F2 (auditoría, reportes, dashboard, cocina detalles)
         └─→ F3 (Auth, RLS fino, número remoto)
              └─→ F4 (cumplimiento estatal: NCF/e-CF/impresión) ⚠️ período crítico comercial (≥15 d)
                   └─→ F5 (endurecimiento, primera venta)
```

## SQL vs app — prever dónde puede fallar (riesgos detectados en F0)
| Riesgo | Causa | Mitigación |
|---|---|---|
| push falla por `updated_at` | tabla sin trigger `trg_touch_*` | Verificar con la consulta 5.2 del README de Supabase |
| push falla por RLS | anon key sin JWT | Hacer login Supabase o activar el bloque “MODO PRUEBAS anon” |
| Items JSON vs orden_detalles | sync no maneja hijos | F0: adaptador que, si `items` presente, intercalos los detalles como `orden_detalles` |
| Serial remoto vs `#1049` local | doble numeración | Preferir el `numero_orden` remoto; local ignora su contador |
