import { readFileSync } from 'node:fs';
import type { SecretProvider } from '../types.js';

/**
 * `dotenv` provider (S4.2) — resolves `${dotenv:NAME}` from a designated `.env` file.
 *
 * Path convention: the file path is supplied when the provider is constructed (the CLI
 * defaults to `<cwd>/.env`). Values are read into a private cache — they are **never**
 * written to `process.env`, so a dotenv secret can't leak to child processes or other code
 * that inspects the global environment.
 */

/** Minimal .env parser: `KEY=VALUE` lines, `#` comments, optional surrounding quotes. */
export function parseDotenv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

export function dotenvProvider(filePath: string): SecretProvider {
  let cache: Record<string, string> | null = null;
  return {
    scheme: 'dotenv',
    async resolve(path) {
      if (!cache) {
        let text: string;
        try {
          text = readFileSync(filePath, 'utf8');
        } catch {
          throw new Error(`could not read dotenv file at ${filePath}`);
        }
        cache = parseDotenv(text);
      }
      const value = cache[path];
      if (value === undefined) {
        throw new Error(`"${path}" not found in ${filePath}`);
      }
      return value;
    },
  };
}
