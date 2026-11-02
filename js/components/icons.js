export function icon(name, size = 18, className = '') {
  return `<span class="ico ${className}" style="width:${size}px;height:${size}px"><i data-lucide="${name}" aria-hidden="true"></i></span>`;
}

export function renderIcons(root = document) {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}
