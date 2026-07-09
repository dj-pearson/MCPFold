# Pricing model

The rule: **the CLI and everything local is free forever and MIT-licensed. The hosted cloud is the
paid surface.** You can also self-host the entire cloud yourself at no cost — see
[Self-hosting](./self-hosting.md).

This page is the single source the [pricing page](https://mcpfold.com/pricing) renders
(`apps/site/src/pricing/tiers.ts`).

## Tiers

| Tier            | Price          | For                        | Key limits                               |
| --------------- | -------------- | -------------------------- | ---------------------------------------- |
| **Open source** | Free forever   | Everyone, entirely local   | None — full CLI, all adapters, self-host |
| **Cloud Free**  | $0             | One person across machines | 1 user · 3 machines · 30-day history     |
| **Team**        | $6 / user / mo | Teams standardizing MCP    | Roles, audit trail, 1-year history       |
| **Enterprise**  | Contact us     | Larger orgs                | SSO/SAML, self-host support, SLA         |

### Free forever (MIT)

The entire CLI: every adapter, the canonical config, secret references, `sync`/`diff`/`doctor`/
`status`/`test`/`restore`, watch mode, shell completions, the config-as-code drift gate + GitHub
Action, and the ability to **self-host the whole cloud**. No account required, no feature gating.

### Paid cloud

The hosted sync + team surface (E6/E7). Team, audit trail, roles, and per-machine revocation are the
paid capabilities. See [entitlements](../services/edge/lib/entitlements.ts) for the tier→capability
mapping.

## Billing

Provider: **Stripe** (a subscription per team). Billing is **wired** (S20.2):

- A team starts on the **free** tier. Its owner subscribes via **Stripe Checkout**
  (`POST …/billing/checkout`) and manages the subscription via the **Billing Portal**
  (`POST …/billing/portal`) — both surfaced in the Team console.
- A signature-verified, **idempotent** Stripe webhook (`POST …/billing/webhook`) maintains one
  row per team in `public.entitlements` (RLS-protected: a team's own members can read it; only the
  webhook writes it). The Stripe event id is recorded in `public.billing_events`, so a re-delivered
  event never double-applies.
- The edge [`EntitlementChecker`](../services/edge/lib/entitlements.ts) reads that state and
  resolves the tier, **failing closed to the free tier** on any missing/inactive/unknown state — it
  never grants a paid tier by default. Team endpoints enforce it server-side (e.g. inviting members
  returns `402` on the free tier).

The OSS CLI is **never** gated by any of this — gating applies only to the hosted cloud team
surface (see Licensing boundaries below). A regression test asserts the CLI imports no entitlement
code.

## Licensing boundaries

- **MIT:** the CLI, adapters, core, proxy, and the self-hostable cloud (schema + edge service).
- **Commercial:** the _hosted_ mcpfold.com cloud service (the convenience of us running it, plus
  Team/Enterprise features). The code is open; the hosting + paid features are the commercial layer.

See [Governance](./governance.md) for how these decisions are made.
