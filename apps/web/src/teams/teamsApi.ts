/**
 * Team console API (S7.6) — team CRUD, membership, and the audit trail over the edge team
 * endpoints (RLS-scoped by the user's token). Abstracted so e2e (VITE_E2E=1) uses an in-memory
 * mock. The heavy lifting — team-scoped access, non-member denial — is enforced by RLS server-side.
 */

export interface Team {
  id: string;
  name: string;
  isOwner: boolean;
}

export interface Member {
  userId: string;
  email: string;
  role: string;
}

export interface AuditEntry {
  version: number;
  author: string;
  at: string;
  added: string[];
  removed: string[];
}

export interface TeamsApi {
  listTeams(): Promise<Team[]>;
  createTeam(name: string): Promise<Team>;
  listMembers(teamId: string): Promise<Member[]>;
  invite(teamId: string, email: string, role: string): Promise<void>;
  remove(teamId: string, userId: string): Promise<void>;
  audit(teamId: string): Promise<AuditEntry[]>;
}

const API_BASE = import.meta.env.VITE_API_URL ?? 'https://functions.mcpfold.com';

function httpTeamsApi(base: string, getToken: () => string | null): TeamsApi {
  const headers = (json = false): Record<string, string> => {
    const token = getToken();
    return {
      ...(json ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    };
  };
  const ok = async (res: Response, what: string) => {
    if (!res.ok) throw new Error(`${what} failed (${res.status}).`);
    return res;
  };
  return {
    async listTeams() {
      return (await (
        await ok(await fetch(`${base}/teams`, { headers: headers() }), 'List teams')
      ).json()) as Team[];
    },
    async createTeam(name) {
      const res = await ok(
        await fetch(`${base}/teams`, {
          method: 'POST',
          headers: headers(true),
          body: JSON.stringify({ name }),
        }),
        'Create team',
      );
      const d = await res.json();
      return { id: d.id as string, name: d.name as string, isOwner: true };
    },
    async listMembers(teamId) {
      const res = await ok(
        await fetch(`${base}/team-members?team=${teamId}`, { headers: headers() }),
        'List members',
      );
      return (await res.json()) as Member[];
    },
    async invite(teamId, email, role) {
      await ok(
        await fetch(`${base}/team-invite`, {
          method: 'POST',
          headers: headers(true),
          body: JSON.stringify({ team: teamId, email, role }),
        }),
        'Invite',
      );
    },
    async remove(teamId, userId) {
      await ok(
        await fetch(`${base}/team-remove`, {
          method: 'POST',
          headers: headers(true),
          body: JSON.stringify({ team: teamId, user_id: userId }),
        }),
        'Remove',
      );
    },
    async audit(teamId) {
      const res = await ok(
        await fetch(`${base}/team-audit?team=${teamId}`, { headers: headers() }),
        'Audit',
      );
      return (await res.json()) as AuditEntry[];
    },
  };
}

let mockSingleton: TeamsApi | null = null;
function mockTeamsApi(): TeamsApi {
  const teams: Team[] = [];
  const members: Record<string, Member[]> = {};
  const audits: Record<string, AuditEntry[]> = {};
  let counter = 0;
  return {
    listTeams: () => Promise.resolve([...teams]),
    createTeam: (name) => {
      const team: Team = { id: `team-${++counter}`, name, isOwner: true };
      teams.push(team);
      members[team.id] = [{ userId: 'me', email: 'dev@mcpfold.com', role: 'owner' }];
      audits[team.id] = [
        {
          version: 1,
          author: 'dev@mcpfold.com',
          at: '2026-07-08T10:00:00Z',
          added: ['github'],
          removed: [],
        },
      ];
      return Promise.resolve(team);
    },
    listMembers: (id) => Promise.resolve([...(members[id] ?? [])]),
    invite: (id, email, role) => {
      (members[id] ??= []).push({ userId: email, email, role });
      return Promise.resolve();
    },
    remove: (id, userId) => {
      members[id] = (members[id] ?? []).filter((m) => m.userId !== userId);
      return Promise.resolve();
    },
    audit: (id) => Promise.resolve([...(audits[id] ?? [])]),
  };
}

export function createTeamsApi(getToken: () => string | null): TeamsApi {
  if (import.meta.env.VITE_E2E === '1') return (mockSingleton ??= mockTeamsApi());
  return httpTeamsApi(API_BASE, getToken);
}
