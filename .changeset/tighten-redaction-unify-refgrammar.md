---
'mcpfold': patch
'@mcpfold/core': patch
---

Tighten redaction and unify the secret-ref grammar. The output redactor and the ref-only push guard
now share a single source of known token prefixes, so both cover GitHub fine-grained PATs
(`github_pat_`) and Stripe secret keys (`sk_live_`/`sk_test_`) and can't drift apart again. And the
whole-string and embedded secret-ref matchers now use the same `[^}]+` path class, so an ambiguous ref
like `${env:a}b}` is parsed consistently (path `a`, not a greedy `a}b`).
