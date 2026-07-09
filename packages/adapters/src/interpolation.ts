import type { InterpolationDialect } from './types.js';

/**
 * Native env-interpolation dialects (S19.4).
 *
 * Cursor, VS Code, and Windsurf all resolve `${env:NAME}` in their own config — the same syntax
 * mcpfold uses canonically — so folding an env reference is a pass-through: the reference sits in
 * the client file and the client resolves it from the process environment at launch, no shim.
 */
export const envIdentityDialect: InterpolationDialect = {
  toNative: (name) => `\${env:${name}}`,
};
