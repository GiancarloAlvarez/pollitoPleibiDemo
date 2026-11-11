# Plan de integración por módulos y presentación en 4 horas

## 1. Alcance real de la propuesta

Este es el plan solicitado al terminar la auditoría. **Las tareas siguientes no
se han implementado.** Se preservó la app y se añadieron pruebas/documentos.

En cuatro horas se puede **intentar preparar una demo acotada y verificable**:
catálogo existente, una venta coherente, cocina, precio histórico, reportes básicos
y continuidad local. El tiempo es una estimación de trabajo técnico, no garantía
de completar todos los módulos ni de cumplir estándares integrales de producción.

Puedo trabajar sobre HTML/CSS/JS existentes, corregir funciones, proponer y probar
migraciones SQL, escribir tests y documentación y generar diagramas Mermaid.
No puedo acreditar sin medios/evidencia: JWT reales no disponibles, concurrencia
remota, backup cloud restaurado, impresoras, prueba humana, autorización DGII o
decisiones de régimen/propina del negocio.

**Objetivo de la presentación:** demostrar solo lo que haya pasado sus pruebas,
con el modo demo visible y una lista honesta de pendientes. No presentar una
venta local como conciliación remota ni llamar al sistema listo para producción.

## 2. Condiciones iniciales y protección

- Registrar copia/versionado de los archivos y datos antes de cambiar lógica.
  Actualmente esta copia no tiene repositorio Git accesible; no hay commit de respaldo.
- Mantener `vanilla/` como aplicación objetivo; no migrar a React ni modificar el
  proyecto Next vecino para preparar la presentación.
- Datos de pruebas separados de los del negocio. Fixtures reproducibles y rutas temporales.
- Confirmar si hay proyecto Supabase de pruebas y usuarios reales de los tres roles.
  Si faltan, el bloque online se limita a pruebas embebidas/simuladas y documentación.
- Fijar línea base de `tests/audit`: 19 pasan / 21 fallan / 1 skip / 3 TODO.
- Mantener los fallos ajenos al alcance visibles; no borrarlos ni convertirlos en éxitos.
- Cambios pequeños por módulo, con prueba de la causa y regresión dirigida.

## 3. Agenda de 240 minutos (propuesta, no ejecutada)

| Minutos | Bloque | Entrega que se intentará | Verificación mínima |
|---|---|---|---|
| 0–20 | Baseline/aislamiento | Copia, entorno demo, selección de recorrido y datos | App arranca; datos reales intactos |
| 20–65 | Seguridad visible | Escape de salidas del dashboard; guards de comandos y rol; separar demo de producción | Reproducir y bloquear XSS y llamada local no autorizada |
| 65–125 | Venta/sync | Corregir contrato local/remoto para detalles, pagado y método; no sobrescribir venta válida con detalle ausente | SYNC-01/02/03/04 y preservación de historial |
| 125–160 | SQL de pruebas | Preparar migración mínima de permisos/RPC y corrección de doble conteo; verificar en base aislada | Casos SQL afectados y rollback; no aplicar a producción |
| 160–185 | Continuidad/cálculos | Precaché completo; mínimo <=; corregir frontera decimal con política explícita | Primer reload offline, E4 y CAL-04 |
| 185–210 | Componentes UX | Foco del modal, retorno al activador, contraste/tamaño de controles prioritarios | Teclado en tres tamaños y axe dirigido |
| 210–240 | Ensayo/evidencia | Ejecutar recorrido de demo, conciliar y preparar capturas/guion | Venta, cocina y reportes coherentes; lista de limitaciones |

El bloque de 60 minutos de sync tiene prioridad sobre cambios cosméticos. Si la
corrección de contrato revela un problema mayor de transacciones o datos históricos,
se consume el bloque siguiente y se reduce el alcance de presentación. No se
comprime la validación final para simular que todo quedó terminado.

### Alcance de demo alternativo si online sigue bloqueado

Una sesión local con catálogo controlado, venta, cocina y reporte, identificada
como demo. La cola debe conservar los pendientes, pero no se afirmará que esos
datos llegaron a Supabase. Los cobros reales deben seguir el procedimiento del
negocio hasta que pase la aceptación integral.

## 4. Backlog completo por módulos y tareas

Prioridades: P0=integridad/seguridad bloqueante; P1=operación exigida; P2=mejora o crecimiento.
La columna "4h" significa candidato del alcance limitado, **no todas las tareas del módulo**.

