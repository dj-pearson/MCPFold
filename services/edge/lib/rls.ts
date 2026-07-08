// Run a unit of work AS the authenticated user, so the S6.2 row-level-security policies are
// genuinely enforced (never bypassed). Inside the transaction we set the `authenticated` role
// and the `app.current_user_id` GUC that `auth.uid()` reads — the same mechanism the RLS
// tests use. On the managed Supabase runtime the equivalent is `request.jwt.claims`; the
// self-hosted side service uses this GUC path against Postgres directly.

import type { Sql } from "./device.ts";

export function asUser<T>(
  sql: Sql,
  userId: string,
  fn: (tx: Sql) => Promise<T>,
): Promise<T> {
  return sql.begin(async (tx) => {
    // set_config(..., true) = LOCAL to this transaction. Set the user id before switching
    // roles so it is applied by the privileged connection role.
    await tx`select set_config('app.current_user_id', ${userId}, true)`;
    await tx`set local role authenticated`;
    return await fn(tx as unknown as Sql);
  }) as Promise<T>;
}
