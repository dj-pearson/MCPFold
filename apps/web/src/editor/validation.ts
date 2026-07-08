import { isSecretRef, type ServerConfig, ServerSchema, type Transport } from '@mcpfold/core';

/**
 * Live validation for the editor (S7.2) — runs the SAME `ServerSchema` the CLI uses, so the web
 * surfaces identical errors. Tokens must be `${provider:path}` references (the schema enforces it;
 * we add a friendlier message). Transport-aware: stdio needs a command, http/sse a url.
 */

export interface ServerDraft {
  name: string;
  transport: Transport;
  command: string;
  args: string;
  url: string;
  token: string;
  tags: string;
}

export const emptyDraft: ServerDraft = {
  name: '',
  transport: 'stdio',
  command: '',
  args: '',
  url: '',
  token: '',
  tags: '',
};

export interface DraftValidation {
  errors: Partial<Record<keyof ServerDraft, string>>;
  server: ServerConfig | null;
}

/** Build a canonical server from the draft and validate it via the shared schema. */
export function validateDraft(draft: ServerDraft, existingNames: string[]): DraftValidation {
  const errors: Partial<Record<keyof ServerDraft, string>> = {};

  if (!draft.name.trim()) errors.name = 'Name is required.';
  else if (existingNames.includes(draft.name.trim()))
    errors.name = 'A server with this name already exists.';

  if (draft.token && !isSecretRef(draft.token)) {
    errors.token = 'Use a ${provider:path} reference (e.g. ${env:GITHUB_PAT}), never a raw token.';
  }

  const server: Record<string, unknown> = {
    transport: draft.transport,
    tags: draft.tags
      ? draft.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      : [],
  };
  if (draft.transport === 'stdio') {
    if (draft.command.trim()) server.command = draft.command.trim();
    if (draft.args.trim()) server.args = draft.args.trim().split(/\s+/);
  } else {
    if (draft.url.trim()) server.url = draft.url.trim();
  }
  if (draft.token) server.auth = { type: 'bearer', token: draft.token };

  const parsed = ServerSchema.safeParse(server);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const head = issue.path.length === 0 ? null : String(issue.path[0]);
      if (head === 'auth') {
        errors.token ??= 'Token must be a ${provider:path} reference.';
        continue;
      }
      // The transport↔command/url refine has an empty path → map it to the relevant field.
      const field = (head ??
        (draft.transport === 'stdio' ? 'command' : 'url')) as keyof ServerDraft;
      errors[field] ??= issue.message;
    }
  }

  return { errors, server: parsed.success ? parsed.data : null };
}
