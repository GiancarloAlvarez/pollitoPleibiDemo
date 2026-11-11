import { escapeHtml } from '../core/utils.js';
import { localEnabled, localStatus } from '../core/local-client.js';

export function renderLocalStatus() {
  if (!localEnabled()) return '';
  const status = localStatus();
  return `<section class="local-service-note" aria-label="Estado de red local">
    <b>${status.demo ? 'Demostración · ' : ''}Caja y cocina por red local</b>
    <p id="lan-status-message" role="status">${escapeHtml(status.message)}</p>
    <small>Confirmado en LAN no significa sincronizado con Supabase.</small>
  </section>`;
}