### M00 — Protección del proyecto y modo demo
- [ ] P0 Crear baseline recuperable y registrar archivos/cambios/datos.
- [ ] P0 Separar configuración demo, pruebas y producción; no sembrar admin demo en producción.
- [ ] P0 Estado de conexión que distinga Auth accesible, BD autorizada, cola y sync confirmado.
- [ ] P0 No borrar pendientes ni datos incompatibles para limpiar visualmente el badge.
- [ ] P1 Centralizar errores en español y diagnóstico técnico sin secretos.
- 4h: aislamiento, baseline y señalización de modo. Aceptación: entorno identificable y reversible.

### M01 — Autenticación, roles y usuarios
- [ ] P0 Usar perfil/autoridad de servidor para roles, sin confiar en user_metadata editable.
- [ ] P0 Guards en saveUser/saveProduct/saveInventory y demás comandos, además del router.
- [ ] P0 Validar activo/deleted_at y resolver desactivación de sesiones abiertas/offline.
- [ ] P0 Crear/editar/bajar usuarios mediante un flujo Auth+perfil controlado de servidor.
- [ ] P0 Resolver remote_id de usuarios ya presentes y preservarlo al editar.
- [ ] P0 Evitar fallback local administrativo tras rechazo remoto indiscriminado.
- [ ] P1 Política de expiración, refresh, logout/revocación y recuperación de contraseña real.
- [ ] P1 Política de contraseña uniforme al crear/editar; quitar hash no criptográfico.
- [ ] P1 Definir protección local contra intentos y comprobar rate limits de Auth.
- 4h: guards y separación demo, con alcance explícito. No equivale a identidad offline inviolable.

### M02 — Persistencia, sincronización y concurrencia
- [ ] P0 Definir contratos tipados/documentados de OrderLocal y OrdenRemote.
- [ ] P0 Construir detalles y pagos desde el objeto correcto; pago solo cuando corresponda.
- [ ] P0 Mantener precio/costo snapshot, notas, vendedor y canal sin pérdidas en pull.
- [ ] P0 Guardar operación local y outbox en una sola transacción multistore.
- [ ] P0 Venta online atómica con ID de operación estable e idempotencia en servidor.
- [ ] P0 ACK completo antes de quitar pendientes; recuperación si timeout ocurre después del commit.
- [ ] P0 Resolver conflictos de stock y edición; no basarse solo en relojes de terminal.
- [ ] P0 Numeración coordinada y estrategia de folio temporal offline; separar NCF.
- [ ] P1 Paginar pulls de más de 1000 filas sin adelantar cursor perdiendo datos.
- [ ] P1 Reintentos observables, diagnóstico y conciliación de registros ya afectados.
- 4h: contrato de detalles/pagos/pull y pruebas dirigidas. Atomicidad completa y multiconexión requieren más trabajo.

### M03 — POS y pagos
- [ ] P0 Guardar vendedor, terminal cuando exista, fecha de negocio y canal separado del cliente.
- [ ] P0 Impedir doble enviar/cobrar y reintento duplicado tras fallo local.
- [ ] P0 Efectivo recibido, insuficiente/exacto/vuelto; pagos desglosados y conciliación.
- [ ] P1 Pago mixto real, autorizaciones de descuento con usuario/motivo y límites.
- [ ] P1 Notas por ítem, variantes/modificadores, precio snapshot y validación de cantidades.
- [ ] P1 Órdenes en espera, retomar/cobrar pendiente y división de cuenta.
- [ ] P1 Anulación autorizada con motivo, contramovimientos, devolución y auditoría.
- [ ] P1 Recibo/reimpresión sin crear venta; conservar datos del negocio al emitir.
- [ ] P1 Acceso rápido al carrito en móvil y agotado desde POS según permiso.
- 4h: recorrido de venta existente consistente; no prometer split, mixto, espera o anulación nuevos.

### M04 — Cocina (KDS)
- [ ] P0 No exponer precios/costos/totales al cocinero por UI ni API.
- [ ] P1 Transiciones autorizadas y concurrentes; separar estado operativo del de pago.
- [ ] P1 Realtime/polling verificado entre terminales y notificación de orden lista.
- [ ] P1 Hora, notas por ítem, temporizador actualizado e indicador de retraso.
- [ ] P1 Conservar órdenes activas al cruzar medianoche; anulación visible/retirada coherente.
- 4h: conservar flujo actual y corregir su exposición básica. Aceptación remota posterior.

### M05 — Productos, categorías, combos y variantes
- [ ] P1 CRUD completo: SKU único, descripción, imagen, costo, impuestos, estado/disponibilidad.
- [ ] P1 CRUD de categorías y relación categoria_id real, sin usar descripción como categoría.
- [ ] P1 Desactivar productos relacionados en lugar de permitir eliminación de catálogo.
- [ ] P1 Variantes, modificadores y composición de combos con reglas de precio/receta.
- [ ] P1 Historial de precios con autor/motivo y ventas históricas conservadas.
- 4h: conservar CRUD actual y precio histórico; campos/catálogos completos quedan fuera.

