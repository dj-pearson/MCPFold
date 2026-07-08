import { useEffect, useMemo, useState } from 'react';
import { CLIENT_IDS, type Config, type ProfileConfig, resolveProfile, SCOPES } from '@mcpfold/core';
import { useAuth } from '../auth/AuthProvider';
import { createCloudApi } from '../api/cloud';
import { emptyProfileDraft, type ProfileDraft, validateProfileDraft } from './validation';

const EMPTY: Config = { version: 1, servers: {}, profiles: {} };

export function ProfileManager() {
  const { session } = useAuth();
  const api = useMemo(() => createCloudApi(() => session?.accessToken ?? null), [session]);

  const [config, setConfig] = useState<Config>(EMPTY);
  const [version, setVersion] = useState(0);
  const [draft, setDraft] = useState<ProfileDraft>(emptyProfileDraft);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.getConfig().then((r) => {
      if (active && r) {
        setConfig(r.config);
        setVersion(r.version);
      }
    });
    return () => {
      active = false;
    };
  }, [api]);

  const names = Object.keys(config.profiles);
  const validation = validateProfileDraft(draft, names);
  const canAdd =
    !!draft.name.trim() &&
    validation.profile !== null &&
    Object.keys(validation.errors).length === 0;

  // Live preview: which servers would this profile fold out to (server-level curation)?
  const preview = useMemo(() => {
    if (!validation.profile || !draft.name.trim()) return [];
    const name = draft.name.trim();
    const synthetic: Config = {
      ...config,
      profiles: { ...config.profiles, [name]: validation.profile },
    };
    try {
      return resolveProfile(synthetic, name).map((s) => s.name);
    } catch {
      return [];
    }
  }, [config, validation.profile, draft.name]);

  function setField<K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function upsertProfile() {
    if (!canAdd || !validation.profile) return;
    setConfig((c) => ({
      ...c,
      profiles: { ...c.profiles, [draft.name.trim()]: validation.profile as ProfileConfig },
    }));
    setDraft(emptyProfileDraft);
  }

  function editProfile(name: string) {
    const p = config.profiles[name]!;
    setDraft({
      name,
      client: p.client,
      scope: p.scope,
      path: p.path ?? '',
      include: p.include.join(', '),
    });
  }

  function removeProfile(name: string) {
    setConfig((c) => {
      const profiles = { ...c.profiles };
      delete profiles[name];
      return { ...c, profiles };
    });
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const { version: saved } = await api.saveConfig(config);
      setVersion(saved);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <div className="editor-head">
        <h2>Profiles</h2>
        <div className="muted">
          {version > 0 ? `version ${version}` : 'unsaved'}
          <button className="link" onClick={() => void save()} disabled={saving} data-testid="save">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
      {saveError && (
        <p className="error" role="alert">
          {saveError}
        </p>
      )}

      <section className="card">
        <h3>Profiles</h3>
        {names.length === 0 ? (
          <p className="muted">No profiles yet — create one below.</p>
        ) : (
          <ul className="server-list">
            {names.map((name) => (
              <li key={name} data-testid={`profile-${name}`}>
                <code>{name}</code>{' '}
                <span className="muted">
                  {config.profiles[name]!.client} · {config.profiles[name]!.scope}
                </span>
                <button className="link" onClick={() => editProfile(name)}>
                  edit
                </button>
                <button
                  className="link"
                  onClick={() => removeProfile(name)}
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
        <h3>Create / edit a profile</h3>
        <label>
          Name
          <input value={draft.name} onChange={(e) => setField('name', e.target.value)} />
        </label>
        {validation.errors.name && <p className="error">{validation.errors.name}</p>}

        <label>
          Client
          <select
            value={draft.client}
            onChange={(e) => setField('client', e.target.value as ProfileDraft['client'])}
          >
            {CLIENT_IDS.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>

        <label>
          Scope
          <select
            value={draft.scope}
            onChange={(e) => setField('scope', e.target.value as ProfileDraft['scope'])}
          >
            {SCOPES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        {draft.scope !== 'user' && (
          <>
            <label>
              Path
              <input
                value={draft.path}
                onChange={(e) => setField('path', e.target.value)}
                placeholder="/path/to/project"
              />
            </label>
            {validation.errors.path && (
              <p className="error" role="alert">
                {validation.errors.path}
              </p>
            )}
          </>
        )}

        <label>
          Include tags (comma-separated)
          <input
            value={draft.include}
            onChange={(e) => setField('include', e.target.value)}
            placeholder="work, code"
          />
        </label>

        <div className="preview" data-testid="preview">
          <span className="muted">Resolves to:</span>{' '}
          {preview.length === 0 ? (
            <span className="muted">no servers</span>
          ) : (
            preview.map((n) => (
              <span key={n} className="chip" data-testid={`preview-${n}`}>
                {n}
              </span>
            ))
          )}
        </div>

        <button onClick={upsertProfile} disabled={!canAdd} data-testid="add-profile">
          Save profile
        </button>
      </section>
    </div>
  );
}
