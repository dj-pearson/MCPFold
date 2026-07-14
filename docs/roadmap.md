# Roadmap

A living, public view of where mcpfold is headed. Priorities are driven by the
[opt-in adoption signal](./telemetry.md), open issues, and the [adapter coverage](./coverage.md)
gaps. Nothing here is a dated commitment.

## Shipped

- **Local core:** canonical `mcp.config.jsonc`, 18 client adapters, secret references,
  `sync`/`diff`/`doctor`/`status`/`test`/`restore`, guided repair (`doctor --fix`, `secret extract`,
  `explain`), watch mode, guided onboarding, completions.
- **Distribution:** npm, Homebrew, `curl | sh`, Scoop/winget, standalone binaries, update notifier.
- **Team-without-a-backend:** repo config-as-code drift gate + the packaged GitHub Action.
- **Cloud:** self-hosted Supabase + edge sync, device-code login, refresh-token rotation, the web
  console (visual editor, sync dashboard, team console + audit trail).
- **Pricing + billing:** Stripe Checkout/Portal with WebCrypto webhook-signature verification wired
  to the [entitlement checker](./pricing-model.md#billing), plus the public pricing page (S20.2).
- **Site:** marketing site, interactive benchmark, install page, unified docs + search, server
  directory.

## Next

- **Adapter breadth:** the next candidates from the [coverage roadmap](./coverage.md#roadmap-prioritization)
  — the 18 shipped adapters already cover the mainstream clients; new requests use the `adapter-request` label.
- **Compat automation:** act on the weekly compat-harness drift reports
  ([`packages/adapters/compat`](https://github.com/dj-pearson/MCPFold/blob/main/packages/adapters/compat/README.md)).
- **Launch collateral:** the scripted demo GIF render, blog/changelog.

## Exploring

- Deeper editor integrations, richer proxy tool-curation policies, org-wide policy enforcement.

## MCP 2026-07-28 stateless-core readiness (S17.6)

The 2026-07-28 protocol revision (release candidate now; final expected ~July 28, 2026) is
breaking. mcpfold's proxy sits mid-conversation and must speak both worlds during the transition.
This checklist maps each RC changelog item to how mcpfold handles it. Revisit when the final ships.

| RC changelog item                                     | mcpfold status | How                                                            |
| ----------------------------------------------------- | -------------- | -------------------------------------------------------------- |
| Removes `initialize`                                  | supported      | Handshake `mode: 'stateless'` probes via `server/discover`     |
| Removes `Mcp-Session-Id`; version/identity in `_meta` | passthrough    | Proxy never rewrites `_meta`; only the tool array of a listing |
| Mandatory `server/discover`                           | supported      | Proxy curates its response exactly like `tools/list`           |
| MRTR (`resultType: 'input_required'` + retry)         | passthrough    | Forwarded verbatim; not a listing, so never rewritten          |
| Tasks moved to an official extension                  | passthrough    | Forwarded verbatim                                             |
| Deprecates HTTP+SSE (12-month lifecycle)              | tracked        | Both transports still work; watch the sunset window            |
| Deprecates Roots / Sampling / Logging                 | **non-goal**   | We build no features on these; forwarded verbatim if present   |

Enforcement is mode-agnostic: a denied `tools/call` is rejected whether or not a session exists,
because the call keeps its `params.name` shape. Dual-mode tests
([`packages/proxy/test/stateless.test.ts`](https://github.com/dj-pearson/MCPFold/blob/main/packages/proxy/test/stateless.test.ts))
prove identical filtering/enforcement for a 2025-11-25 session and a stateless-core session of the
same server. The `_meta` version key is provisional until the final spec fixes it.

Have a request? Open an issue — adapter requests use the `adapter-request` label. See
[Governance](./governance.md) for how proposals become work.
