import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import {
  type AuditEntry,
  createTeamsApi,
  isPaidTier,
  type Member,
  type Team,
  type Tier,
} from './teamsApi';

const TIER_LABEL: Record<Tier, string> = {
  'cloud-free': 'Free',
  team: 'Team',
  enterprise: 'Enterprise',
};

/**
 * Team console (S7.6): create teams, manage members + roles, and review the change-audit trail
 * (who changed the shared config, when, and a per-version diff). Team-scoped access + non-member
 * denial are enforced by RLS server-side; member removal revokes access immediately.
 */

function fmt(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function TeamConsole() {
  const { session } = useAuth();
  const api = useMemo(() => createTeamsApi(() => session?.accessToken ?? null), [session]);

  const [teams, setTeams] = useState<Team[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [newTeam, setNewTeam] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [tier, setTier] = useState<Tier>('cloud-free');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listTeams()
      .then(setTeams)
      .catch((e) => setError(String(e)));
  }, [api]);

  async function openTeam(id: string): Promise<void> {
    setSelected(id);
    setError(null);
    try {
      setMembers(await api.listMembers(id));
      setAudit(await api.audit(id));
      setTier(await api.entitlement(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load team.');
    }
  }

  async function upgrade(): Promise<void> {
    if (!selected) return;
    await guard(async () => {
      const { url } = await api.checkout(selected);
      if (url) {
        window.location.href = url; // redirect to Stripe Checkout
        return;
      }
      setTier(await api.entitlement(selected)); // preview/mock: no redirect, just refresh
    });
  }

  async function manageBilling(): Promise<void> {
    if (!selected) return;
    await guard(async () => {
      const { url } = await api.portal(selected);
      if (url) window.location.href = url;
    });
  }

  async function guard(fn: () => Promise<void>): Promise<void> {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed.');
    }
  }

  return (
    <div className="page">
      <div className="editor-head">
        <h2>Teams</h2>
        {selected && (
          <span className="badge-behind" data-testid="billing-gate" data-tier={tier}>
            {TIER_LABEL[tier]} tier
          </span>
        )}
      </div>
      <p className="muted">
        Shared team configs with member roles and an audit trail. Inviting members is a paid team
        feature — free teams can be created, then upgraded to add members.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <section className="card">
        <h3>Your teams</h3>
        <ul className="server-list">
          {teams.map((t) => (
            <li key={t.id} data-testid={`team-${t.id}`}>
              <code>{t.name}</code> {t.isOwner && <span className="muted">owner</span>}
              <button
                className="link"
                data-testid={`open-${t.id}`}
                onClick={() => void openTeam(t.id)}
              >
                open
              </button>
            </li>
          ))}
          {teams.length === 0 && <li className="muted">No teams yet.</li>}
        </ul>
        <label>
          New team name
          <input value={newTeam} onChange={(e) => setNewTeam(e.target.value)} />
        </label>
        <button
          data-testid="create-team"
          disabled={!newTeam.trim()}
          onClick={() =>
            void guard(async () => {
              const t = await api.createTeam(newTeam.trim());
              setNewTeam('');
              setTeams(await api.listTeams());
              await openTeam(t.id);
            })
          }
        >
          Create team
        </button>
      </section>

      {selected && (
        <>
          <section className="card">
            <h3>Members</h3>
            <ul className="server-list">
              {members.map((m) => (
                <li key={m.userId} data-testid={`member-${m.email}`}>
                  <code>{m.email}</code> <span className="muted">{m.role}</span>
                  {m.role !== 'owner' && (
                    <button
                      className="link"
                      data-testid={`remove-${m.email}`}
                      onClick={() =>
                        void guard(async () => {
                          await api.remove(selected, m.userId);
                          setMembers(await api.listMembers(selected));
                        })
                      }
                    >
                      remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {!isPaidTier(tier) && (
              <p className="muted" data-testid="upgrade-cta">
                Inviting members needs the Team tier.{' '}
                <button className="link" data-testid="upgrade" onClick={() => void upgrade()}>
                  Upgrade
                </button>{' '}
                to add teammates.
              </p>
            )}
            <label>
              Invite by email
              <input
                value={inviteEmail}
                disabled={!isPaidTier(tier)}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </label>
            <label>
              Role
              <select
                value={inviteRole}
                disabled={!isPaidTier(tier)}
                onChange={(e) => setInviteRole(e.target.value)}
              >
                <option value="member">member</option>
                <option value="admin">admin</option>
              </select>
            </label>
            <button
              data-testid="invite"
              disabled={!inviteEmail.trim() || !isPaidTier(tier)}
              onClick={() =>
                void guard(async () => {
                  await api.invite(selected, inviteEmail.trim(), inviteRole);
                  setInviteEmail('');
                  setMembers(await api.listMembers(selected));
                })
              }
            >
              Invite
            </button>
            {isPaidTier(tier) && (
              <button
                className="link"
                data-testid="manage-billing"
                onClick={() => void manageBilling()}
              >
                Manage billing
              </button>
            )}
          </section>

          <section className="card">
            <h3>Audit trail</h3>
            <ul className="history">
              {audit.map((a) => (
                <li key={a.version} data-testid={`audit-${a.version}`}>
                  <strong>v{a.version}</strong> <span className="muted">{a.author}</span>{' '}
                  <span className="muted">{fmt(a.at)}</span>{' '}
                  {a.added.map((n) => (
                    <span key={n} className="chip">
                      +{n}
                    </span>
                  ))}
                  {a.removed.map((n) => (
                    <span key={n} className="chip">
                      −{n}
                    </span>
                  ))}
                </li>
              ))}
              {audit.length === 0 && <li className="muted">No changes yet.</li>}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
