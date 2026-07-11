/**
 * Known secret-token prefixes, single-sourced (S22.22) so the output redactor (S9.3, redact.ts) and
 * the ref-only push guard (S6.6, refguard.ts) can never drift out of sync again — a token one masks,
 * the other blocks. Add a new provider prefix here and both pick it up.
 *
 * Each entry is a regex fragment (not anchored). Notes on the tricky ones:
 *   - GitHub: `ghp_`/`gho_`/`ghu_`/`ghs_`/`ghr_` (classic/OAuth/user/server/refresh) AND the
 *     fine-grained `github_pat_` PAT.
 *   - Stripe: secret keys are `sk_live_`/`sk_test_` (UNDERSCORE); `sk-` (hyphen) is the OpenAI shape.
 */
export const TOKEN_PREFIXES: readonly string[] = [
  'gh[pousr]_', // GitHub classic PAT / OAuth / user / server / refresh
  'github_pat_', // GitHub fine-grained PAT
  'sk-', // OpenAI-style secret key
  'sk_(?:live|test)_', // Stripe secret key (live/test)
  'xox[baprs]-', // Slack token
  'AKIA', // AWS access key id
  'ya29\\.', // Google OAuth access token
  'glpat-', // GitLab personal access token
  'pk_live_', // Stripe publishable key (live)
  'rk_live_', // Stripe restricted key (live)
];

/** Alternation of the prefixes for embedding in a larger regex (no anchors, no flags). */
export const TOKEN_PREFIX_ALTERNATION = TOKEN_PREFIXES.join('|');

/** The URL-safe run that follows a token prefix (at least 6 chars). */
export const TOKEN_SUFFIX = '[A-Za-z0-9_\\-./]{6,}';
