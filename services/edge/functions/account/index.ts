// Data-subject request (DSAR) endpoints — compliance follow-up so the hosted cloud can actually
// fulfill the access/portability and erasure rights the /privacy policy grants (GDPR Arts. 15/17/20,
// CCPA/CPRA). Both are authenticated and scoped to the caller:
//
//   GET  …/account-export → a JSON copy of the caller's personal data (RLS-scoped, `asUser`)
//   POST …/account-delete → permanently erase the caller's account and all their data
//
// Deletion runs on the privileged connection (NOT `asUser`) so it can remove the canonical identity
// in `auth.users`; the schema's `on delete cascade` from auth.users then erases public.users and,
// through it, the caller's machines, personal + owned-team configs, owned teams, and memberships.
// This is the erasure path the schema was designed around (see supabase/migrations/0002_schema.sql).

import type { DeviceAuthConfig, Sql } from "../../lib/device.ts";
import { authenticate, json, SECURITY_HEADERS } from "../../lib/http.ts";
import { asUser } from "../../lib/rls.ts";

export interface AccountDeps {
  sql: Sql;
  cfg: DeviceAuthConfig;
  now?: () => Date;
}

/**
 * GET …/account-export → the caller's personal data as a downloadable JSON document. Every query
 * runs inside `asUser`, so RLS scopes rows to the authenticated user (profile, machines, teams they
 * own or belong to, and their personal config versions).
 */
export function createAccountExportHandler(deps: AccountDeps): (req: Request) => Promise<Response> {
  const now = deps.now ?? (() => new Date());
  return async (req) => {
    if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);
    const userId = await authenticate(req, deps.cfg.jwtSecret, now());
    if (!userId) return json({ error: "unauthorized" }, 401);

    const data = await asUser(deps.sql, userId, async (tx) => {
      const [profile] = await tx`select id, email, created_at from public.users`;
      const machines = await tx`
        select name, last_seen_at, created_at from public.machines order by created_at`;
      const teams = await tx`
        select id, name, owner_id, created_at from public.teams order by created_at`;
      const configs = await tx`
        select id, team_id, version, config, created_at
        from public.configs where owner_id = ${userId} order by created_at`;
      return { profile: profile ?? null, machines, teams, configs };
    });

    const body = JSON.stringify(
      { exported_at: now().toISOString(), user_id: userId, ...data },
      null,
      2,
    );
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "application/json",
        "content-disposition": 'attachment; filename="mcpfold-account-export.json"',
        ...SECURITY_HEADERS,
      },
    });
  };
}

/**
 * POST …/account-delete → permanently erase the caller's account. Deletes the `auth.users` row on
 * the privileged connection; FK `on delete cascade` removes the public profile and everything that
 * references it. Idempotent: a second call (row already gone) returns `{ deleted: false }` with 200.
 */
export function createAccountDeleteHandler(deps: AccountDeps): (req: Request) => Promise<Response> {
  const now = deps.now ?? (() => new Date());
  return async (req) => {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const userId = await authenticate(req, deps.cfg.jwtSecret, now());
    if (!userId) return json({ error: "unauthorized" }, 401);

    const result = await deps.sql`delete from auth.users where id = ${userId}`;
    return json({ deleted: result.count > 0 });
  };
}
