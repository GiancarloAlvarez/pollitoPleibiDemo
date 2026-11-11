# Reglas de trabajo — Pollito Pleibi vanilla

## Alcance y prioridades
- Esta carpeta contiene la app HTML/CSS/JS. No migrar framework ni tocar el proyecto Next vecino sin solicitud expresa.
- Antes de implementar, leer `docs/auditoria/README.md`, `INFORME_FINAL.md` y el módulo correspondiente de `PLAN_INTEGRACION_4_HORAS.md`.
- La auditoría encontró bloqueos de producción. El plan de cuatro horas es una demo acotada, no certificación integral.
- Preservar archivos/datos del usuario. Registrar baseline recuperable antes de modificar lógica; no asumir que existe Git en esta copia.
- No hacer commit, push, cambios de credenciales o despliegue por iniciativa propia.

## No romper la aplicación
- Mantener estructura, hash routing, contratos de vistas, identidad visual y estilos existentes.
- Cambios pequeños por módulo; no reescribir componentes o acumular CSS global sin justificar la causa.
- Conservar precios/costos históricos, IDs, referencias y pendientes de sincronización.
- Probar el fallo original y el flujo afectado después de cada cambio; no repetir suites innecesariamente si no hubo cambios relevantes.
- Un escenario que se detiene por función ausente no está aprobado.

## Datos y seguridad
- Trabajar con fixtures y proyectos de pruebas. No ejecutar semillas, resets, DROP/TRUNCATE ni escrituras de prueba en producción.
- No habilitar políticas anónimas generales, desactivar RLS o usar service_role en frontend para arreglar un error.
- No imprimir tokens, contraseñas o contenido sensible en reportes/logs.
- Roles y recursos se validan en servidor; guards de UI/repositorio son complemento, no autoridad remota.
- Tratar nombres, notas, clientes e insumos como texto no confiable; evitar innerHTML con valores sin escape.
- Escribir operación y outbox conjuntamente; no descartar pendientes para aparentar sincronización.
- Mantener UUID/idempotencia en reintentos y no duplicar pagos/consumos.
- Separar estado de pago del estado de cocina. No cambiar a Entregada por cobrar sin una regla acordada.
- Inventario debe conservar unidades compatibles, saldo anterior/resultante y movimientos inmutables.

## SQL y Supabase
- Cambios productivos mediante migraciones revisadas, precondiciones y plan de recuperación.
- `CREATE TABLE IF NOT EXISTS` no sustituye migraciones de constraints existentes.
- Las policies permisivas se combinan por OR. Revisar columnas financieras y recursos ajenos.
- Toda SECURITY DEFINER requiere privilegios EXECUTE y autorización interna acordes al caller/recurso.
- Los resultados PGlite prueban DDL/roles SQL, no JWT, PostgREST, despliegue ni concurrencia multiconexión.
- No ejecutar `tests/supabase-integration.js` contra un proyecto real sin revisar su contrato y escrituras.

## Verificación
Desde `tests/`: `npm run audit:unit`, `npm run audit:db`, `npm run audit:e2e`, `npm run audit:sync`.
Línea base de auditoría: 19 pasan, 21 fallan, 1 skip, 3 TODO. Los comandos fallan
por defectos observados. Corregir causas; no ocultar fallos cambiando aserciones,
saltando casos o ampliando tolerancias sin justificación de negocio documentada.

- Verificar 360x800, 768x1024 y 1366x768; teclado/foco y contraste en los componentes tocados.
- El servidor E2E antiguo deshabilita SW: para PWA probar el SW real y la primera recarga offline.
- Registrar qué pasó, falló o quedó bloqueado y si fue local, simulado, SQL embebido o remoto.
- Al cambiar comportamiento, actualizar workflow, pruebas y documentación correspondiente.

## Cierre
- Entregar archivos cambiados, pruebas ejecutadas y riesgos pendientes.
- No afirmar que una venta llegó completa a Supabase por ver un badge verde o HTTP 200 vacío.
- No afirmar Go de producción sin cumplir la lista de aceptación y cerrar bloqueos aplicables.
