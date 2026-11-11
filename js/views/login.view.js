import { icon } from '../components/icons.js';
import { getTheme } from '../components/theme.js';
import { login } from '../core/auth.js';
import { state } from '../core/state.js';
import { navigate, defaultRoute } from '../core/router.js';
import { showToast } from '../components/toast.js';
import { demoUsers, DEMO_PASSWORD } from '../data/seed.js';
import { localEnabled, localStatus } from '../core/local-client.js';

function demoRow(user) {
  return `<div class="demo-row">
    <span><b>${user.role_name}</b><small>${user.email}</small></span>
    <button type="button" data-demo="${user.role}">Usar</button>
  </div>`;
}

export function renderLogin() {
  const dark = getTheme() === 'dark';
  return `<main class="login-page">
    <button class="theme-login" data-action="toggle-theme" aria-label="${dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}">${icon(dark ? 'sun' : 'moon', 18)}</button>
    <section class="login-brand">
      <div class="brand-large">
        <div class="logo-mark big">P</div>
        <div><strong>Pollito <span>Pleibi</span></strong><small>FOOD TRUCK</small></div>
      </div>
      <div class="brand-copy">
        <p class="eyebrow">SISTEMA INTEGRAL</p>
        <h1>Todo el sabor,<br><span>todo bajo control.</span></h1>
        <p>Ventas, inventario y operaciones en un solo lugar para que tu negocio no pare.</p>
      </div>
      <div class="value-points">
        <div>${icon('check', 16)}<span><b>Ventas rápidas</b><small>Vende sin complicaciones</small></span></div>
        <div>${icon('check', 16)}<span><b>Inventario al día</b><small>Controla cada insumo</small></span></div>
        <div>${icon('check', 16)}<span><b>Control de caja</b><small>Números siempre claros</small></span></div>
      </div>
      <span class="brand-shape shape-one"></span>
      <span class="brand-shape shape-two"></span>
    </section>
    <section class="login-form-wrap">
      <div class="login-form">
        <div class="mobile-login-brand"><div class="logo-mark">P</div><strong>Pollito <span>Pleibi</span></strong></div>
        <div class="form-heading">
          <p class="eyebrow">BIENVENIDO DE VUELTA</p>
          <h2>Inicia sesión</h2>
          <p>Accede a tu panel de operaciones.</p>
        </div>
        <form id="login-form" novalidate>
          <label>Correo electrónico
            <input id="login-email" type="email" placeholder="tu@correo.com" autocomplete="email">
          </label>
          <label>Contraseña
            <div class="password-input">
              <input id="login-password" type="password" placeholder="••••••••••" autocomplete="current-password">
              <button type="button" data-action="toggle-password">Mostrar</button>
            </div>
          </label>
          <div class="form-row">
            <label class="check-label"><input id="login-remember" type="checkbox"> Recordarme</label>
            <button type="button" class="link-btn" data-action="forgot">¿Olvidaste tu contraseña?</button>
          </div>
          <div class="form-error" id="login-error" hidden aria-live="polite"></div>
          <button class="primary-btn login-btn" type="submit"><span id="login-submit-text">Iniciar sesión</span>${icon('chevron-right', 17)}</button>
        </form>
        ${!localEnabled() || localStatus().demo ? `<details class="demo-credentials">
          <summary>${icon('sparkles', 15)} Credenciales de demostración ${icon('chevron-down', 15)}</summary>
          <div class="demo-list">
            ${demoUsers().map(demoRow).join('')}
            <small>Los datos viven en este dispositivo. Al configurar Supabase, la sesión y los cambios se sincronizan automáticamente.</small>
          </div>
        </details>` : ''}
        <p class="privacy">${icon('lock', 12)} ${localEnabled()
          ? 'Servicio local de caja y cocina. Usa tu cuenta autorizada; los cambios de nube se muestran por separado.'
          : 'Modo independiente. Los permisos remotos requieren una sesión Supabase válida.'}</p>
      </div>
    </section>
  </main>`;
}

export function bindLogin(root) {
  const form = root.querySelector('#login-form');
  const emailInput = root.querySelector('#login-email');
  const passwordInput = root.querySelector('#login-password');
  const errorBox = root.querySelector('#login-error');
  const submitText = root.querySelector('#login-submit-text');
  const submitButton = form.querySelector('button[type="submit"]');
  const remember = root.querySelector('#login-remember');

  const setError = message => {
    errorBox.hidden = !message;
    errorBox.textContent = message || '';
  };

  root.querySelector('[data-action="toggle-password"]').addEventListener('click', event => {
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
    event.currentTarget.textContent = isPassword ? 'Ocultar' : 'Mostrar';
  });

  root.querySelector('[data-action="forgot"]').addEventListener('click', () => {
    setError('Te enviaremos un enlace de recuperación cuando conectes el correo de Supabase.');
  });

  root.querySelectorAll('[data-demo]').forEach(button => {
    button.addEventListener('click', () => {
      const role = button.getAttribute('data-demo');
      const user = demoUsers().find(row => row.role === role);
      if (!user) return;
      emailInput.value = user.email;
      passwordInput.value = DEMO_PASSWORD;
      setError('');
      emailInput.focus();
    });
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password || !email.includes('@')) {
      setError('Completa un correo válido y tu contraseña.');
      return;
    }
    setError('');
    submitButton.disabled = true;
    submitText.textContent = '';
    submitText.insertAdjacentHTML('beforeend', '<span class="spinner"></span>');
    try {
      const user = await login(email, password, remember.checked);
      state.user = user;
      state.isLogged = true;
      state.role = user.role;
      showToast(`Bienvenido, ${user.name.split(' ')[0]}`, 'success');
      navigate(defaultRoute(user.role));
    } catch (error) {
      setError(error.message || 'No se pudo iniciar sesión.');
      submitButton.disabled = false;
      submitText.textContent = 'Iniciar sesión';
      passwordInput.focus();
    }
  });

  setTimeout(() => emailInput.focus(), 60);
}
