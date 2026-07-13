---
'mcpfold': minor
---

Curation intelligence, end to end (E24) plus site/growth work:

- **Live tool-surface discovery** — `mcpfold inspect [server]` introspects a server's real tools and
  caches per-server tool counts + token estimates.
- **Day-zero curation** — `mcpfold curate <server> --tools <list>` (or an interactive picker) writes an
  allow-list from the discovered surface, so a fresh user gets savings with no usage history.
- **Default-on local audit trail** — the proxy records tool-call names locally by default (opt out with
  `audit.enabled: false` or `MCPFOLD_NO_AUDIT`), so `mcpfold curate` has real usage on first run.
- **Honest savings** — `sync`/`status`/guided now show reductions measured from your own config, never a
  fixture; `status`/`doctor` surface where the audit log lives.
- **Detection** — `doctor`/`status` flag inactive, dropped, or absent curation, and allow-lists that
  predate new upstream tools (`mcpfold curate <server> --refresh` adds them with consent).
- **Remote-server curation** — a tools directive now filters remote (streamable-http/sse) servers too,
  by composing the proxy over the mcp-remote bridge; the self-locating shim finds the config from any cwd.
- Reconciled the VS Code curation surface with the real `curate --json` contract, added an end-to-end
  activation-gate e2e, token-calculator + comparison-page e2e, and web-funnel instrumentation.
