/**
 * The canonical spec §4 example, verbatim (with its // comments and trailing commas),
 * used across core tests. Kept under fixtures/ so it is excluded from lint/build.
 */
export const SPEC_EXAMPLE_JSONC = `{
  "version": 1,

  "servers": {
    "github": {
      "transport": "http",
      "url": "https://api.githubcopilot.com/mcp/",
      "auth": { "type": "bearer", "token": "\${infisical:dev/mcp/GITHUB_PAT}" },
      "tools": { "mode": "allow", "list": ["create_issue", "get_pull_request", "search_code"] },
      "tags": ["work", "code"]
    },

    "supabase": {
      "transport": "http",
      "url": "https://mcp.supabase.com/sse",
      "auth": { "type": "bearer", "token": "\${infisical:dev/mcp/SUPABASE_TOKEN}" },
      "tags": ["work"]
    },

    "playwright": {
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"],
      "pin": "1.4.2",                       // resolves to @playwright/mcp@1.4.2 — supply-chain hygiene
      "env": { "HEADLESS": "true" },
      "tags": ["code"]
    }
  },

  "profiles": {
    "work-cursor":       { "client": "cursor",         "scope": "user",    "include": ["work", "code"] },
    "personal-desktop":  { "client": "claude-desktop", "scope": "user",    "include": ["personal"] },
    "projectX":          { "client": "claude-code",    "scope": "project", "path": "~/repos/projectX", "include": ["code"] },
    "review-vscode":     { "client": "vscode",         "scope": "workspace","path": "~/repos/projectX", "include": ["code", "work"] }
  }
}`;
