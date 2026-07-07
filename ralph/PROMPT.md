# Ralph loop driver — mcpfold

You are an autonomous build loop. Each iteration you complete **one** story from
[`../prd.json`](../prd.json), verify it, and record it. This file is the entry point;
everything you need to bootstrap is on disk (`prd.json`, `ralph/PROGRESS.md`,
`ralph/AGENT_NOTES.md`).

## Each iteration (from `prd.json.loop_protocol.iteration_steps`)

1. **Read** the tail of [`PROGRESS.md`](./PROGRESS.md) and all of `prd.json`. Pick the
   highest-priority story (`p0` > `p1` > `p2` > `p3`) whose status is `todo` (or an
   `in_progress` story you own) and whose **every** dependency id is `done`. Break ties
   by ascending `order`.
2. If **no** story is eligible, stop and report which stories are blocked and by what.
3. Create/checkout branch `story/<id>-<slug>` (in this session we develop on the
   designated feature branch instead — see AGENT_NOTES). Set the story's status to
   `in_progress` and append a start line to `PROGRESS.md`.
4. Implement **only** that story. Touch only files consistent with the story's
   `files_hint` unless the story genuinely requires more; note any deviation.
5. Write the tests named in the story's `tests` first (or alongside). They must fail
   before implementation and pass after.
6. Run **`verify_all`** (`pnpm lint && pnpm typecheck && pnpm test && pnpm -r build`).
   Do not proceed until lint, typecheck, tests, and build all pass.
7. Verify every item in `acceptance_criteria` and `definition_of_done` is objectively
   satisfied. If a criterion is untestable as written, add a test that makes it testable.
8. Commit with a Conventional Commit referencing `<id>`. Open/refresh the PR. When CI is
   green, set the story's status to `done` and append a completion line (id, commit sha,
   summary, follow-ups) to `PROGRESS.md`.
9. If blocked (ambiguity, external dependency, failing infra), set status `blocked`,
   write the reason in `PROGRESS.md`, and move to the next eligible story rather than
   guessing.
10. Never mark `done` with a red suite, a skipped acceptance criterion, or a `TODO` left
    in shipped code.

## Global definition of done (`prd.json.loop_protocol.global_definition_of_done`)

- All `acceptance_criteria` demonstrably met.
- Tests added and the full suite green on the CI matrix (ubuntu/macos/windows where the
  story is platform-relevant).
- Typecheck + lint clean; **core purity** rule not violated.
- Public API changes reflected in exported types and the JSON schema if the canonical
  format changed.
- No secret values committed; no unpinned `@latest` introduced where `pin` semantics apply.
- `PROGRESS.md` updated.

## Running a loop

A bare shell loop (each invocation is a fresh, resumable iteration that reads state from
disk):

```bash
while :; do
  claude -p ralph/PROMPT.md || break
done
```

Because all state lives in `prd.json` (story `status`) and `PROGRESS.md` (append-only
log), a fresh loop can always identify the next story from files alone and never redoes
completed work.
