# Agent notes — cross-cutting decisions

Append-only record of decisions that span more than one story, so later iterations stay
consistent. Newest at the bottom.

## Branching (this session)

- The PRD's `loop_protocol` prescribes one branch per story (`story/<id>-<slug>`). In the
  current hosted session all work develops on the designated feature branch
  `claude/mcpfold-stories-buildout-6omx34`, committing **once per story** with a
  Conventional Commit that references the story id in the subject/body. This preserves the
  per-story traceability the protocol wants while honoring the session's single-branch
  push target. A future contributor following `ralph/PROMPT.md` outside this session
  should use per-story branches as written.

## Path conventions (adapters)

- `packages/core` is path-free. **All** OS path resolution lives in adapters
  (`packages/adapters`) and is injected. Every path-resolving function must have explicit
  `win32` / `darwin` / `linux` behavior and a test per platform. Never assume `~` expands —
  home-dir expansion is passed in, not read from the environment inside core.

## Fixture format (adapters)

- Adapter tests are fixture-driven snapshots: a canonical input → rendered native file
  (snapshot) and native file → canonical partial (round-trip). Fixtures live under
  `packages/adapters/**/fixtures/` and are excluded from lint/prettier/build.

## Secret handling

- Secret **values** never land in git-tracked files. Config carries secret **references**
  (`${provider:path}`) only. The `inline` strategy refuses to run unless the target file
  is gitignored and prints a loud warning. `pin` rewrites `@latest` at fold time.

## Determinism

- Rendered output is deterministic: stable key ordering, trailing newline, `\n` line
  endings regardless of host OS. This is what makes `sync --check` and snapshot tests
  meaningful (see S0.8).
