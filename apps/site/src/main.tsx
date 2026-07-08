import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { applyStoredTheme } from './design/theme';
import { initAnalytics } from './analytics';
import './design/tokens.css';

applyStoredTheme();
initAnalytics();

const root = document.getElementById('root')!;
const tree = (
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);

// Prerendered routes (S15.1) ship real HTML inside #root — hydrate it in place (no flash). The dev
// server serves an empty shell, so fall back to a fresh client render there.
if (root.hasChildNodes()) {
  hydrateRoot(root, tree);
} else {
  createRoot(root).render(tree);
}
