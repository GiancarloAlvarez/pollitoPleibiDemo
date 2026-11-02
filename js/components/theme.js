const THEME_KEY = 'pollito-theme';

export function getTheme() {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  } catch (error) {
    return 'light';
  }
}

export function applyTheme(theme = getTheme()) {
  const next = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.classList.toggle('dark', next === 'dark');
  document.body.classList.toggle('dark', next === 'dark');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', next === 'dark' ? '#12142b' : '#fff8ea');
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch (error) {
    return next;
  }
  window.dispatchEvent(new CustomEvent('theme:change', { detail: { theme: next } }));
  return next;
}

export function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  return applyTheme(next);
}

export function initTheme() {
  const theme = getTheme();
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.body.classList.toggle('dark', theme === 'dark');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#12142b' : '#fff8ea');
  return theme;
}
