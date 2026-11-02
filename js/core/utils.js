export function uid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function money(value) {
  const n = Number(value) || 0;
  return `RD$ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function calcTax(subtotal, rate = 0.18) {
  return round2((Number(subtotal) || 0) * (Number(rate) || 0));
}

export function sum(values) {
  return (values || []).reduce((total, value) => total + (Number(value) || 0), 0);
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function debounce(fn, wait = 180) {
  let timer = 0;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'PP';
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

export function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function startOfWeek(date = new Date()) {
  const d = startOfDay(date);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d;
}

export function startOfMonth(date = new Date()) {
  const d = startOfDay(date);
  d.setDate(1);
  return d;
}

export function dateKey(date) {
  const d = new Date(date);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

export function toDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDateLong(date = new Date()) {
  const d = toDate(date) || new Date();
  return new Intl.DateTimeFormat('es-DO', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(d).toUpperCase();
}

export function formatDateShort(date = new Date()) {
  const d = toDate(date) || new Date();
  return new Intl.DateTimeFormat('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}

export function formatDateTime(date = new Date()) {
  const d = toDate(date);
  if (!d) return '';
  return `${formatDateShort(d)} ${d.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}`;
}

export function relativeTime(date) {
  const d = toDate(date);
  if (!d) return 'Ahora';
  const diff = Date.now() - d.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes <= 0) return 'Ahora';
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `Hace ${days} d`;
}

export function percentChange(current, previous) {
  const c = Number(current) || 0;
  const p = Number(previous) || 0;
  if (!p) return c > 0 ? 100 : 0;
  return round2(((c - p) / p) * 100);
}

export function nextOrderCode(orders) {
  const max = (orders || []).reduce((highest, order) => {
    const match = String(order.code || order.id || '').match(/(\d+)/);
    const n = match ? Number(match[1]) : 0;
    return n > highest ? n : highest;
  }, 1040);
  return `#${max + 1}`;
}

export function formatPercent(value) {
  const n = Number(value) || 0;
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
}

export function compactMoney(value) {
  const n = Number(value) || 0;
  if (n >= 1000000) return `RD$ ${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `RD$ ${(n / 1000).toFixed(0)}k`;
  return money(n);
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const clean = String(hex || '').replace(/[^0-9a-f]/gi, '');
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
  return bytes;
}

export function randomSalt() {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return bytesToHex(bytes);
}

function fallbackHash(text) {
  let h1 = 0x12345678;
  let h2 = 0x9abcdef0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

export async function hashPassword(password, salt) {
  const value = `${salt}:${password}`;
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: encoder.encode(String(salt || 'pollito')), iterations: 120000, hash: 'SHA-256' },
      key,
      256,
    );
    return bytesToHex(new Uint8Array(bits));
  }
  return fallbackHash(value);
}

export async function verifyPassword(password, salt, expectedHash) {
  const hash = await hashPassword(password, salt);
  return hash === expectedHash;
}
