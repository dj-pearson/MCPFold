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

Provider: **Stripe** (a subscription priced per active team member). It is **not yet integrated** —
[`services/edge/lib/entitlements.ts`](../services/edge/lib/entitlements.ts) defines the
`EntitlementChecker` interface the [team billing gate (S7.6)](./team-config-as-code.md) will call
once Stripe is wired; until then the default checker gates nothing.

## Licensing boundaries

- **MIT:** the CLI, adapters, core, proxy, and the self-hostable cloud (schema + edge service).
- **Commercial:** the _hosted_ mcpfold.com cloud service (the convenience of us running it, plus
  Team/Enterprise features). The code is open; the hosting + paid features are the commercial layer.

See [Governance](./governance.md) for how these decisions are made.
