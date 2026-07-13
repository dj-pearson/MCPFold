/**
 * Token estimation — the committed benchmark method (S5.4 / S24.6).
 *
 * mcpfold's headline "token tax" figure is the tokenizer-independent **1 token ≈ 4 characters** of
 * serialized JSON — the widely cited GPT rule of thumb. It is deliberately model-agnostic so the same
 * number holds whatever tokenizer a client actually uses, and it needs no tokenizer dependency in the
 * shipped build. The `bench/` suite additionally reports exact per-model tokenizer counts, but every
 * user-facing estimate (discovery snapshots, savings reports) uses THIS function so the numbers a user
 * sees match the published benchmark method exactly.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Estimate the token cost of a single MCP tool definition: the tokens its serialized JSON contributes
 * to a `tools/list` response, i.e. what it costs the model's context every request. `tool` is any
 * JSON-serializable tool object (name + description + inputSchema); we measure the whole thing because
 * the model pays for all of it.
 */
export function estimateToolTokens(tool: unknown): number {
  return estimateTokens(JSON.stringify(tool));
}
