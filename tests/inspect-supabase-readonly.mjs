// Consulta solamente metadatos y cero filas; nunca usa sesiones/credenciales privadas.
// Usa la configuración DEFAULT del código, no el localStorage del navegador del usuario.
import { getSupabaseConfig } from '../js/config.js';
const config = getSupabaseConfig();
const headers = { apikey: config.anonKey, Authorization: `Bearer ${config.anonKey}` };
const paths = [
  ['Auth accesible (no acredita sesión)', '/auth/v1/settings'],
  ['Columnas de orden y comprobante', '/rest/v1/ordenes?select=id,usuario_id,caja_sesion_id,comprobante_negocio,efectivo_recibido,cambio,vendedor_nombre&limit=0'],
  ['Relaciones detalle/pago', '/rest/v1/ordenes?select=id,orden_detalles(id),pagos(id)&limit=0'],
  ['Columnas caja', '/rest/v1/caja_sesiones?select=id,usuario_id,monto_inicial,estado&limit=0'],
];
console.log('Solo lectura; configuración por defecto; sin sesión de usuario.');
for (const [label, path] of paths) {
  try {
    const response = await fetch(`${config.url}${path}`, { headers, signal: AbortSignal.timeout(15000) });
    const body = await response.json();
    // Nunca imprimir filas, claves, configuración Auth ni cabeceras.
    console.log(JSON.stringify({ check: label, status: response.status,
      code: response.ok ? null : body.code || null,
      message: response.ok ? 'Endpoint respondió; no prueba permisos de escritura.' : body.message || 'Solicitud rechazada' }));
  } catch (error) { console.log(JSON.stringify({ check: label, error: error.name, message: 'Consulta no completada.' })); }
}
