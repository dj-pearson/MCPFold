---
'@mcpfold/core': patch
---

Fix org-policy package matching and a glob ReDoS. Package rules matched with a raw `startsWith`, so a
rule for `@modelcontextprotocol/server-git` also matched `@modelcontextprotocol/server-github` and
`foo` matched `foo-bar` — over/under-applying a deny-wins control. Matching now requires a name
boundary (exact versionless-spec equality, or the next character is `/` or `@`). And a `url` glob
containing `**` compiled to adjacent `.*.*`, which backtracks catastrophically against a long URL;
runs of `*` are now collapsed before compiling so glob evaluation is linear.
