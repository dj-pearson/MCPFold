import { useMemo, useState } from 'react';
import { createCloudApi } from '../api/cloud';
import { useAuth } from '../auth/AuthProvider';

/**
 * Self-service data-subject controls (compliance follow-up): lets a signed-in user export a copy of
 * their data or permanently delete their account, backed by the edge /account-export and
 * /account-delete endpoints. This makes the GDPR/CCPA access, portability, and erasure rights the
 * privacy policy grants actually exercisable without emailing support.
 */
export function AccountPrivacy() {
  const { session, signOut } = useAuth();
  const api = useMemo(() => createCloudApi(() => session?.accessToken ?? null), [session]);
  const [busy, setBusy] = useState<'export' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onExport() {
    setError(null);
    setBusy('export');
    try {
      const blob = await api.exportAccount();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mcpfold-account-export.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed.');
    } finally {
      setBusy(null);
    }
  }

  async function onDelete() {
    const ok = window.confirm(
      'Permanently delete your account and all synced data? This cannot be undone.',
    );
    if (!ok) return;
    setError(null);
    setBusy('delete');
    try {
      await api.deleteAccount();
      await signOut();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Deletion failed.');
      setBusy(null);
    }
  }

  return (
    <section className="card" aria-labelledby="privacy-heading">
      <h2 id="privacy-heading">Privacy &amp; your data</h2>
      <p className="muted">
        You can export or permanently delete your data at any time, as described in the{' '}
        <a href="https://mcpfold.com/privacy">privacy policy</a>. Secret values never leave your
        machine, so they are not part of any export.
      </p>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => void onExport()} disabled={busy !== null}>
          {busy === 'export' ? 'Preparing…' : 'Download my data'}
        </button>
        <button
          type="button"
          onClick={() => void onDelete()}
          disabled={busy !== null}
          style={{ borderColor: '#c92a2a', color: '#c92a2a' }}
        >
          {busy === 'delete' ? 'Deleting…' : 'Delete my account'}
        </button>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
