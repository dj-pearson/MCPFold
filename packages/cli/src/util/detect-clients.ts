import { existsSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import { CLIENT_IDS, type ClientId } from '@mcpfold/core';

/**
 * Provisional client detection for the diagnostic bundle (S0.6).
 *
 * This checks whether each client's conventional USER-scope config file exists. It is
 * deliberately lightweight; the authoritative per-client, per-scope, cross-OS path
 * resolution lives in the adapters (S2.1) and `mcpfold init` detection (S3.2), which will
 * replace this map. Kept in the CLI package (not core) because it touches fs/os.
 */

export interface DetectedClient {
  id: ClientId;
  detected: boolean;
}

/** Best-effort user-scope config path candidates per client, by platform. */
function userConfigCandidates(id: ClientId): string[] {
  const home = homedir();
  const os = platform();
  const appData = process.env.APPDATA ?? join(home, 'AppData', 'Roaming');
  switch (id) {
    case 'claude-desktop':
      if (os === 'darwin')
        return [
          join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
        ];
      if (os === 'win32') return [join(appData, 'Claude', 'claude_desktop_config.json')];
      return [join(home, '.config', 'Claude', 'claude_desktop_config.json')];
    case 'claude-code':
      return [join(home, '.claude.json')];
    case 'cursor':
      return [join(home, '.cursor', 'mcp.json')];
    case 'vscode':
      if (os === 'darwin')
        return [join(home, 'Library', 'Application Support', 'Code', 'User', 'mcp.json')];
      if (os === 'win32') return [join(appData, 'Code', 'User', 'mcp.json')];
      return [join(home, '.config', 'Code', 'User', 'mcp.json')];
    case 'windsurf':
      return [join(home, '.codeium', 'windsurf', 'mcp_config.json')];
    case 'zed':
      return [join(home, '.config', 'zed', 'settings.json')];
    default:
      return [];
  }
}

export function detectClients(): DetectedClient[] {
  return CLIENT_IDS.map((id) => ({
    id,
    detected: userConfigCandidates(id).some((p) => existsSync(p)),
  }));
}
