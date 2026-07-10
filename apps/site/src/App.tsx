import { Route, Routes } from 'react-router-dom';
import { Layout } from './Layout';
import { Home } from './pages/Home';
import { InstallPage } from './install/InstallPage';
import { DirectoryList } from './directory/DirectoryList';
import { CategoryPage } from './directory/CategoryPage';
import { ServerPage } from './directory/ServerPage';
import { PricingPage } from './pricing/PricingPage';
import { SecurityPage } from './security/SecurityPage';
import { BlogIndex } from './blog/BlogIndex';
import { BlogPost } from './blog/BlogPost';
import { Changelog } from './blog/Changelog';
import { GuidesIndex, GuidePage } from './guides/ClientGuide';
import { GlossaryIndex, TermPage } from './glossary/Glossary';
import { CompareIndex, ComparePage } from './compare/Compare';
import { TokenCalculatorPage } from './calculator/TokenCalculatorPage';
import { FeaturesIndex, FeaturePage } from './features/FeaturePages';
import { UseCasesIndex, UseCasePage } from './use-cases/UseCasePages';
import { About } from './about/About';
import { LegalPage } from './legal/LegalPage';
import { Community } from './community/Community';
import { Roadmap } from './roadmap/Roadmap';
import { Brand } from './brand/Brand';
import { NotFound } from './pages/NotFound';

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
        <Route path="/guides" element={<GuidesIndex />} />
        <Route path="/guides/:client" element={<GuidePage />} />
        <Route path="/glossary" element={<GlossaryIndex />} />
        <Route path="/glossary/:term" element={<TermPage />} />
        <Route path="/compare" element={<CompareIndex />} />
        <Route path="/compare/:id" element={<ComparePage />} />
        <Route path="/mcp-token-calculator" element={<TokenCalculatorPage />} />
        <Route path="/features" element={<FeaturesIndex />} />
        <Route path="/features/:id" element={<FeaturePage />} />
        <Route path="/use-cases" element={<UseCasesIndex />} />
        <Route path="/use-cases/:id" element={<UseCasePage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/security" element={<SecurityPage />} />
        <Route path="/about" element={<About />} />
        <Route path="/privacy" element={<LegalPage id="privacy" />} />
        <Route path="/terms" element={<LegalPage id="terms" />} />
        <Route path="/analytics" element={<LegalPage id="analytics" />} />
        <Route path="/community" element={<Community />} />
        <Route path="/blog" element={<BlogIndex />} />
        <Route path="/blog/:slug" element={<BlogPost />} />
        <Route path="/changelog" element={<Changelog />} />
        <Route path="/roadmap" element={<Roadmap />} />
        <Route path="/brand" element={<Brand />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
