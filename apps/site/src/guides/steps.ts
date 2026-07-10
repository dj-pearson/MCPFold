import type { GuideClient } from './guides.data';

/**
 * The canonical setup steps a per-client guide walks through (S15.5). Defined once here and consumed
 * by BOTH the visible guide page (ClientGuide.tsx) and the HowTo JSON-LD (seo/jsonld.ts), so the
 * structured data a crawler reads can never drift from the steps a human sees. The per-client facts
 * (config path, restart requirement) come straight from the adapter-derived {@link GuideClient}.
 */
export interface GuideStep {
  /** Short imperative step name (also the HowToStep `name`). */
  name: string;
  /** One-sentence instruction (the HowToStep `text`). */
  text: string;
  /** The shell command this step runs, if any (rendered as a copy-paste block). */
  command?: string;
}

/** Example user-scope config path to show for a client (prefers macOS, falls back across OSes). */
export function exampleConfigPath(client: GuideClient): string | null {
  return client.paths.macos ?? client.paths.linux ?? client.paths.windows;
}

/** The ordered steps to add MCP servers to a given client with mcpfold. */
export function guideSteps(client: GuideClient): GuideStep[] {
  const path = exampleConfigPath(client);
  const restart = client.needsRestart
    ? ` Then restart ${client.label} so it loads the new servers.`
    : '';
  return [
    {
      name: 'Install mcpfold',
      text: 'Install the free, open-source mcpfold CLI — no account required.',
      command: 'npm install -g mcpfold',
    },
    {
      name: 'Create your config',
      text: 'Create one canonical mcp.config.jsonc — the single source of truth mcpfold folds out to every client.',
      command: 'mcpfold init',
    },
    {
      name: 'Add a server',
      text: 'Add an MCP server from the registry (secrets stay references, versions stay pinned), or run `mcpfold import` to pull in servers you already configured.',
      command: 'mcpfold add <server> --from-registry',
    },
    {
      name: `Fold it out to ${client.label}`,
      text:
        `Write your servers into ${client.label}'s own config` +
        (path ? ` (${path})` : '') +
        ` under its \`${client.configRoot}\` key.${restart}`,
      command: 'mcpfold sync',
    },
  ];
}

/** One-line, neutral description of how a client receives secrets (from the adapter strategy). */
export function secretStrategyNote(client: GuideClient): string {
  switch (client.secretStrategy) {
    case 'native-input':
      return `${client.label} prompts for secrets itself, so mcpfold folds them to native input references — no token is ever written to disk.`;
    case 'inline':
      return `mcpfold resolves each \`\${…}\` reference at fold time and writes the value into ${client.label}'s config only on your machine.`;
    case 'shim':
    default:
      return `Secrets stay as \`\${env:…}\` / \`\${op:…}\` references; mcpfold's launcher resolves them at run time, so ${client.label}'s config file never contains a raw token.`;
  }
}

/** One-line, neutral description of how remote (http/sse) servers reach the client. */
export function remoteNote(client: GuideClient): string {
  if (!client.remote.nativeHttp) {
    return `${client.label} has no native remote transport, so remote servers are bridged with a pinned \`mcp-remote\` stdio launch (reversible on import).`;
  }
  if (!client.remote.nativeOauth) {
    return `${client.label} can call unauthenticated remotes natively; authenticated ones are bridged with a pinned \`mcp-remote\` launch so credentials are handled safely.`;
  }
  return `${client.label} reaches http/sse remotes natively — mcpfold writes a native remote entry, no bridge needed.`;
}
