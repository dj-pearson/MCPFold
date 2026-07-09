import { Outlet } from 'react-router-dom';
import { RouteHead } from './seo/Seo';
import { Header } from './nav/Header';
import { Footer } from './nav/Footer';

/**
 * Site shell (S13.1; full IA S13.9). A skip-to-content link, the responsive header (single-source
 * nav + mobile menu + theme toggle), the routed page in <main>, and the grouped footer. Header and
 * footer are driven by site-structure.ts so a new page is registered in one place. Docs live at
 * /docs (separate build); the app on its own subdomain.
 */
export function Layout() {
  return (
    <>
      <RouteHead />
      <a href="#main" className="skip-link" data-testid="skip-link">
        Skip to content
      </a>
      <Header />
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
      <Footer />
    </>
  );
}
