import { spawn } from 'node:child_process';
import { UsageError, type ResolvedServer } from '@mcpfold/core';
import { streamTransport, type MessageTransport } from '@mcpfold/proxy';
import { resolveCommand } from './spawn.js';

/**
 * The real MCP transport for a resolved server — a spawned stdio child or streamable-HTTP JSON-RPC
 * over POST. Shared by `mcpfold test` (S10.4) and the `trust --tools` probe (S18.1) so both open a
 * live session the same way. Secrets are only ever in `server.env` / `server.auth` in memory.
 */
export function realTransport(server: ResolvedServer): MessageTransport {
  if (server.transport === 'stdio') {
    if (!server.command) throw new UsageError(`Server "${server.name}" has no launch command.`);
    const r = resolveCommand(server.command, server.args ?? []);
    const child = spawn(r.command, r.args, {
      stdio: ['pipe', 'pipe', 'ignore'],
      env: { ...process.env, ...server.env },
      windowsVerbatimArguments: r.windowsVerbatimArguments,
    });
    let spawnError: string | undefined;
    child.on('error', (e) => {
      spawnError = e.message;
    });
    const transport = streamTransport(child.stdout!, child.stdin!);
    return {
      onMessage: (h) => transport.onMessage(h),
      send: (m) => {
        if (spawnError) throw new Error(spawnError);
        transport.send(m);
      },
      close: () => {
        transport.close();
        child.kill();
      },
    };
  }
  // http / sse: streamable-HTTP JSON-RPC over POST.
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    ...(server.auth?.headers ?? {}),
  };
  if (server.auth?.token) headers.authorization = `Bearer ${server.auth.token}`;
  let onMsg: Parameters<MessageTransport['onMessage']>[0] | undefined;
  return {
    onMessage: (h) => {
      onMsg = h;
    },
    // Once the handshake negotiates a version, echo it as MCP-Protocol-Version on every subsequent
    // request (required since MCP 2025-06-18). Mutates the shared headers used by send().
    setProtocolVersion: (version) => {
      headers['mcp-protocol-version'] = version;
    },
    send: (msg) => {
      if (msg.id == null) return; // notification: fire-and-forget
      fetch(server.url!, { method: 'POST', headers, body: JSON.stringify(msg) })
        .then(async (res) => {
          if (!res.ok) {
            onMsg?.({
              jsonrpc: '2.0',
              id: msg.id,
              error: { code: res.status, message: `HTTP ${res.status}` },
            });
            return;
          }
          const text = await res.text();
          const jsonLine = text.startsWith('data:')
            ? text
                .split('\n')
                .find((l) => l.startsWith('data:'))
                ?.slice(5)
                .trim()
            : text;
          const parsed = jsonLine ? JSON.parse(jsonLine) : null;
          if (parsed) onMsg?.(parsed);
        })
        .catch((e) =>
          onMsg?.({
            jsonrpc: '2.0',
            id: msg.id,
            error: { code: -1, message: String(e?.message ?? e) },
          }),
        );
    },
    close: () => {},
  };
}
