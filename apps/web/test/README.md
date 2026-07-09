# Web console e2e (Playwright)

These specs drive the web console (`@mcpfold/web`) with Playwright against a Vite dev server
started in **mock mode** (`VITE_E2E=1`). In mock mode the app swaps three seams for in-memory
fakes so the flows are deterministic and need no live backend:

- `src/auth/authClient.ts` → mock auth (no Supabase / OAuth round-trip)
- `src/api/cloud.ts` → in-memory `CloudApi` (config versions, machines)
- `src/teams/teamsApi.ts` → in-memory `TeamsApi`

## What these tests DO cover

- Client-side routing and auth gating: unauthenticated users are redirected, authenticated users
  reach gated routes.
- Component rendering and interaction across the console (editor, directory, machines, profiles,
  teams, security) in a real browser (Chromium).
- Browser rendering and dev-server / path assumptions **cross-OS** — the job runs on both
  `ubuntu-latest` and `windows-latest` (S20.4), so a Linux-only path or rendering assumption is
  caught rather than shipping silently.

## What mock mode does NOT cover (explicit boundaries)

Because the auth, cloud, and teams seams are mocked, these specs **do not** exercise:

- **Real Supabase auth** — the OAuth / device-code sign-in, token issuance, refresh, and session
  persistence are stubbed. The real flow is covered by the CLI cloud tests and manual verification.
- **Row-level-security (RLS) enforcement** — cross-tenant isolation and non-member denial are
  enforced by Postgres RLS on the server, not by the in-memory mocks. The mocks return only the
  current user's data by construction, so an RLS regression would NOT fail these specs. RLS is
  covered server-side (S6.2 / S6.3) and in the threat model.
- **Real network/API contracts** — request/response shapes against the live edge functions, error
  handling for 4xx/5xx, and latency/timeout behaviour are not exercised here.

Treat a green run as "the SPA behaves correctly given a well-behaved backend," not as proof the
backend contract holds. Backend correctness lives in the CLI cloud tests and the server suite.

## Flake policy

The CI matrix uses `fail-fast: false` so a flake on one OS never cancels the other. A spec that
proves genuinely flaky is quarantined (`test.fixme` / skipped) with a linked tracking issue rather
than left to redden the matrix; it is re-enabled once the root cause is fixed. Prefer
web-first assertions (`expect(locator).toBeVisible()`) and explicit waits over fixed timeouts to
keep specs deterministic.

## Running locally

```bash
pnpm --filter @mcpfold/core build          # the dev server imports @mcpfold/core
pnpm --filter @mcpfold/web exec playwright install chromium
pnpm --filter @mcpfold/web e2e
```
