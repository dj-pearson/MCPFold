import { Route, Routes } from 'react-router-dom';
import { Layout } from './Layout';
import { Home } from './pages/Home';
import { InstallPage } from './install/InstallPage';
import { DirectoryList } from './directory/DirectoryList';
import { ServerPage } from './directory/ServerPage';

/** Marketing-site routes (S13.1). Later E13 pages (pricing, blog) mount here under the shared
 * Layout. */
export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/install" element={<InstallPage />} />
        <Route path="/directory" element={<DirectoryList />} />
        <Route path="/directory/:id" element={<ServerPage />} />
      </Route>
    </Routes>
  );
}
