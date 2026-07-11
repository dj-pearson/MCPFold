---
'@mcpfold/core': patch
'mcpfold': patch
---

Wire package-integrity (SRI) verification end-to-end. A server's `integrity` hash now survives
resolution (`ResolvedServer` carries it), and the `--from-mcpb` install path verifies the fetched
bundle bytes against the declared hash using the shared SRI verifier, failing closed with a
supply-chain error on a mismatch or a malformed hash. Previously the verifier was never called, so the
control was decorative.
