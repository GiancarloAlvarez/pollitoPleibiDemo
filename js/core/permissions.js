import { state } from './state.js';

// Defensa de interfaz/repositorio. La autoridad de LAN se valida además en el servidor.
export function requireRole(roles = ['admin']) {
  if (!state.isLogged || !state.user || state.user.active === false || state.user.deleted_at
      || !roles.includes(state.role) || state.role !== state.user.role) {
    throw new Error('Acceso no permitido para tu rol.');
  }
}
