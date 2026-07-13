#!/usr/bin/env node
/**
 * A minimal, dependency-free stdio MCP server fixture for the S24.4 activation-gate e2e.
 *
 * It speaks just enough of the protocol to be curated: `initialize`, then `tools/list` returning a
 * FIXED surface of three tools (alpha, beta, gamma). The activation gate curates it to an allow-list
 * of two, so the client-visible `tools/list` proves the proxy actually filtered. Line-delimited
 * JSON-RPC on stdin/stdout; stderr is inherited for debugging. Exits when stdin closes.
 */
import { createInterface } from 'node:readline';

const TOOLS = [
  { name: 'alpha', description: 'first tool', inputSchema: { type: 'object', properties: {} } },
  { name: 'beta', description: 'second tool', inputSchema: { type: 'object', properties: {} } },
  { name: 'gamma', description: 'third tool', inputSchema: { type: 'object', properties: {} } },
];

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

const rl = createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    return; // ignore torn/non-JSON lines
  }
  // Notifications carry no id and expect no response.
  if (msg.id === undefined || msg.id === null) return;

  if (msg.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        protocolVersion: '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'curated-fixture', version: '0.0.0' },
      },
    });
    return;
  }
  if (msg.method === 'tools/list') {
    send({ jsonrpc: '2.0', id: msg.id, result: { tools: TOOLS } });
    return;
  }
  send({
    jsonrpc: '2.0',
    id: msg.id,
    error: { code: -32601, message: `method not found: ${msg.method}` },
  });
});
rl.on('close', () => process.exit(0));
