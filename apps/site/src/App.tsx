import { Route, Routes } from 'react-router-dom';
import { Layout } from './Layout';
import { Home } from './pages/Home';
import { InstallPage } from './install/InstallPage';

/** Marketing-site routes (S13.1). Later E13 pages (pricing, directory, blog) mount here under the
 * shared Layout. */
export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/install" element={<InstallPage />} />
      </Route>
    </Routes>
  );
}
