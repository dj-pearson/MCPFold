import {
  CLIENT_IDS,
  type ClientId,
  type ProfileConfig,
  ProfileSchema,
  type Scope,
} from '@mcpfold/core';

/**
 * Live profile validation for the manager (S7.3) — runs the shared `ProfileSchema`, so the web
 * enforces the same rules as the CLI (notably: `path` is required for project/workspace scopes).
 */

export interface ProfileDraft {
  name: string;
  client: ClientId;
  scope: Scope;
  path: string;
  include: string; // comma-separated tags
}

export const emptyProfileDraft: ProfileDraft = {
  name: '',
  client: CLIENT_IDS[0],
  scope: 'user',
  path: '',
  include: '',
};

export interface ProfileValidation {
  errors: Partial<Record<keyof ProfileDraft, string>>;
  profile: ProfileConfig | null;
}

export function validateProfileDraft(
  draft: ProfileDraft,
  existingNames: string[],
): ProfileValidation {
  const errors: Partial<Record<keyof ProfileDraft, string>> = {};
  if (!draft.name.trim()) errors.name = 'Name is required.';
  else if (existingNames.includes(draft.name.trim())) {
    errors.name = 'A profile with this name already exists.';
  }

  const candidate: Record<string, unknown> = {
    client: draft.client,
    scope: draft.scope,
    include: draft.include
      ? draft.include
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      : [],
  };
  if (draft.path.trim()) candidate.path = draft.path.trim();

  const parsed = ProfileSchema.safeParse(candidate);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      // The `path`-required refine has an empty path → attribute it to the path field.
      const field = (issue.path.length ? String(issue.path[0]) : 'path') as keyof ProfileDraft;
      errors[field] ??= issue.message;
    }
  }

  return { errors, profile: parsed.success ? parsed.data : null };
}