### M06 — Inventario y movimientos
- [ ] P0 Unidad base, conversiones y rechazo de unidades incompatibles.
- [ ] P0 Existencia/movimiento anterior/resultante/autor guardados conjuntamente.
- [ ] P0 Saldo inicial trazable, sin cambios directos de stock fuera del servicio autorizado.
- [ ] P0 Ledger inmutable y corrección por contramovimiento; no quitar de cola por falta de remote_id.
- [ ] P1 CRUD de artículo: proveedor, ITBIS, estado, observaciones y fecha de entrada.
- [ ] P1 Salida, consumo, merma, desperdicio, devolución, ajuste e interno con motivo exigible.
- [ ] P1 Alerta <= mínimo coherente en dashboard, inventario, exportación y notificaciones.
- [ ] P1 No eliminar insumos con movimientos; evitar stock negativo y documentar excepciones.
- 4h: mínimo <=; correcciones de unidades/ledger no deben fingirse con un cambio visual.

### M07 — Entradas y compras
- [ ] P1 Documento proveedor/fecha/ítems/unidades/costos/ITBIS/subtotal/total/usuario.
- [ ] P0 Borrador no afecta stock; confirmar una vez y de forma atómica.
- [ ] P1 Elegir y documentar último costo o promedio ponderado.
- [ ] P1 Anulación con reversión vinculada, motivo y auditoría.
- [ ] P1 Comprobantes adjuntos y consulta de historial de compras.
- 4h: solo demostrar entrada simple existente con conciliación; no compra multiítem completa.

### M08 — Recetas y costo real
- [ ] P0 Editor de receta por producto/combo con cantidades/unidades compatibles.
- [ ] P0 RPC transaccional de venta/consumo con bloqueo o actualización condicional.
- [ ] P0 Idempotencia por operación y validación de propiedad/rol.
- [ ] P1 Política de ingrediente faltante y productos sin receta.
- [ ] P1 Reversión al anular; costo calculado y margen separado del estimado.
- 4h: documentación y tests; integración completa queda fuera del compromiso.

### M09 — Dinero, ITBIS y cargos
- [ ] P0 Política decimal: cantidades, centavos, redondeo por línea/orden y límites.
- [ ] P1 Tasas por producto, exentos y precios incluidos/excluidos.
- [ ] P1 Orden de descuento/ITBIS/servicio definido y consistente.
- [ ] P1 Servicio/propina legal y voluntaria si aplican, visibles y conciliadas.
- [ ] P1 Mismos importes en venta, recibo, dashboard, reportes y Excel.
- 4h: frontera de redondeo central y casos existentes; no certificación tributaria.

### M10 — Caja y cierre diario
- [ ] P0 Sesión propia abierta, monto inicial y unicidad acordada por usuario/terminal.
- [ ] P0 Asociar órdenes y pagos; calcular esperado desde fuente única sin doble conteo.
- [ ] P1 Entradas/retiros/gastos, efectivo declarado, diferencia y cierre inmutable.
- [ ] P1 Cierre Z consultable/imprimible y anulación/devolución conciliada.
- [ ] P0 No cerrar caja ajena por RPC; impedir carreras al cerrar.
- 4h: probar/corregir cálculo SQL aislado si entra en tiempo; UI completa fuera.

### M11 — Gastos y proveedores
- [ ] P1 Gastos con categoría, monto, fecha, responsable, comprobante y método.
- [ ] P0 Impacto único en caja y utilidad, sin duplicar el mismo gasto.
- [ ] P1 Proveedor: empresa, contacto, teléfono, email, dirección, productos, notas, estado.
- [ ] P1 Restricción de eliminación con compras/entradas; usar desactivación.
- 4h: conservar directorio y mostrar pendientes; no añadir contabilidad incompleta.

### M12 — Dashboard y reportes
- [ ] P0 Filtro común de ventas válidas y anuladas separadas.
- [ ] P0 Fechas/límites America/Santo_Domingo independientemente del dispositivo.
- [ ] P1 Definir ventas netas, cobrado, impuestos, costos y utilidad sin etiquetas ambiguas.
- [ ] P1 Ventas por vendedor, productos, pagos desglosados, gastos, mermas y caja.
- [ ] P1 Rangos correctos, carga de 10000+ ventas y paginación de datos.
- 4h: cifras del recorrido controlado y correcciones críticas si el bloque de sync no se extiende.

