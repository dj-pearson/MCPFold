/** Theme management (S13.1) — a manual override persisted in localStorage, layered over the
 * OS `prefers-color-scheme` default. `data-theme` on <html> is what the tokens read. */
export type Theme = 'light' | 'dark';
const KEY = 'mcpfold-theme';

export function storedTheme(): Theme | null {
  const v = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
  return v === 'light' || v === 'dark' ? v : null;
}

export function applyStoredTheme(): void {
  const t = storedTheme();
  if (t) document.documentElement.setAttribute('data-theme', t);
}

function systemTheme(): Theme {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export function currentTheme(): Theme {
  return storedTheme() ?? systemTheme();
}

export function toggleTheme(): Theme {
  const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
  localStorage.setItem(KEY, next);
  document.documentElement.setAttribute('data-theme', next);
  return next;
}
