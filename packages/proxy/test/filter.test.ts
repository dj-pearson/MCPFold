import { describe, expect, it } from 'vitest';
import type { ToolsDirective } from '@mcpfold/core';
import { compileDirective, filterTools, isToolAllowed } from '../src/filter.js';
import { connectProxy } from '../src/proxy.js';
import { MemoryTransport } from '../src/transport/memory.js';
import type { JsonRpcMessage } from '../src/jsonrpc.js';

const twentyTools = Array.from({ length: 20 }, (_, i) => ({
  name: `tool_${i}`,
  description: `does thing ${i}`,
  inputSchema: { type: 'object', properties: { a: { type: 'string' } } },
}));

describe('filterTools (S5.2)', () => {
  it('allow-mode keeps only listed tools, in order, schemas intact', () => {
    const directive: ToolsDirective = { mode: 'allow', list: ['tool_3', 'tool_1', 'tool_9'] };
    const result = filterTools(twentyTools, directive);
    // Order follows the source array, not the list.
    expect(result.map((t) => t.name)).toEqual(['tool_1', 'tool_3', 'tool_9']);
    // Schema of a survivor is untouched.
    expect(result[0]?.inputSchema).toEqual({
      type: 'object',
      properties: { a: { type: 'string' } },
    });
  });

  it('deny-mode removes listed tools', () => {
    const directive: ToolsDirective = { mode: 'deny', list: ['tool_0', 'tool_19'] };
    const result = filterTools(twentyTools, directive);
    expect(result).toHaveLength(18);
    expect(result.some((t) => t.name === 'tool_0')).toBe(false);
  });

  it('isToolAllowed reflects the mode', () => {
    expect(isToolAllowed('x', { mode: 'allow', list: ['x'] })).toBe(true);
    expect(isToolAllowed('y', { mode: 'allow', list: ['x'] })).toBe(false);
    expect(isToolAllowed('x', { mode: 'deny', list: ['x'] })).toBe(false);
  });

  // S22.12: matching is case/whitespace-normalized so a spelling variant can't slip past the filter.
  it('normalizes case and whitespace so a variant is treated per the policy', () => {
    const deny: ToolsDirective = { mode: 'deny', list: ['foo'] };
    expect(isToolAllowed('FOO', deny)).toBe(false);
    expect(isToolAllowed(' foo ', deny)).toBe(false);
    expect(isToolAllowed('Foo', deny)).toBe(false);
    const allow: ToolsDirective = { mode: 'allow', list: ['Foo'] };
    expect(isToolAllowed('foo', allow)).toBe(true);
    expect(isToolAllowed('bar', allow)).toBe(false);
  });

  // S22.24: the directive precompiles into a Set for O(1) membership, honoring mode + normalization.
  it('compileDirective gives O(1) Set-based membership consistent with isToolAllowed', () => {
    const deny = compileDirective({ mode: 'deny', list: ['a', 'B'] });
    expect(deny.allows('a')).toBe(false);
    expect(deny.allows('b')).toBe(false); // normalized
    expect(deny.allows('c')).toBe(true);
    const allow = compileDirective({ mode: 'allow', list: ['x'] });
    expect(allow.allows('X')).toBe(true);
    expect(allow.allows('y')).toBe(false);
  });
});

describe('connectProxy — filtering on tools/list (S5.2)', () => {
  it('cuts 20 tools down to the 3 allowed (count assertion)', () => {
    const client = new MemoryTransport();
    const server = new MemoryTransport();
    connectProxy(client, server, {
      tools: { mode: 'allow', list: ['tool_1', 'tool_2', 'tool_3'] },
    });

    client.receive({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    server.receive({ jsonrpc: '2.0', id: 1, result: { tools: twentyTools } });

    const forwarded = client.sent[0]?.result as { tools: { name: string }[] };
    expect(forwarded.tools).toHaveLength(3);
    expect(forwarded.tools.map((t) => t.name)).toEqual(['tool_1', 'tool_2', 'tool_3']);
  });

  it('does not filter when no directive is present', () => {
    const client = new MemoryTransport();
    const server = new MemoryTransport();
    connectProxy(client, server);
    client.receive({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    server.receive({ jsonrpc: '2.0', id: 1, result: { tools: twentyTools } });
    expect((client.sent[0]?.result as { tools: unknown[] }).tools).toHaveLength(20);
  });

  it('rejects a tools/call to a filtered-out tool with a clear MCP error (not forwarded)', () => {
    const client = new MemoryTransport();
    const server = new MemoryTransport();
    connectProxy(client, server, { tools: { mode: 'allow', list: ['tool_1'] } });

    client.receive({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'tool_9' } });
    // Rejected straight back to the client; never sent to the server.
    expect(server.sent).toHaveLength(0);
    const reply = client.sent[0] as JsonRpcMessage;
    expect(reply.id).toBe(5);
    expect(reply.error?.code).toBe(-32601);
    expect(reply.error?.message).toContain('tool_9');
  });

  it('passes a tools/call to an allowed tool straight through', () => {
    const client = new MemoryTransport();
    const server = new MemoryTransport();
    connectProxy(client, server, { tools: { mode: 'allow', list: ['tool_1'] } });
    const call: JsonRpcMessage = {
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: { name: 'tool_1' },
    };
    client.receive(call);
    expect(server.sent[0]).toEqual(call);
  });
});
