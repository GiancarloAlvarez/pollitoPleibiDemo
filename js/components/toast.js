import { escapeHtml } from '../core/utils.js';
import { icon, renderIcons } from './icons.js';

let timer = null;

export function showToast(message, type = 'info', duration = 2400) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const iconName = type === 'error' ? 'circle-alert' : type === 'warning' ? 'alert-triangle' : 'circle-check';
  container.innerHTML = `<div class="toast toast-${type}" role="status">${icon(iconName, 16)}<span>${escapeHtml(message)}</span></div>`;
  renderIcons(container);
  clearTimeout(timer);
  timer = setTimeout(() => {
    container.innerHTML = '';
  }, duration);
}

export function toastError(error) {
  showToast(error && error.message ? error.message : String(error), 'error', 3600);
}
