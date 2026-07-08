import type { DirectoryEntry } from '@mcpfold/core';

/**
 * "Add to config" deep links (S13.5). Both a copy-paste CLI snippet and an app-editor prefill URL.
 * Any token is a `${provider:path}` reference placeholder — never a value.
 */

/** The launch target `mcpfold add` accepts: the npm package (stdio) or the URL (http/sse). */
export function addTarget(entry: DirectoryEntry): string {
  if (entry.transport !== 'stdio') return entry.url ?? '';
  const pkg = (entry.args ?? []).find(
    (a) => !a.startsWith('-') && !a.startsWith('.') && /[a-z]/i.test(a),
  );
  return pkg ?? entry.id;
}

/** The copy-paste CLI command to add this server. */
export function cliSnippet(entry: DirectoryEntry): string {
  return `mcpfold add ${addTarget(entry)}`;
}

/** Deep link into the app's editor with this entry prefilled. */
export function editorUrl(entry: DirectoryEntry): string {
  return `https://app.mcpfold.com/directory?add=${encodeURIComponent(entry.id)}`;
}