### M13 — Excel y recibos digitales
- [ ] P1 Hojas Resumen/Ventas/Productos/Vendedores/Pagos/Inventario/Movimientos/Compras/Gastos/Mermas.
- [ ] P1 Fechas y moneda con tipos/formatos correctos, rango y generación identificados.
- [ ] P0 CSV según tipo, permisos y manejo de datos vacíos coherente.
- [ ] P1 Probar fórmulas maliciosas como datos exportados y preservar acentos/ñ.
- [ ] P2 Recibo por correo/WhatsApp con datos correctos y tratamiento de destinatarios.
- 4h: comparar importes del XLSX actual; no prometer todas las hojas ni canales de envío.

### M14 — Auditoría, seguridad y privacidad
- [ ] P0 Escapar datos en todas las salidas; regresión de los tres XSS confirmados.
- [ ] P0 Revisar RLS por rol/propiedad/columna; no usar políticas generales como control financiero.
- [ ] P0 Guardar anterior/nuevo, usuario y acción significativa sin secretos innecesarios.
- [ ] P1 Login/acceso denegado/administración/anulación/apertura/cierre/offline trazables.
- [ ] P1 Vista admin de solo lectura con filtros y referencias a la operación.
- [ ] P1 Custodia de tokens, datos locales y backups; retención y baja de empleados.
- [ ] P1 Dependencias identificadas, versiones y procedencia; revisar avisos aplicables.
- 4h: XSS y endurecimiento mínimo probado; no auditoría de seguridad integral cerrada.

### M15 — PWA, backups, componentes y accesibilidad
- [ ] P0 Precaché completo, actualización versionada y primera reapertura offline.
- [ ] P0 Respaldo/restore local con validación de versión y protección de datos sensibles.
- [ ] P1 Confirmar backups cloud/retención y ensayar recuperación con RPO/RTO acordados.
- [ ] P1 Foco atrapado en modal, retorno al activador y drawer accesible.
- [ ] P1 Contraste claro/oscuro, objetivos táctiles y fuentes en móvil/tableta.
- [ ] P1 Errores españoles, estados de carga y confirmaciones sin ocultar causa del fallo.
- [ ] P1 Reutilizar componentes existentes; evitar rediseño completo o CSS global improvisado.
- 4h: precaché y componentes prioritarios; restore completo y pruebas físicas fuera.

### M16 — Fiscal, impresión y crecimiento
- [ ] P1 Confirmar con DGII/contador comprobantes, régimen, plazos y contingencia.
- [ ] P1 Modelo de cliente fiscal, secuencias autorizadas y flujo e-CF válido si corresponde.
- [ ] P1 Ticket/comanda 58/80 mm, reimpresión y tratamiento de impresora desconectada.
- [ ] P2 Ubicaciones/terminales con aislamiento y permisos; evaluar multi-tenant solo si se necesita.
- [ ] P1 Requisitos de privacidad aplicables y procedimiento de atención al titular.
- 4h: definir alcance/preguntas; no emisión fiscal autorizada ni certificación de hardware.

### M17 — QA y documentación
- [ ] P0 Mantener pruebas de cada defecto y comparar resultados tras cada cambio.
- [ ] P0 Completar JWT/REST remoto y concurrencia multiconexión antes de producción.
- [ ] P1 Cerrar E1–E8 completos; no dar por pasado un escenario detenido en el primer bloqueo.
- [ ] P1 Usuarios sin ayuda, lector de pantalla, Android/iOS, luz exterior y Excel/Sheets.
- [ ] P1 Mantener workflow actual/objetivo, instrucciones de operación y recuperación.
- 4h: ejecutar verificaciones del alcance y entregar evidencia de lo que siga fallando.

## 5. Criterio de aceptación de la presentación

- [ ] Se identifica explícitamente el entorno demo y su alcance.
- [ ] La venta mostrada conserva productos, cantidades, precio y total.
- [ ] Si se muestra online, están comprobados detalles/pagos y no se confunde con simulación.
- [ ] Órdenes pendientes no aparecen cobradas ni tarjeta como efectivo.
- [ ] No se reproduce XSS en los puntos de la demo ni operación admin del cajero.
- [ ] Cocina conserva el flujo y el historial de precio no cambia.
- [ ] Reporte/Excel coinciden para los IDs de venta presentados.
- [ ] Se prueba offline según el alcance declarado y se conservan pendientes.
- [ ] Se entrega lista de fallos restantes y no se presenta como Go de producción.

## 6. Estimación posterior (orientativa y dependiente de diseño/credenciales)

- Núcleo transaccional, idempotencia, permisos y reparación de datos: varios días de trabajo y validación.
- Caja/recetas/compras/anulación integradas: varias jornadas, no bloques cosméticos.
- Fiscal, hardware, privacidad y aceptación remota/humana: calendario propio con terceros.

Se debe reestimar tras el primer bloque de correcciones; no convertir estas áreas
en una promesa cerrada de horas sin definir modelo de negocio y criterios de aceptación.
