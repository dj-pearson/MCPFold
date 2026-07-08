import type { SecretProvider } from '../types.js';

/**
 * Infisical provider (S4.3) — resolves `${infisical:env/path/KEY}` against a configured
 * Infisical project (spec §6). Auth is via a machine-identity/service token taken from the
 * environment (`INFISICAL_TOKEN`) — never hardcoded. The network call is isolated behind an
 * injectable `fetchSecret` so tests need no real Infisical.
 *
 * Ref grammar: the FIRST path segment is the environment slug, the LAST is the secret key,
 * and anything in between is the folder path — e.g. `dev/mcp/GITHUB_PAT` →
 * env `dev`, path `/mcp`, key `GITHUB_PAT`.
 */

export interface InfisicalFetchParams {
  key: string;
  environment: string;
  secretPath: string;
  token: string;
  projectId: string;
  apiUrl: string;
}

export type InfisicalFetch = (params: InfisicalFetchParams) => Promise<string>;

export interface InfisicalConfig {
  env?: NodeJS.ProcessEnv;
  /** Injectable network call; defaults to the Infisical v3 raw-secret REST endpoint. */
  fetchSecret?: InfisicalFetch;
}

export function parseInfisicalPath(path: string): {
  environment: string;
  secretPath: string;
  key: string;
} {
  const segments = path.split('/').filter(Boolean);
  if (segments.length < 2) {
    throw new Error(
      `infisical reference "${path}" must be "env/[folder/…/]KEY" (e.g. dev/mcp/GITHUB_PAT)`,
    );
  }
  const environment = segments[0]!;
  const key = segments[segments.length - 1]!;
  const folder = segments.slice(1, -1);
  return { environment, secretPath: `/${folder.join('/')}`, key };
}

const defaultFetch: InfisicalFetch = async ({
  key,
  environment,
  secretPath,
  token,
  projectId,
  apiUrl,
}) => {
  const url = new URL(`${apiUrl.replace(/\/$/, '')}/api/v3/secrets/raw/${encodeURIComponent(key)}`);
  url.searchParams.set('workspaceId', projectId);
  url.searchParams.set('environment', environment);
  url.searchParams.set('secretPath', secretPath);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    throw new Error(`Infisical API responded ${response.status} for "${key}"`);
  }
  const body = (await response.json()) as { secret?: { secretValue?: string } };
  const value = body.secret?.secretValue;
  if (value === undefined) throw new Error(`Infisical returned no value for "${key}"`);
  return value;
};

export function infisicalProvider(config: InfisicalConfig = {}): SecretProvider {
  const env = config.env ?? process.env;
  const fetchSecret = config.fetchSecret ?? defaultFetch;
  return {
    scheme: 'infisical',
    async resolve(path) {
      const token = env.INFISICAL_TOKEN;
      const projectId = env.INFISICAL_PROJECT_ID;
      const apiUrl = env.INFISICAL_API_URL ?? 'https://app.infisical.com';
      if (!token) {
        throw new Error(
          'INFISICAL_TOKEN is not set (use an Infisical machine-identity/service token)',
        );
      }
      if (!projectId) {
        throw new Error('INFISICAL_PROJECT_ID is not set');
      }
      const { environment, secretPath, key } = parseInfisicalPath(path);
      return fetchSecret({ key, environment, secretPath, token, projectId, apiUrl });
    },
  };
}
