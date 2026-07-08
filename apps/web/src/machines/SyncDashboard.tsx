import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { createCloudApi, type MachineStatus, type VersionRecord } from '../api/cloud';
import { revokeMachine } from './revoke';

/**
 * Per-machine sync status dashboard (S7.5). Lists each machine with its last-seen time and last
 * pushed version, flags machines behind the latest version, and shows recent version history with
 * author + timestamp. All data is fetched with the user's token → RLS scopes it to them/their team.
 */

function fmt(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function SyncDashboard() {
  const { session } = useAuth();
  const api = useMemo(() => createCloudApi(() => session?.accessToken ?? null), [session]);

  const [machines, setMachines] = useState<MachineStatus[]>([]);
  const [latestVersion, setLatestVersion] = useState(0);
  const [history, setHistory] = useState<VersionRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load(): Promise<void> {
    const [m, h] = await Promise.all([api.getMachines(), api.getVersionHistory()]);
    setMachines(m.machines);
    setLatestVersion(m.latestVersion);
    setHistory(h);
  }

  useEffect(() => {
    let active = true;
    load()
      .catch((e) => active && setError(e instanceof Error ? e.message : 'Failed to load.'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  async function handleRevoke(name: string): Promise<void> {
    setError(null);
    try {
      await revokeMachine(api, name);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Revoke failed.');
    }
  }

  if (loading) return <div className="center muted">Loading…</div>;

  return (
    <div className="page">
      <div className="editor-head">
        <h2>Sync status</h2>
        <span className="muted">latest version {latestVersion}</span>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <section className="card">
        <h3>Machines</h3>
        {machines.length === 0 ? (
          <p className="muted">No machines have synced yet.</p>
        ) : (
          <ul className="server-list">
            {machines.map((m) => {
              const behind = m.lastVersion < latestVersion;
              return (
                <li
                  key={m.name}
                  data-testid={`machine-${m.name}`}
                  className={behind ? 'behind' : undefined}
                >
                  <code>{m.name}</code>
                  <span className="muted">last seen {fmt(m.lastSeen)}</span>
                  <span className="muted">v{m.lastVersion}</span>
                  {behind && (
                    <span className="badge-behind" data-testid={`behind-${m.name}`}>
                      behind
                    </span>
                  )}
                  <button
                    className="link"
                    data-testid={`revoke-${m.name}`}
                    onClick={() => void handleRevoke(m.name)}
                  >
                    revoke
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card">
        <h3>Version history</h3>
        <ul className="history">
          {history.map((r) => (
            <li key={r.version} data-testid={`history-${r.version}`}>
              <strong>v{r.version}</strong> <span className="muted">{r.author}</span>{' '}
              <span className="muted">{fmt(r.at)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
