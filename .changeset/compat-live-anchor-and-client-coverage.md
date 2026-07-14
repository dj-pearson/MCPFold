---
'mcpfold': patch
---

Reliability + accuracy fixes across the compat harness and the docs surface.

- **Compat harness (#77):** the weekly live upstream-drift check no longer reports a false `divergent`
  when a client's docs simply move. It now anchors on a stable config-doc token (the config filename)
  and degrades an unrecognized/redirected/anti-bot page to `skipped` instead of a false failure, while a
  genuine root-key rename on the real doc still reports `divergent`. Refreshed Cursor's moved docs URL.
- **Docs:** the README "Supported clients" list and the marketing-site hero now reflect all 18 supported
  clients (previously advertised 6), sourced from the canonical client list so the count can't drift
  again; the public roadmap moves shipped work (Stripe billing, the Continue/Goose/Warp/JetBrains/Roo
  Code adapters, guided repair) out of "Next".

No change to the CLI's runtime behavior or output.
