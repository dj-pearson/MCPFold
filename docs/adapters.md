# Add a new client in one PR

A client adapter is one small module that renders the canonical
[`mcp.config.jsonc`](./config-format.md) to a client's native format and parses it back.
Adding a client touches ~3 files and no engine code.

## 1. Scaffold

```bash
pnpm --filter mcpfold build
node packages/cli/dist/bin.js scaffold-adapter <client>
```

This generates `packages/adapters/src/<client>.ts`, a test, and a fixture skeleton, and
prints the checklist below.

## 2. Register the client id

- Add `'<client>'` to `CLIENT_IDS` in `packages/core/src/schema.ts`.
- Add `<client>Adapter` to `ALL_ADAPTERS` in `packages/adapters/src/all.ts`.

## 3. Implement the three methods

```ts
interface ClientAdapter {
  id: ClientId;
  secretStrategy: 'inline' | 'native-input' | 'shim';
  needsRestart: boolean;
  resolvePath(scope, projectPath?, ctx?): string; // per-OS! use paths.ts helpers
  render(servers, ctx?): RenderedFile; // via serialize() — deterministic
  parse(contents): Partial<Config>; // powers import + drift
}
```

- **Root key** — most clients use `mcpServers`; VS Code uses `servers`, Zed uses
  `context_servers`. If yours is `mcpServers`-shaped, reuse `createMcpServersAdapter`.
- **Paths** — every branch (`win32`/`darwin`/`linux`) is explicit and tested. Use
  `expandHome`, `userConfigDir`, `joinFor` from `paths.ts`; never assume `~` expands.
- **Secrets** — pick a `secretStrategy`: `shim` (default; launch becomes `mcpfold run
<name>`, no token on disk), `native-input` (emit the client's own indirection), or
  `inline` (last resort, gitignored only).

## 4. Fixtures + tests

```bash
pnpm --filter @mcpfold/adapters test -u   # write the golden fixture, then review it
pnpm verify_all
```

The cross-adapter matrix (`packages/adapters/test/matrix.test.ts`) folds one canonical
fixture through every adapter and round-trips it — your adapter joins it automatically once
registered.
