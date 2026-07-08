import { useEffect, useMemo, useState } from 'react';
import type { Config, ServerConfig } from '@mcpfold/core';
import { useAuth } from '../auth/AuthProvider';
import { createCloudApi } from '../api/cloud';
import { emptyDraft, type ServerDraft, validateDraft } from './validation';

const EMPTY: Config = { version: 1, servers: {}, profiles: {} };

interface HistoryEntry {
  version: number;
  at: number;
  pending?: boolean;
}

export function ConfigEditor() {
  const { session } = useAuth();
  const api = useMemo(() => createCloudApi(() => session?.accessToken ?? null), [session]);

  const [config, setConfig] = useState<Config>(EMPTY);
  const [version, setVersion] = useState<number>(0);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [draft, setDraft] = useState<ServerDraft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .getConfig()
      .then((r) => {
        if (active && r) {
          setConfig(r.config);
          setVersion(r.version);
        }
      })
      .catch((e) => active && setLoadError(e instanceof Error ? e.message : 'Failed to load.'));
    return () => {
      active = false;
    };
  }, [api]);

  const names = Object.keys(config.servers);
  const validation = validateDraft(draft, names);
  const canAdd =
    !!draft.name.trim() &&
    validation.server !== null &&
    Object.keys(validation.errors).length === 0;

  function setField<K extends keyof ServerDraft>(key: K, value: ServerDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function addServer() {
    if (!canAdd || !validation.server) return;
    setConfig((c) => ({
      ...c,
      servers: { ...c.servers, [draft.name.trim()]: validation.server as ServerConfig },
    }));
    setDraft(emptyDraft);
  }

  function removeServer(name: string) {
    setConfig((c) => {
      const servers = { ...c.servers };
      delete servers[name];
      return { ...c, servers };
    });
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    // Optimistic: show the next version + a pending history entry, roll back on failure.
    const prevVersion = version;
    const prevHistory = history;
    const optimistic = prevVersion + 1;
    setVersion(optimistic);
    setHistory((h) => [{ version: optimistic, at: Date.now(), pending: true }, ...h]);
    try {
      const { version: saved } = await api.saveConfig(config);
      setVersion(saved);
      setHistory((h) => h.map((e) => (e.pending ? { version: saved, at: e.at } : e)));
    } catch (e) {
      setVersion(prevVersion);
      setHistory(prevHistory);
      setSaveError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <div className="editor-head">
        <h2>Config editor</h2>
        <div className="muted">
          {version > 0 ? `version ${version}` : 'unsaved'}
          <button className="link" onClick={() => void save()} disabled={saving} data-testid="save">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
      {loadError && (
        <p className="error" role="alert">
          {loadError}
        </p>
      )}
      {saveError && (
        <p className="error" role="alert">
          {saveError}
        </p>
      )}

      <section className="card">
        <h3>Servers</h3>
        {names.length === 0 ? (
          <p className="muted">No servers yet — add one below.</p>
        ) : (
          <ul className="server-list">
            {names.map((name) => (
              <li key={name} data-testid={`server-${name}`}>
                <code>{name}</code> <span className="muted">{config.servers[name]!.transport}</span>
                <button
                  className="link"
                  onClick={() => removeServer(name)}
                  aria-label={`Remove ${name}`}
                >
                  remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h3>Add a server</h3>
        <label>
          Name
          <input value={draft.name} onChange={(e) => setField('name', e.target.value)} />
        </label>
        {validation.errors.name && <p className="error">{validation.errors.name}</p>}

        <label>
          Transport
          <select
            value={draft.transport}
            onChange={(e) => setField('transport', e.target.value as ServerDraft['transport'])}
          >
            <option value="stdio">stdio</option>
            <option value="http">http</option>
            <option value="sse">sse</option>
          </select>
        </label>

        {draft.transport === 'stdio' ? (
          <>
            <label>
              Command
              <input value={draft.command} onChange={(e) => setField('command', e.target.value)} />
            </label>
            {validation.errors.command && <p className="error">{validation.errors.command}</p>}
            <label>
              Arguments
              <input
                value={draft.args}
                onChange={(e) => setField('args', e.target.value)}
                placeholder="-y @scope/pkg"
              />
            </label>
          </>
        ) : (
          <>
            <label>
              URL
              <input
                value={draft.url}
                onChange={(e) => setField('url', e.target.value)}
                placeholder="https://…/mcp"
              />
            </label>
            {validation.errors.url && <p className="error">{validation.errors.url}</p>}
          </>
        )}

        <label>
          Auth token (reference only)
          <input
            value={draft.token}
            onChange={(e) => setField('token', e.target.value)}
            placeholder="${env:GITHUB_PAT}"
          />
        </label>
        {validation.errors.token && (
          <p className="error" role="alert">
            {validation.errors.token}
          </p>
        )}

        <label>
          Tags (comma-separated)
          <input
            value={draft.tags}
            onChange={(e) => setField('tags', e.target.value)}
            placeholder="work, code"
          />
        </label>

        <button onClick={addServer} disabled={!canAdd} data-testid="add-server">
          Add server
        </button>
      </section>

      {history.length > 0 && (
        <section className="card">
          <h3>Version history</h3>
          <ul className="history">
            {history.map((h, i) => (
              <li key={i}>
                version {h.version}
                {h.pending ? ' (saving…)' : ''}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
