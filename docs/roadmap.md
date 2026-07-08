# Roadmap

A living, public view of where mcpfold is headed. Priorities are driven by the
[opt-in adoption signal](./telemetry.md), open issues, and the [adapter coverage](./coverage.md)
gaps. Nothing here is a dated commitment.

## Shipped

- **Local core:** canonical `mcp.config.jsonc`, 8 client adapters, secret references,
  `sync`/`diff`/`doctor`/`status`/`test`/`restore`, watch mode, guided onboarding, completions.
- **Distribution:** npm, Homebrew, `curl | sh`, Scoop/winget, standalone binaries, update notifier.
- **Team-without-a-backend:** repo config-as-code drift gate + the packaged GitHub Action.
- **Cloud:** self-hosted Supabase + edge sync, device-code login, refresh-token rotation, the web
  console (visual editor, sync dashboard, team console + audit trail).
- **Site:** marketing site, interactive benchmark, install page, unified docs + search, server
  directory.

## Next

- **Pricing + billing:** wire Stripe to the [entitlement checker](./pricing-model.md#billing) and
  ship the pricing page (S13.6).
- **Adapter breadth:** the next tranche from the [coverage roadmap](./coverage.md#roadmap-prioritization)
  (Continue, Goose, Warp, JetBrains AI, Cody, Roo Code).
- **Compat automation:** act on the weekly compat-harness drift reports
  ([`packages/adapters/compat`](https://github.com/dj-pearson/MCPFold/blob/main/packages/adapters/compat/README.md)).
- **Launch collateral:** the scripted demo GIF render, blog/changelog.

## Exploring

- Deeper editor integrations, richer proxy tool-curation policies, org-wide policy enforcement.

Have a request? Open an issue — adapter requests use the `adapter-request` label. See
[Governance](./governance.md) for how proposals become work.
