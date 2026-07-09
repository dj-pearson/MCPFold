import { Link } from 'react-router-dom';
import { CLIENT_IDS, type Config } from '@mcpfold/core';
import { useAuth } from '../auth/AuthProvider';

// Reuses the canonical types straight from @mcpfold/core — the web app never redefines the
// config shape. The visual editor (S7.2) builds on exactly this `Config`.
const EMPTY_CONFIG: Config = { version: 2, servers: {}, profiles: {} };

export function Dashboard() {
  const { session } = useAuth();
  return (
    <div className="page">
      <p className="muted">
        Signed in as <strong>{session?.email}</strong>.
      </p>
      <section className="card">
        <h2>Your config</h2>
        <p className="muted">
          Format version {EMPTY_CONFIG.version} · {Object.keys(EMPTY_CONFIG.servers).length}{' '}
          servers. The visual editor lands next.
        </p>
      </section>
      <section className="card">
        <h2>Supported clients</h2>
        <ul className="chips">
          {CLIENT_IDS.map((id) => (
            <li key={id} className="chip">
              {id}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function Header() {
  const { session, signOut } = useAuth();
  if (!session) return null;
  return (
    <header className="topbar">
      <span className="brand">mcpfold</span>
      <nav className="nav">
        <Link to="/">Overview</Link>
        <Link to="/editor">Editor</Link>
        <Link to="/profiles">Profiles</Link>
        <Link to="/directory">Directory</Link>
        <Link to="/machines">Sync</Link>
        <Link to="/teams">Teams</Link>
        <button className="link" onClick={() => void signOut()}>
          Sign out
        </button>
      </nav>
    </header>
  );
}
