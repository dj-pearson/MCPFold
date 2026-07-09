import { Route, Routes } from 'react-router-dom';
import { Layout } from './Layout';
import { Home } from './pages/Home';
import { InstallPage } from './install/InstallPage';
import { DirectoryList } from './directory/DirectoryList';
import { CategoryPage } from './directory/CategoryPage';
import { ServerPage } from './directory/ServerPage';
import { PricingPage } from './pricing/PricingPage';
import { BlogIndex } from './blog/BlogIndex';
import { BlogPost } from './blog/BlogPost';
import { Changelog } from './blog/Changelog';

/** Marketing-site routes (S13.1). The full E13 surface mounts under the shared Layout. */
export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/install" element={<InstallPage />} />
        <Route path="/directory" element={<DirectoryList />} />
        <Route path="/directory/category/:cat" element={<CategoryPage />} />
        <Route path="/directory/:id" element={<ServerPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/blog" element={<BlogIndex />} />
        <Route path="/blog/:slug" element={<BlogPost />} />
        <Route path="/changelog" element={<Changelog />} />
      </Route>
    </Routes>
  );
}
