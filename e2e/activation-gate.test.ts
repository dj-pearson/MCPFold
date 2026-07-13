import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cursorAdapter, type OsContext } from '@mcpfold/adapters';
import {
  connectProxy,
  streamTransport,
  type JsonRpcId,
  type JsonRpcMessage,
  type MessageTransport,
} from '@mcpfold/proxy';
import { runInit, runRun, runSync, type ProxySpawner, type TrustGate } from 'mcpfold';

/**
 * S24.4 — end-to-end activation gate. Every link of the token-savings chain had a test, but nothing
 * tested the CHAIN: init → curate a server → sync → launch the folded entry exactly as a client would
 * → the client sees ONLY the curated tools. This test walks that whole path in one flow and names each
 * broken link (FOLD / LAUNCH / FILTER) distinctly, so a regression anywhere fails CI on every OS.
 *
 * It runs against the real source (e2e vitest aliases `mcpfold` → the CLI source, so no built dist is
 * needed in the CI test phase) and spawns a REAL stdio MCP server child through the REAL proxy — the
 * only injected seam is the client transport, so we can drive a genuine MCP handshake in-process.
 */

const FIXTURE = fileURLToPath(new URL('./fixtures/curated-server.mjs', import.meta.url));

const trustAll: TrustGate = {
  status: () => 'trusted',
  isTrusted: () => true,
  approve: () => {},
  trustedTools: () => undefined,
  toolsStatus: () => 'unpinned',
  approveTools: () => {},
};

/**
 * A client-side transport we fully control: `request()` injects a client→server message and resolves
 * with the matching response the proxy forwards back. This is the one seam vs. production (which wires
 * the client transport to process.stdin/stdout) — everything server-side is the real proxy + real child.
 */
function controllableClient(): {
  transport: MessageTransport;
  request: (message: JsonRpcMessage) => Promise<JsonRpcMessage>;
} {
  let deliverToServer: (m: JsonRpcMessage) => void = () => {};
  const pending = new Map<JsonRpcId, (m: JsonRpcMessage) => void>();
  const transport: MessageTransport = {
    onMessage(handler) {
      deliverToServer = handler;
    },
    send(message) {
      if (message.id != null && pending.has(message.id)) {
        pending.get(message.id)!(message);
        pending.delete(message.id);
      }
    },
    onClose() {},
    close() {},
  };
  const request = (message: JsonRpcMessage): Promise<JsonRpcMessage> =>
    new Promise((res) => {
      if (message.id != null) pending.set(message.id, res);
      deliverToServer(message);
    });
  return { transport, request };
}

let cwd: string;
let home: string;
let ctx: OsContext;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'mcpfold-e2e-gate-cwd-'));
  home = mkdtempSync(join(tmpdir(), 'mcpfold-e2e-gate-home-'));
  ctx = {
    platform: process.platform,
    home,
    env: { APPDATA: join(home, 'AppData', 'Roaming'), XDG_CONFIG_HOME: join(home, '.config') },
  };
});
afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

describe('activation gate: init → sync → launch → filtered tools/list (S24.4)', () => {
  it('a fresh user reaches a client-visible tools/list containing exactly the allow-list', async () => {
    // 1. Scaffold a fresh project, then configure a secretless stdio server curated to 2 of its 3 tools.
    runInit({ cwd });
    const config = {
      version: 1,
      servers: {
        echo: {
          transport: 'stdio',
          command: process.execPath,
          args: [FIXTURE],
          tags: ['work'],
          tools: { mode: 'allow', list: ['alpha', 'beta'] },
        },
      },
      profiles: { 'cursor-user': { client: 'cursor', scope: 'user', include: ['work'] } },
    };
    writeFileSync(join(cwd, 'mcp.config.jsonc'), JSON.stringify(config, null, 2));

    // 2. FOLD — sync renders the client entry as the self-locating proxy shim, not the direct command.
    await runSync({ cwd, osContext: ctx });
    const written = JSON.parse(readFileSync(cursorAdapter.resolvePath('user', undefined, ctx), 'utf8'));
    const entry = written.mcpServers.echo;
    expect(entry, 'FOLD: the curated server did not fold to the `mcpfold run` proxy shim').toEqual({
      command: 'mcpfold',
      args: ['run', 'echo', '--cwd', resolve(cwd)],
    });

    // 3. LAUNCH — spawn the rendered entry's semantics verbatim (name + embedded --cwd) from a cwd that
    //    is NOT the config directory, exactly like a GUI client. A real child MCP server is launched
    //    through the real proxy; the injected client transport lets us complete a real MCP handshake.
    const name: string = entry.args[1];
    const embeddedCwd: string = entry.args[entry.args.indexOf('--cwd') + 1];
    expect(resolve(process.cwd())).not.toBe(resolve(cwd)); // the launch cwd really differs from the config's

    let client: ReturnType<typeof controllableClient> | undefined;
    let endChild: () => void = () => {};
    let exitCode: number | undefined;
    const clientReady = new Promise<void>((ready) => {
      const proxySpawnFn: ProxySpawner = (command, args, env, tools) =>
        new Promise<number>((resolveExit) => {
          const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'inherit'], env });
          const serverTransport = streamTransport(child.stdout!, child.stdin!);
          const c = controllableClient();
          connectProxy(c.transport, serverTransport, { tools });
          client = c;
          endChild = () => child.stdin!.end(); // graceful: the fixture exits 0 on stdin close
          child.on('error', () => resolveExit(127));
          child.on('exit', (code, signal) => resolveExit(code ?? (signal ? 1 : 0)));
          ready();
        });
      // Kick off the launch; it resolves when the child exits (after we end its stdin below).
      void runRun({ cwd: embeddedCwd, name, providers: [], proxySpawnFn, trust: trustAll }).then(
        (code) => {
          exitCode = code;
        },
      );
    });

    await clientReady; // reaching here means the proxy spawned the server — the launch link held.
    expect(client, 'LAUNCH: the folded entry never routed through the proxy').toBeDefined();

    const initRes = await client!.request({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'e2e', version: '0' } },
    });
    expect(initRes.result, 'LAUNCH: the launched server did not complete an MCP initialize').toBeDefined();

    // 4. FILTER — the client-visible tools/list is exactly the allow-list: nothing more (gamma dropped),
    //    nothing less. This is the whole promise — the client's context only ever sees curated tools.
    const listRes = await client!.request({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    const toolNames = ((listRes.result as { tools: { name: string }[] }).tools ?? [])
      .map((t) => t.name)
      .sort();
    expect(
      toolNames,
      'FILTER: the client saw a tools/list that is not exactly the curated allow-list',
    ).toEqual(['alpha', 'beta']);

    // Tear down: end the child's stdin so it exits cleanly and the launch promise resolves.
    endChild();
    // Give the child a tick to exit and the run promise to settle.
    await new Promise((r) => setTimeout(r, 100));
    expect(exitCode, 'the launched entry did not exit cleanly after the session ended').toBe(0);
  });
});
