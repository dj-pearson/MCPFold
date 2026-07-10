import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import { useEffect, useState, useMemo, StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server.mjs";
import { useLocation, Link, Outlet, useParams, Routes, Route } from "react-router-dom";
import { z } from "zod";
import { marked } from "marked";
const CLIENT_IDS = [
  "claude-desktop",
  "claude-code",
  "cursor",
  "vscode",
  "windsurf",
  "zed",
  "cline",
  "gemini-cli",
  "jetbrains",
  "visual-studio",
  "continue",
  "roo-code",
  "goose",
  "codex-cli",
  "lm-studio",
  "warp",
  "opencode",
  "copilot-cli"
];
const STRATEGY_OVERRIDES = ["shim", "native-env"];
const TRANSPORTS = ["stdio", "streamable-http", "sse"];
const TransportSchema = z.preprocess((v) => v === "http" ? "streamable-http" : v, z.enum(TRANSPORTS));
const SCOPES = ["user", "project", "workspace"];
const SECRET_REF_RE = /^\$\{[a-z0-9_-]+:.+\}$/;
const SecretRef = z.string().regex(SECRET_REF_RE, {
  message: "secret reference must look like ${scheme:path}, e.g. ${env:GITHUB_PAT}"
});
const StringOrSecretRef = z.union([z.string(), SecretRef]);
const AuthSchema = z.object({
  type: z.enum(["bearer", "header", "oauth", "none"]).default("none"),
  token: SecretRef.optional(),
  headers: z.record(StringOrSecretRef).optional()
}).strict();
const ToolsSchema = z.object({
  mode: z.enum(["allow", "deny"]),
  list: z.array(z.string())
}).strict();
const ServerSchema = z.object({
  transport: TransportSchema,
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  url: z.string().url().optional(),
  auth: AuthSchema.optional(),
  env: z.record(StringOrSecretRef).optional(),
  /** Pins an `@latest` stdio server to a fixed version at fold time (supply-chain hygiene). */
  pin: z.string().optional(),
  /** Optional SRI integrity hash (e.g. `sha512-…`) for the pinned stdio package (S9.2). */
  integrity: z.string().optional(),
  tools: ToolsSchema.optional(),
  /** Per-server secret-strategy override (S19.4) — wins over the profile's and adapter's default. */
  secretStrategy: z.enum(STRATEGY_OVERRIDES).optional(),
  tags: z.array(z.string()).default([])
}).strict().refine((s) => s.transport === "stdio" ? Boolean(s.command) : Boolean(s.url), {
  message: "stdio servers need `command`; http/sse servers need `url`"
});
const ProfileSchema = z.object({
  client: z.enum(CLIENT_IDS),
  scope: z.enum(SCOPES).default("user"),
  /** Required for project/workspace scopes; ignored for user scope. */
  path: z.string().optional(),
  /** Tag filter — the "fold": only servers whose tags intersect this load into the client. */
  include: z.array(z.string()),
  /** Per-profile secret-strategy override (S19.4); a server's own override still wins over this. */
  secretStrategy: z.enum(STRATEGY_OVERRIDES).optional()
}).strict().refine((p) => p.scope === "user" || Boolean(p.path), {
  message: '`path` is required when scope is "project" or "workspace"'
});
z.object({
  /** Optional JSON Schema pointer for editor autocomplete; ignored semantically. */
  $schema: z.string().optional(),
  /** Canonical schema version. v1 files auto-migrate to v2 on load (S17.5); `mcpfold migrate`
   * persists the upgrade. */
  version: z.literal(2),
  servers: z.record(ServerSchema),
  profiles: z.record(ProfileSchema)
}).strict();
var CharacterCodes;
(function(CharacterCodes2) {
  CharacterCodes2[CharacterCodes2["lineFeed"] = 10] = "lineFeed";
  CharacterCodes2[CharacterCodes2["carriageReturn"] = 13] = "carriageReturn";
  CharacterCodes2[CharacterCodes2["space"] = 32] = "space";
  CharacterCodes2[CharacterCodes2["_0"] = 48] = "_0";
  CharacterCodes2[CharacterCodes2["_1"] = 49] = "_1";
  CharacterCodes2[CharacterCodes2["_2"] = 50] = "_2";
  CharacterCodes2[CharacterCodes2["_3"] = 51] = "_3";
  CharacterCodes2[CharacterCodes2["_4"] = 52] = "_4";
  CharacterCodes2[CharacterCodes2["_5"] = 53] = "_5";
  CharacterCodes2[CharacterCodes2["_6"] = 54] = "_6";
  CharacterCodes2[CharacterCodes2["_7"] = 55] = "_7";
  CharacterCodes2[CharacterCodes2["_8"] = 56] = "_8";
  CharacterCodes2[CharacterCodes2["_9"] = 57] = "_9";
  CharacterCodes2[CharacterCodes2["a"] = 97] = "a";
  CharacterCodes2[CharacterCodes2["b"] = 98] = "b";
  CharacterCodes2[CharacterCodes2["c"] = 99] = "c";
  CharacterCodes2[CharacterCodes2["d"] = 100] = "d";
  CharacterCodes2[CharacterCodes2["e"] = 101] = "e";
  CharacterCodes2[CharacterCodes2["f"] = 102] = "f";
  CharacterCodes2[CharacterCodes2["g"] = 103] = "g";
  CharacterCodes2[CharacterCodes2["h"] = 104] = "h";
  CharacterCodes2[CharacterCodes2["i"] = 105] = "i";
  CharacterCodes2[CharacterCodes2["j"] = 106] = "j";
  CharacterCodes2[CharacterCodes2["k"] = 107] = "k";
  CharacterCodes2[CharacterCodes2["l"] = 108] = "l";
  CharacterCodes2[CharacterCodes2["m"] = 109] = "m";
  CharacterCodes2[CharacterCodes2["n"] = 110] = "n";
  CharacterCodes2[CharacterCodes2["o"] = 111] = "o";
  CharacterCodes2[CharacterCodes2["p"] = 112] = "p";
  CharacterCodes2[CharacterCodes2["q"] = 113] = "q";
  CharacterCodes2[CharacterCodes2["r"] = 114] = "r";
  CharacterCodes2[CharacterCodes2["s"] = 115] = "s";
  CharacterCodes2[CharacterCodes2["t"] = 116] = "t";
  CharacterCodes2[CharacterCodes2["u"] = 117] = "u";
  CharacterCodes2[CharacterCodes2["v"] = 118] = "v";
  CharacterCodes2[CharacterCodes2["w"] = 119] = "w";
  CharacterCodes2[CharacterCodes2["x"] = 120] = "x";
  CharacterCodes2[CharacterCodes2["y"] = 121] = "y";
  CharacterCodes2[CharacterCodes2["z"] = 122] = "z";
  CharacterCodes2[CharacterCodes2["A"] = 65] = "A";
  CharacterCodes2[CharacterCodes2["B"] = 66] = "B";
  CharacterCodes2[CharacterCodes2["C"] = 67] = "C";
  CharacterCodes2[CharacterCodes2["D"] = 68] = "D";
  CharacterCodes2[CharacterCodes2["E"] = 69] = "E";
  CharacterCodes2[CharacterCodes2["F"] = 70] = "F";
  CharacterCodes2[CharacterCodes2["G"] = 71] = "G";
  CharacterCodes2[CharacterCodes2["H"] = 72] = "H";
  CharacterCodes2[CharacterCodes2["I"] = 73] = "I";
  CharacterCodes2[CharacterCodes2["J"] = 74] = "J";
  CharacterCodes2[CharacterCodes2["K"] = 75] = "K";
  CharacterCodes2[CharacterCodes2["L"] = 76] = "L";
  CharacterCodes2[CharacterCodes2["M"] = 77] = "M";
  CharacterCodes2[CharacterCodes2["N"] = 78] = "N";
  CharacterCodes2[CharacterCodes2["O"] = 79] = "O";
  CharacterCodes2[CharacterCodes2["P"] = 80] = "P";
  CharacterCodes2[CharacterCodes2["Q"] = 81] = "Q";
  CharacterCodes2[CharacterCodes2["R"] = 82] = "R";
  CharacterCodes2[CharacterCodes2["S"] = 83] = "S";
  CharacterCodes2[CharacterCodes2["T"] = 84] = "T";
  CharacterCodes2[CharacterCodes2["U"] = 85] = "U";
  CharacterCodes2[CharacterCodes2["V"] = 86] = "V";
  CharacterCodes2[CharacterCodes2["W"] = 87] = "W";
  CharacterCodes2[CharacterCodes2["X"] = 88] = "X";
  CharacterCodes2[CharacterCodes2["Y"] = 89] = "Y";
  CharacterCodes2[CharacterCodes2["Z"] = 90] = "Z";
  CharacterCodes2[CharacterCodes2["asterisk"] = 42] = "asterisk";
  CharacterCodes2[CharacterCodes2["backslash"] = 92] = "backslash";
  CharacterCodes2[CharacterCodes2["closeBrace"] = 125] = "closeBrace";
  CharacterCodes2[CharacterCodes2["closeBracket"] = 93] = "closeBracket";
  CharacterCodes2[CharacterCodes2["colon"] = 58] = "colon";
  CharacterCodes2[CharacterCodes2["comma"] = 44] = "comma";
  CharacterCodes2[CharacterCodes2["dot"] = 46] = "dot";
  CharacterCodes2[CharacterCodes2["doubleQuote"] = 34] = "doubleQuote";
  CharacterCodes2[CharacterCodes2["minus"] = 45] = "minus";
  CharacterCodes2[CharacterCodes2["openBrace"] = 123] = "openBrace";
  CharacterCodes2[CharacterCodes2["openBracket"] = 91] = "openBracket";
  CharacterCodes2[CharacterCodes2["plus"] = 43] = "plus";
  CharacterCodes2[CharacterCodes2["slash"] = 47] = "slash";
  CharacterCodes2[CharacterCodes2["formFeed"] = 12] = "formFeed";
  CharacterCodes2[CharacterCodes2["tab"] = 9] = "tab";
})(CharacterCodes || (CharacterCodes = {}));
new Array(20).fill(0).map((_, index) => {
  return " ".repeat(index);
});
const maxCachedValues = 200;
({
  " ": {
    "\n": new Array(maxCachedValues).fill(0).map((_, index) => {
      return "\n" + " ".repeat(index);
    }),
    "\r": new Array(maxCachedValues).fill(0).map((_, index) => {
      return "\r" + " ".repeat(index);
    }),
    "\r\n": new Array(maxCachedValues).fill(0).map((_, index) => {
      return "\r\n" + " ".repeat(index);
    })
  },
  "	": {
    "\n": new Array(maxCachedValues).fill(0).map((_, index) => {
      return "\n" + "	".repeat(index);
    }),
    "\r": new Array(maxCachedValues).fill(0).map((_, index) => {
      return "\r" + "	".repeat(index);
    }),
    "\r\n": new Array(maxCachedValues).fill(0).map((_, index) => {
      return "\r\n" + "	".repeat(index);
    })
  }
});
var ParseOptions;
(function(ParseOptions2) {
  ParseOptions2.DEFAULT = {
    allowTrailingComma: false
  };
})(ParseOptions || (ParseOptions = {}));
var ScanError;
(function(ScanError2) {
  ScanError2[ScanError2["None"] = 0] = "None";
  ScanError2[ScanError2["UnexpectedEndOfComment"] = 1] = "UnexpectedEndOfComment";
  ScanError2[ScanError2["UnexpectedEndOfString"] = 2] = "UnexpectedEndOfString";
  ScanError2[ScanError2["UnexpectedEndOfNumber"] = 3] = "UnexpectedEndOfNumber";
  ScanError2[ScanError2["InvalidUnicode"] = 4] = "InvalidUnicode";
  ScanError2[ScanError2["InvalidEscapeCharacter"] = 5] = "InvalidEscapeCharacter";
  ScanError2[ScanError2["InvalidCharacter"] = 6] = "InvalidCharacter";
})(ScanError || (ScanError = {}));
var SyntaxKind;
(function(SyntaxKind2) {
  SyntaxKind2[SyntaxKind2["OpenBraceToken"] = 1] = "OpenBraceToken";
  SyntaxKind2[SyntaxKind2["CloseBraceToken"] = 2] = "CloseBraceToken";
  SyntaxKind2[SyntaxKind2["OpenBracketToken"] = 3] = "OpenBracketToken";
  SyntaxKind2[SyntaxKind2["CloseBracketToken"] = 4] = "CloseBracketToken";
  SyntaxKind2[SyntaxKind2["CommaToken"] = 5] = "CommaToken";
  SyntaxKind2[SyntaxKind2["ColonToken"] = 6] = "ColonToken";
  SyntaxKind2[SyntaxKind2["NullKeyword"] = 7] = "NullKeyword";
  SyntaxKind2[SyntaxKind2["TrueKeyword"] = 8] = "TrueKeyword";
  SyntaxKind2[SyntaxKind2["FalseKeyword"] = 9] = "FalseKeyword";
  SyntaxKind2[SyntaxKind2["StringLiteral"] = 10] = "StringLiteral";
  SyntaxKind2[SyntaxKind2["NumericLiteral"] = 11] = "NumericLiteral";
  SyntaxKind2[SyntaxKind2["LineCommentTrivia"] = 12] = "LineCommentTrivia";
  SyntaxKind2[SyntaxKind2["BlockCommentTrivia"] = 13] = "BlockCommentTrivia";
  SyntaxKind2[SyntaxKind2["LineBreakTrivia"] = 14] = "LineBreakTrivia";
  SyntaxKind2[SyntaxKind2["Trivia"] = 15] = "Trivia";
  SyntaxKind2[SyntaxKind2["Unknown"] = 16] = "Unknown";
  SyntaxKind2[SyntaxKind2["EOF"] = 17] = "EOF";
})(SyntaxKind || (SyntaxKind = {}));
var ParseErrorCode;
(function(ParseErrorCode2) {
  ParseErrorCode2[ParseErrorCode2["InvalidSymbol"] = 1] = "InvalidSymbol";
  ParseErrorCode2[ParseErrorCode2["InvalidNumberFormat"] = 2] = "InvalidNumberFormat";
  ParseErrorCode2[ParseErrorCode2["PropertyNameExpected"] = 3] = "PropertyNameExpected";
  ParseErrorCode2[ParseErrorCode2["ValueExpected"] = 4] = "ValueExpected";
  ParseErrorCode2[ParseErrorCode2["ColonExpected"] = 5] = "ColonExpected";
  ParseErrorCode2[ParseErrorCode2["CommaExpected"] = 6] = "CommaExpected";
  ParseErrorCode2[ParseErrorCode2["CloseBraceExpected"] = 7] = "CloseBraceExpected";
  ParseErrorCode2[ParseErrorCode2["CloseBracketExpected"] = 8] = "CloseBracketExpected";
  ParseErrorCode2[ParseErrorCode2["EndOfFileExpected"] = 9] = "EndOfFileExpected";
  ParseErrorCode2[ParseErrorCode2["InvalidCommentToken"] = 10] = "InvalidCommentToken";
  ParseErrorCode2[ParseErrorCode2["UnexpectedEndOfComment"] = 11] = "UnexpectedEndOfComment";
  ParseErrorCode2[ParseErrorCode2["UnexpectedEndOfString"] = 12] = "UnexpectedEndOfString";
  ParseErrorCode2[ParseErrorCode2["UnexpectedEndOfNumber"] = 13] = "UnexpectedEndOfNumber";
  ParseErrorCode2[ParseErrorCode2["InvalidUnicode"] = 14] = "InvalidUnicode";
  ParseErrorCode2[ParseErrorCode2["InvalidEscapeCharacter"] = 15] = "InvalidEscapeCharacter";
  ParseErrorCode2[ParseErrorCode2["InvalidCharacter"] = 16] = "InvalidCharacter";
})(ParseErrorCode || (ParseErrorCode = {}));
const DIRECTORY$1 = [
  {
    id: "filesystem",
    name: "Filesystem",
    description: "Read and write local files within allowed directories.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
    suggestedTags: ["files"]
  },
  {
    id: "memory",
    name: "Memory",
    description: "A knowledge-graph memory the model can read and write across turns.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-memory"],
    suggestedTags: ["ai", "memory"]
  },
  {
    id: "sequential-thinking",
    name: "Sequential Thinking",
    description: "A tool for step-by-step reasoning and problem decomposition.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
    suggestedTags: ["ai"]
  },
  {
    id: "everything",
    name: "Everything",
    description: "A reference server exercising every MCP feature — useful for testing clients.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-everything"],
    suggestedTags: ["dev-tools"]
  },
  {
    id: "fetch",
    name: "Fetch",
    description: "Fetch a URL and convert the page to markdown for the model.",
    transport: "stdio",
    command: "uvx",
    args: ["mcp-server-fetch"],
    suggestedTags: ["web"]
  },
  {
    id: "git",
    name: "Git",
    description: "Read, search, and manipulate a local Git repository.",
    transport: "stdio",
    command: "uvx",
    args: ["mcp-server-git"],
    suggestedTags: ["git", "dev-tools"]
  },
  {
    id: "time",
    name: "Time",
    description: "Time and timezone conversions.",
    transport: "stdio",
    command: "uvx",
    args: ["mcp-server-time"],
    suggestedTags: ["productivity"]
  },
  {
    id: "sqlite",
    name: "SQLite",
    description: "Query and inspect a local SQLite database.",
    transport: "stdio",
    command: "uvx",
    args: ["mcp-server-sqlite"],
    suggestedTags: ["database"]
  },
  {
    id: "github",
    name: "GitHub",
    description: "Repositories, issues, and pull requests via the GitHub API.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    tokenRef: "${env:GITHUB_PAT}",
    suggestedTags: ["git", "dev-tools"]
  },
  {
    id: "gitlab",
    name: "GitLab",
    description: "Projects, issues, and merge requests via the GitLab API.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-gitlab"],
    tokenRef: "${env:GITLAB_TOKEN}",
    suggestedTags: ["git", "dev-tools"]
  },
  {
    id: "jetbrains",
    name: "JetBrains",
    description: "Talk to a running JetBrains IDE — files, refactors, and run configs.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@jetbrains/mcp-proxy"],
    suggestedTags: ["dev-tools"]
  },
  {
    id: "code-runner",
    name: "Code Runner",
    description: "Run code snippets in many languages and return the output.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "mcp-server-code-runner"],
    suggestedTags: ["dev-tools"]
  },
  {
    id: "e2b",
    name: "E2B",
    description: "Run code in a secure cloud sandbox.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@e2b/mcp-server"],
    tokenRef: "${env:E2B_API_KEY}",
    suggestedTags: ["dev-tools", "cloud"]
  },
  {
    id: "desktop-commander",
    name: "Desktop Commander",
    description: "Run terminal commands and edit files on your machine.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@wonderwhy-er/desktop-commander"],
    suggestedTags: ["dev-tools", "files"]
  },
  {
    id: "iterm",
    name: "iTerm",
    description: "Read and drive the active iTerm terminal session (macOS).",
    transport: "stdio",
    command: "npx",
    args: ["-y", "iterm-mcp"],
    suggestedTags: ["dev-tools"]
  },
  {
    id: "commands",
    name: "Shell Commands",
    description: "Run allow-listed shell commands and return their output.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "mcp-server-commands"],
    suggestedTags: ["dev-tools"]
  },
  {
    id: "context7",
    name: "Context7",
    description: "Pull up-to-date, version-specific library docs into the model.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@upstash/context7-mcp"],
    suggestedTags: ["ai", "dev-tools"]
  },
  {
    id: "magic",
    name: "21st.dev Magic",
    description: "Generate React UI components from a natural-language prompt.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@21st-dev/magic"],
    tokenRef: "${env:TWENTYFIRST_API_KEY}",
    suggestedTags: ["dev-tools", "ai"]
  },
  {
    id: "figma",
    name: "Figma",
    description: "Read Figma files and frames so an agent can implement the design.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "figma-developer-mcp"],
    tokenRef: "${env:FIGMA_API_KEY}",
    suggestedTags: ["dev-tools", "media"]
  },
  {
    id: "markitdown",
    name: "MarkItDown",
    description: "Convert PDFs, Office docs, and more to markdown.",
    transport: "stdio",
    command: "uvx",
    args: ["markitdown-mcp"],
    suggestedTags: ["files", "dev-tools"]
  },
  {
    id: "playwright",
    name: "Playwright",
    description: "Drive a real browser for navigation, scraping, and testing.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@playwright/mcp"],
    suggestedTags: ["browser", "dev-tools"]
  },
  {
    id: "puppeteer",
    name: "Puppeteer",
    description: "Browser automation and screenshots via Puppeteer.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-puppeteer"],
    suggestedTags: ["browser"]
  },
  {
    id: "browserbase",
    name: "Browserbase",
    description: "Cloud headless browsers for automation at scale.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@browserbasehq/mcp-server-browserbase"],
    tokenRef: "${env:BROWSERBASE_API_KEY}",
    suggestedTags: ["browser", "cloud"]
  },
  {
    id: "apify",
    name: "Apify",
    description: "Run Apify Actors to scrape and automate the web.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@apify/actors-mcp-server"],
    tokenRef: "${env:APIFY_TOKEN}",
    suggestedTags: ["automation", "web"]
  },
  {
    id: "brave-search",
    name: "Brave Search",
    description: "Web and local search via the Brave Search API.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-brave-search"],
    tokenRef: "${env:BRAVE_API_KEY}",
    suggestedTags: ["search", "web"]
  },
  {
    id: "tavily",
    name: "Tavily",
    description: "Web search and extraction tuned for LLMs.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "tavily-mcp"],
    tokenRef: "${env:TAVILY_API_KEY}",
    suggestedTags: ["search", "web"]
  },
  {
    id: "exa",
    name: "Exa",
    description: "Neural web search and crawling for AI agents.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "exa-mcp-server"],
    tokenRef: "${env:EXA_API_KEY}",
    suggestedTags: ["search", "web"]
  },
  {
    id: "duckduckgo",
    name: "DuckDuckGo",
    description: "Web search via DuckDuckGo, no API key required.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "duckduckgo-mcp-server"],
    suggestedTags: ["search", "web"]
  },
  {
    id: "perplexity",
    name: "Perplexity",
    description: "Ask the Perplexity Sonar models for sourced answers.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "server-perplexity-ask"],
    tokenRef: "${env:PERPLEXITY_API_KEY}",
    suggestedTags: ["search", "ai"]
  },
  {
    id: "firecrawl",
    name: "Firecrawl",
    description: "Crawl, scrape, and search sites into clean markdown.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "firecrawl-mcp"],
    tokenRef: "${env:FIRECRAWL_API_KEY}",
    suggestedTags: ["web", "search"]
  },
  {
    id: "arxiv",
    name: "arXiv",
    description: "Search and fetch papers from arXiv.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "arxiv-mcp-server"],
    suggestedTags: ["search", "ai"]
  },
  {
    id: "postgres",
    name: "Postgres",
    description: "Read-only SQL queries against a Postgres database.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-postgres"],
    tokenRef: "${env:DATABASE_URL}",
    suggestedTags: ["database"]
  },
  {
    id: "redis",
    name: "Redis",
    description: "Read and write keys in a Redis instance.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-redis"],
    tokenRef: "${env:REDIS_URL}",
    suggestedTags: ["database"]
  },
  {
    id: "mongodb",
    name: "MongoDB",
    description: "Query and manage a MongoDB database.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "mongodb-mcp-server"],
    tokenRef: "${env:MONGODB_URI}",
    suggestedTags: ["database"]
  },
  {
    id: "dbhub",
    name: "DBHub",
    description: "One SQL server for Postgres, MySQL, SQL Server, SQLite, and MariaDB.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@bytebase/dbhub"],
    tokenRef: "${env:DSN}",
    suggestedTags: ["database"]
  },
  {
    id: "supabase",
    name: "Supabase",
    description: "Manage a Supabase project — tables, SQL, and edge config.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@supabase/mcp-server-supabase"],
    tokenRef: "${env:SUPABASE_ACCESS_TOKEN}",
    suggestedTags: ["database", "cloud"]
  },
  {
    id: "neon",
    name: "Neon",
    description: "Manage Neon serverless Postgres projects and run SQL.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@neondatabase/mcp-server-neon"],
    tokenRef: "${env:NEON_API_KEY}",
    suggestedTags: ["database", "cloud"]
  },
  {
    id: "airtable",
    name: "Airtable",
    description: "Read and write Airtable bases and records.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "airtable-mcp-server"],
    tokenRef: "${env:AIRTABLE_API_KEY}",
    suggestedTags: ["database", "productivity"]
  },
  {
    id: "elasticsearch",
    name: "Elasticsearch",
    description: "Search and inspect Elasticsearch indices.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@elastic/mcp-server-elasticsearch"],
    tokenRef: "${env:ELASTICSEARCH_API_KEY}",
    suggestedTags: ["database", "search"]
  },
  {
    id: "clickhouse",
    name: "ClickHouse",
    description: "Run analytical SQL against a ClickHouse database.",
    transport: "stdio",
    command: "uvx",
    args: ["mcp-clickhouse"],
    tokenRef: "${env:CLICKHOUSE_PASSWORD}",
    suggestedTags: ["database", "data"]
  },
  {
    id: "pinecone",
    name: "Pinecone",
    description: "Query and manage Pinecone vector indexes.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@pinecone-database/mcp"],
    tokenRef: "${env:PINECONE_API_KEY}",
    suggestedTags: ["database", "ai"]
  },
  {
    id: "qdrant",
    name: "Qdrant",
    description: "Store and retrieve vectors from a Qdrant database.",
    transport: "stdio",
    command: "uvx",
    args: ["mcp-server-qdrant"],
    tokenRef: "${env:QDRANT_API_KEY}",
    suggestedTags: ["database", "ai"]
  },
  {
    id: "chart",
    name: "Charts",
    description: "Generate charts and graphs from data (AntV).",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@antv/mcp-server-chart"],
    suggestedTags: ["data", "media"]
  },
  {
    id: "aws-kb-retrieval",
    name: "AWS Knowledge Base",
    description: "Retrieve from an AWS Bedrock knowledge base.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-aws-kb-retrieval"],
    tokenRef: "${env:AWS_ACCESS_KEY_ID}",
    suggestedTags: ["cloud", "ai"]
  },
  {
    id: "cloudflare",
    name: "Cloudflare",
    description: "Manage Cloudflare Workers, KV, R2, and DNS.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@cloudflare/mcp-server-cloudflare"],
    tokenRef: "${env:CLOUDFLARE_API_TOKEN}",
    suggestedTags: ["cloud"]
  },
  {
    id: "heroku",
    name: "Heroku",
    description: "Manage Heroku apps, dynos, and add-ons.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@heroku/mcp-server"],
    tokenRef: "${env:HEROKU_API_KEY}",
    suggestedTags: ["cloud"]
  },
  {
    id: "azure",
    name: "Azure",
    description: "Query and manage Azure resources.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@azure/mcp"],
    suggestedTags: ["cloud"]
  },
  {
    id: "kubernetes",
    name: "Kubernetes",
    description: "Inspect and operate a Kubernetes cluster via kubectl.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "mcp-server-kubernetes"],
    suggestedTags: ["cloud", "dev-tools"]
  },
  {
    id: "notion",
    name: "Notion",
    description: "Read and update Notion pages and databases.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@notionhq/notion-mcp-server"],
    tokenRef: "${env:NOTION_TOKEN}",
    suggestedTags: ["productivity"]
  },
  {
    id: "obsidian",
    name: "Obsidian",
    description: "Read and search an Obsidian vault.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "mcp-obsidian"],
    suggestedTags: ["productivity", "files"]
  },
  {
    id: "linear",
    name: "Linear",
    description: "Manage Linear issues, projects, and cycles.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "mcp-linear"],
    tokenRef: "${env:LINEAR_API_KEY}",
    suggestedTags: ["productivity"]
  },
  {
    id: "clickup",
    name: "ClickUp",
    description: "Manage ClickUp tasks, lists, and docs.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "mcp-clickup"],
    tokenRef: "${env:CLICKUP_API_KEY}",
    suggestedTags: ["productivity"]
  },
  {
    id: "trello",
    name: "Trello",
    description: "Manage Trello boards, lists, and cards.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "mcp-trello"],
    tokenRef: "${env:TRELLO_API_KEY}",
    suggestedTags: ["productivity"]
  },
  {
    id: "atlassian",
    name: "Atlassian",
    description: "Jira issues and Confluence pages.",
    transport: "stdio",
    command: "uvx",
    args: ["mcp-atlassian"],
    tokenRef: "${env:ATLASSIAN_API_TOKEN}",
    suggestedTags: ["productivity"]
  },
  {
    id: "gdrive",
    name: "Google Drive",
    description: "Search and read files in Google Drive.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-gdrive"],
    suggestedTags: ["files", "productivity"]
  },
  {
    id: "gmail",
    name: "Gmail",
    description: "Read, search, and send Gmail messages.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@gongrzhe/server-gmail-autoauth-mcp"],
    suggestedTags: ["communication", "productivity"]
  },
  {
    id: "slack",
    name: "Slack",
    description: "Post and read messages in Slack channels.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-slack"],
    tokenRef: "${env:SLACK_BOT_TOKEN}",
    suggestedTags: ["communication"]
  },
  {
    id: "discord",
    name: "Discord",
    description: "Send and read messages in Discord servers.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "discord-mcp"],
    tokenRef: "${env:DISCORD_TOKEN}",
    suggestedTags: ["communication"]
  },
  {
    id: "twilio",
    name: "Twilio",
    description: "Send SMS and use the Twilio APIs.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@twilio-alpha/mcp"],
    tokenRef: "${env:TWILIO_AUTH_TOKEN}",
    suggestedTags: ["communication"]
  },
  {
    id: "everart",
    name: "EverArt",
    description: "Generate images with the EverArt API.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-everart"],
    tokenRef: "${env:EVERART_API_KEY}",
    suggestedTags: ["media", "ai"]
  },
  {
    id: "spotify",
    name: "Spotify",
    description: "Control playback and manage playlists via the Spotify API.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "spotify-mcp"],
    tokenRef: "${env:SPOTIFY_CLIENT_ID}",
    suggestedTags: ["media"]
  },
  {
    id: "youtube-transcript",
    name: "YouTube Transcript",
    description: "Fetch transcripts for YouTube videos.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "youtube-transcript-mcp"],
    suggestedTags: ["media"]
  },
  {
    id: "google-maps",
    name: "Google Maps",
    description: "Geocoding, directions, and places via Google Maps.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-google-maps"],
    tokenRef: "${env:GOOGLE_MAPS_API_KEY}",
    suggestedTags: ["maps"]
  },
  {
    id: "amap",
    name: "Amap",
    description: "Chinese maps, geocoding, and routing via Amap.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@amap/amap-maps-mcp-server"],
    tokenRef: "${env:AMAP_MAPS_API_KEY}",
    suggestedTags: ["maps"]
  },
  {
    id: "baidu-map",
    name: "Baidu Maps",
    description: "Chinese maps, geocoding, and routing via Baidu.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@baidumap/mcp-server-baidu-map"],
    tokenRef: "${env:BAIDU_MAP_API_KEY}",
    suggestedTags: ["maps"]
  },
  {
    id: "sentry",
    name: "Sentry",
    description: "Retrieve and triage Sentry issues.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@sentry/mcp-server"],
    tokenRef: "${env:SENTRY_AUTH_TOKEN}",
    suggestedTags: ["monitoring", "dev-tools"]
  },
  {
    id: "stripe",
    name: "Stripe",
    description: "Query and manage Stripe payments and customers.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@stripe/mcp"],
    tokenRef: "${env:STRIPE_SECRET_KEY}",
    suggestedTags: ["finance"]
  },
  {
    id: "hubspot",
    name: "HubSpot",
    description: "Read and update HubSpot CRM records.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@hubspot/mcp-server"],
    tokenRef: "${env:HUBSPOT_ACCESS_TOKEN}",
    suggestedTags: ["crm"]
  },
  {
    id: "shopify",
    name: "Shopify",
    description: "Query the Shopify Dev APIs and docs.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@shopify/dev-mcp"],
    suggestedTags: ["crm", "dev-tools"]
  },
  {
    id: "airbnb",
    name: "Airbnb",
    description: "Search Airbnb listings and details.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@openbnb/mcp-server-airbnb"],
    suggestedTags: ["web"]
  }
];
function searchDirectory(query) {
  const q = query.trim().toLowerCase();
  if (!q)
    return DIRECTORY$1;
  return DIRECTORY$1.filter((e) => e.name.toLowerCase().includes(q) || e.description.toLowerCase().includes(q) || e.suggestedTags.some((t) => t.toLowerCase().includes(q)));
}
const MIN_CATEGORY_ENTRIES = 3;
const CATEGORY_META = {
  files: {
    label: "File & document",
    description: "MCP servers that read, write, and convert local files and documents."
  },
  git: {
    label: "Git & version control",
    description: "MCP servers for Git and code hosting — GitHub, GitLab, and local repositories."
  },
  database: {
    label: "Database",
    description: "MCP servers that query and manage SQL, NoSQL, and vector databases."
  },
  web: {
    label: "Web & scraping",
    description: "MCP servers that fetch, crawl, and scrape the web into clean text."
  },
  search: {
    label: "Search",
    description: "MCP servers that run web, neural, and research search."
  },
  browser: {
    label: "Browser automation",
    description: "MCP servers that drive real browsers for automation and testing."
  },
  ai: {
    label: "AI & reasoning",
    description: "MCP servers for memory, reasoning, embeddings, and generation."
  },
  memory: { label: "Memory", description: "MCP servers that give the model persistent memory." },
  productivity: {
    label: "Productivity & docs",
    description: "MCP servers for notes, tasks, issues, and knowledge tools."
  },
  communication: {
    label: "Communication",
    description: "MCP servers for chat, email, and messaging."
  },
  cloud: {
    label: "Cloud & infrastructure",
    description: "MCP servers for cloud platforms and infrastructure."
  },
  monitoring: {
    label: "Monitoring",
    description: "MCP servers for errors, logs, and observability."
  },
  maps: { label: "Maps & location", description: "MCP servers for maps, geocoding, and routing." },
  media: {
    label: "Media & design",
    description: "MCP servers for images, audio, video, and design."
  },
  "dev-tools": {
    label: "Developer tools",
    description: "MCP servers for coding, running, and shipping software."
  },
  finance: {
    label: "Finance & payments",
    description: "MCP servers for payments and financial data."
  },
  crm: {
    label: "CRM & business",
    description: "MCP servers for CRM, commerce, and business apps."
  },
  automation: {
    label: "Automation",
    description: "MCP servers that automate multi-step workflows."
  },
  data: {
    label: "Data & analytics",
    description: "MCP servers for analytics, charts, and data warehouses."
  }
};
function entriesForCategory(id) {
  return DIRECTORY$1.filter((e) => e.suggestedTags.includes(id));
}
function categoryMeta(id) {
  const m = CATEGORY_META[id];
  return { id, label: (m == null ? void 0 : m.label) ?? id, description: (m == null ? void 0 : m.description) ?? `MCP servers tagged ${id}.` };
}
function allCategoryIds() {
  const counts = /* @__PURE__ */ new Map();
  for (const e of DIRECTORY$1)
    for (const t of e.suggestedTags)
      counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a) || a.localeCompare(b));
}
function categoriesWithPages() {
  return allCategoryIds().filter((id) => entriesForCategory(id).length >= MIN_CATEGORY_ENTRIES).map(categoryMeta);
}
function categoryHasPage(id) {
  return entriesForCategory(id).length >= MIN_CATEGORY_ENTRIES;
}
const PolicyRuleSchema = z.object({
  name: z.string().optional(),
  package: z.string().optional(),
  namespace: z.string().optional(),
  url: z.string().optional(),
  /** Human-readable reason, surfaced in violation provenance. */
  description: z.string().optional()
}).strict().refine((r) => Boolean(r.name || r.package || r.namespace || r.url), {
  message: "a policy rule needs at least one matcher (name/package/namespace/url)"
});
z.object({
  $schema: z.string().optional(),
  version: z.literal(1),
  /**
   * `permissive` (default): a denylist — only servers matching a `deny` rule are blocked, and a
   * violating server is stripped from a fold with a loud warning. `strict`: an allowlist — a
   * server must match an `allow` rule (and no `deny` rule), and any violation hard-fails.
   */
  mode: z.enum(["strict", "permissive"]).default("permissive"),
  allow: z.array(PolicyRuleSchema).default([]),
  deny: z.array(PolicyRuleSchema).default([])
}).strict();
const __vite_glob_0_0 = "---\ntitle: Introducing mcpfold\ndate: 2026-07-08\ndescription: One source of truth for your MCP servers — write once, fold out to every client, without paying the context-window tax.\n---\n\nMCP config has a sprawl problem. Every client stores its servers differently — Cursor and Claude\nuse `mcpServers`, VS Code uses `servers` with `${input:}` secrets, Zed uses `context_servers`,\nWindsurf can't even call authenticated remotes natively. So you copy-paste the same servers into\nfive files, hardcode tokens into plaintext JSON, and every server you add dumps its full tool\nschema into your agent's context on every turn — used or not.\n\n**mcpfold keeps one canonical `mcp.config.jsonc` and folds it out to every client**, each in its\nown format. Secrets are references (`${env:…}`), never values, so nothing sensitive lands on disk.\nAnd a local proxy curates each server's toolset per client, so connecting everything doesn't tax\nyour context window.\n\n## The wedge\n\n```bash\nnpx mcpfold init      # scaffold your canonical config\nnpx mcpfold import    # adopt the configs you already have\nnpx mcpfold sync      # fold it out to every client\n```\n\n`diff` gates drift in CI, `doctor` catches the silent footguns, and `sync --watch` keeps every\nclient current as a background habit. It's MIT-licensed and runs entirely on your machine — no\naccount required.\n\n## Why now\n\nAgents are only as useful as the tools they can reach, and the client ecosystem is fragmenting\nfast. Breadth is the moat: mcpfold folds to eight clients today and adding one is a one-PR job.\nRead the [context-window benchmark](/blog/the-context-window-tax) for the numbers, or just\n[install it](/install) and fold your first config in under a minute.\n";
const __vite_glob_0_1 = "---\ntitle: The context-window tax\ndate: 2026-07-07\ndescription: How much of your agent's context does MCP tool-schema JSON consume — and how much does per-tool curation cut it? A reproducible benchmark.\n---\n\nEvery MCP server you connect advertises its tools by dumping their full JSON schemas into the\nmodel's context on every turn — whether the agent uses them or not. Connect enough servers and a\nmeaningful slice of the window is gone before the model reads a single line of your actual problem.\nWe call it the context-window tax.\n\n## The method\n\nWe measured a representative three-server setup — github (20 tools), supabase (15), playwright\n(10): **45 tools total** — serializing each server's `tools/list` payload before and after\nmcpfold's per-tool curation. The tokenizer is the widely-cited approximation of **1 token ≈ 4\ncharacters** of JSON. Exact counts vary by model, but the _relative_ reduction is stable because\nboth sides are measured identically.\n\n## The result\n\nCurating down to the **9 tools** actually needed cuts tool-schema tokens by **~80%**\n(**7,476 → 1,497**). No extra configuration — the shim already in the launch path does the\nfiltering, so the win is free.\n\n> Curation turns \"connect every server\" from a context-window tax into a cheap, fast, focused\n> toolset.\n\nReproduce it yourself with `pnpm --filter @mcpfold/proxy bench`, or try the\n[interactive calculator](/) on the homepage. Full methodology lives in the\n[benchmark docs](/docs/benchmark.html).\n";
const files = /* @__PURE__ */ Object.assign({
  "../../content/blog/introducing-mcpfold.md": __vite_glob_0_0,
  "../../content/blog/the-context-window-tax.md": __vite_glob_0_1
});
function parseFrontmatter(raw) {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw);
  if (!m) return { meta: {}, body: raw };
  const meta2 = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) meta2[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta: meta2, body: m[2] ?? "" };
}
const POSTS = Object.entries(files).map(([path, raw]) => {
  const slug = (path.split("/").pop() ?? "").replace(/\.md$/, "");
  const { meta: meta2, body } = parseFrontmatter(raw);
  return {
    slug,
    title: meta2.title ?? slug,
    date: meta2.date ?? "",
    description: meta2.description ?? "",
    html: marked.parse(body, { async: false })
  };
}).sort((a, b) => b.date.localeCompare(a.date));
function postBySlug(slug) {
  return POSTS.find((p) => p.slug === slug);
}
const GUIDE_CLIENTS = [
  {
    "id": "claude-code",
    "label": "Claude Code",
    "configRoot": "mcpServers",
    "secretStrategy": "shim",
    "needsRestart": false,
    "remote": {
      "nativeHttp": true,
      "nativeOauth": true,
      "fieldShape": "type+url"
    },
    "paths": {
      "macos": "/Users/you/.claude.json",
      "windows": "C:\\Users\\you\\.claude.json",
      "linux": "/home/you/.claude.json"
    }
  },
  {
    "id": "claude-desktop",
    "label": "Claude Desktop",
    "configRoot": "mcpServers",
    "secretStrategy": "shim",
    "needsRestart": true,
    "remote": {
      "nativeHttp": false,
      "nativeOauth": false,
      "fieldShape": "shim"
    },
    "paths": {
      "macos": "/Users/you/Library/Application Support/Claude/claude_desktop_config.json",
      "windows": "C:\\Users\\you\\AppData\\Roaming\\Claude\\claude_desktop_config.json",
      "linux": "/home/you/.config/Claude/claude_desktop_config.json"
    }
  },
  {
    "id": "cursor",
    "label": "Cursor",
    "configRoot": "mcpServers",
    "secretStrategy": "shim",
    "needsRestart": false,
    "remote": {
      "nativeHttp": true,
      "nativeOauth": true,
      "fieldShape": "url"
    },
    "paths": {
      "macos": "/Users/you/.cursor/mcp.json",
      "windows": "C:\\Users\\you\\.cursor\\mcp.json",
      "linux": "/home/you/.cursor/mcp.json"
    }
  },
  {
    "id": "vscode",
    "label": "VS Code",
    "configRoot": "servers",
    "secretStrategy": "native-input",
    "needsRestart": false,
    "remote": {
      "nativeHttp": true,
      "nativeOauth": true,
      "fieldShape": "type+url"
    },
    "paths": {
      "macos": "/Users/you/Library/Application Support/Code/User/mcp.json",
      "windows": "C:\\Users\\you\\AppData\\Roaming\\Code\\User\\mcp.json",
      "linux": "/home/you/.config/Code/User/mcp.json"
    }
  },
  {
    "id": "windsurf",
    "label": "Windsurf",
    "configRoot": "mcpServers",
    "secretStrategy": "shim",
    "needsRestart": true,
    "remote": {
      "nativeHttp": true,
      "nativeOauth": false,
      "fieldShape": "url"
    },
    "paths": {
      "macos": "/Users/you/.codeium/windsurf/mcp_config.json",
      "windows": "C:\\Users\\you\\.codeium\\windsurf\\mcp_config.json",
      "linux": "/home/you/.codeium/windsurf/mcp_config.json"
    }
  },
  {
    "id": "zed",
    "label": "Zed",
    "configRoot": "context_servers",
    "secretStrategy": "shim",
    "needsRestart": false,
    "remote": {
      "nativeHttp": true,
      "nativeOauth": true,
      "fieldShape": "url"
    },
    "paths": {
      "macos": "/Users/you/.config/zed/settings.json",
      "windows": "C:\\Users\\you\\AppData\\Roaming\\Zed\\settings.json",
      "linux": "/home/you/.config/zed/settings.json"
    }
  },
  {
    "id": "cline",
    "label": "Cline",
    "configRoot": "mcpServers",
    "secretStrategy": "shim",
    "needsRestart": false,
    "remote": {
      "nativeHttp": true,
      "nativeOauth": true,
      "fieldShape": "url"
    },
    "paths": {
      "macos": "/Users/you/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json",
      "windows": "C:\\Users\\you\\AppData\\Roaming\\Code\\User\\globalStorage\\saoudrizwan.claude-dev\\settings\\cline_mcp_settings.json",
      "linux": "/home/you/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json"
    }
  },
  {
    "id": "gemini-cli",
    "label": "Gemini CLI",
    "configRoot": "mcpServers",
    "secretStrategy": "shim",
    "needsRestart": false,
    "remote": {
      "nativeHttp": true,
      "nativeOauth": true,
      "fieldShape": "httpUrl"
    },
    "paths": {
      "macos": "/Users/you/.gemini/settings.json",
      "windows": "C:\\Users\\you\\.gemini\\settings.json",
      "linux": "/home/you/.gemini/settings.json"
    }
  },
  {
    "id": "jetbrains",
    "label": "JetBrains",
    "configRoot": "mcpServers",
    "secretStrategy": "shim",
    "needsRestart": false,
    "remote": {
      "nativeHttp": true,
      "nativeOauth": true,
      "fieldShape": "url"
    },
    "paths": {
      "macos": "/Users/you/.junie/mcp/mcp.json",
      "windows": "C:\\Users\\you\\.junie\\mcp\\mcp.json",
      "linux": "/home/you/.junie/mcp/mcp.json"
    }
  },
  {
    "id": "visual-studio",
    "label": "Visual Studio",
    "configRoot": "servers",
    "secretStrategy": "native-input",
    "needsRestart": false,
    "remote": {
      "nativeHttp": true,
      "nativeOauth": true,
      "fieldShape": "type+url"
    },
    "paths": {
      "macos": "/Users/you/.mcp.json",
      "windows": "C:\\Users\\you\\.mcp.json",
      "linux": "/home/you/.mcp.json"
    }
  },
  {
    "id": "continue",
    "label": "Continue",
    "configRoot": "mcpServers",
    "secretStrategy": "shim",
    "needsRestart": false,
    "remote": {
      "nativeHttp": true,
      "nativeOauth": true,
      "fieldShape": "url"
    },
    "paths": {
      "macos": "/Users/you/.continue/mcpServers/mcpfold.json",
      "windows": "C:\\Users\\you\\.continue\\mcpServers\\mcpfold.json",
      "linux": "/home/you/.continue/mcpServers/mcpfold.json"
    }
  },
  {
    "id": "roo-code",
    "label": "Roo Code",
    "configRoot": "mcpServers",
    "secretStrategy": "shim",
    "needsRestart": false,
    "remote": {
      "nativeHttp": true,
      "nativeOauth": true,
      "fieldShape": "url"
    },
    "paths": {
      "macos": "/Users/you/Library/Application Support/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/cline_mcp_settings.json",
      "windows": "C:\\Users\\you\\AppData\\Roaming\\Code\\User\\globalStorage\\rooveterinaryinc.roo-cline\\settings\\cline_mcp_settings.json",
      "linux": "/home/you/.config/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/cline_mcp_settings.json"
    }
  },
  {
    "id": "goose",
    "label": "Goose",
    "configRoot": "extensions",
    "secretStrategy": "shim",
    "needsRestart": false,
    "remote": {
      "nativeHttp": true,
      "nativeOauth": true,
      "fieldShape": "url"
    },
    "paths": {
      "macos": "/Users/you/.config/goose/config.yaml",
      "windows": "C:\\Users\\you\\AppData\\Roaming\\Block\\goose\\config\\config.yaml",
      "linux": "/home/you/.config/goose/config.yaml"
    }
  },
  {
    "id": "codex-cli",
    "label": "Codex CLI",
    "configRoot": "mcp_servers",
    "secretStrategy": "shim",
    "needsRestart": false,
    "remote": {
      "nativeHttp": true,
      "nativeOauth": true,
      "fieldShape": "url"
    },
    "paths": {
      "macos": "/Users/you/.codex/config.toml",
      "windows": "C:\\Users\\you\\.codex\\config.toml",
      "linux": "/home/you/.codex/config.toml"
    }
  },
  {
    "id": "lm-studio",
    "label": "LM Studio",
    "configRoot": "mcpServers",
    "secretStrategy": "shim",
    "needsRestart": false,
    "remote": {
      "nativeHttp": true,
      "nativeOauth": true,
      "fieldShape": "url"
    },
    "paths": {
      "macos": "/Users/you/.lmstudio/mcp.json",
      "windows": "C:\\Users\\you\\.lmstudio\\mcp.json",
      "linux": "/home/you/.lmstudio/mcp.json"
    }
  },
  {
    "id": "warp",
    "label": "Warp",
    "configRoot": "mcpServers",
    "secretStrategy": "shim",
    "needsRestart": false,
    "remote": {
      "nativeHttp": true,
      "nativeOauth": true,
      "fieldShape": "url"
    },
    "paths": {
      "macos": "/Users/you/.warp/.mcp.json",
      "windows": "C:\\Users\\you\\.warp\\.mcp.json",
      "linux": "/home/you/.warp/.mcp.json"
    }
  },
  {
    "id": "opencode",
    "label": "opencode",
    "configRoot": "mcp",
    "secretStrategy": "shim",
    "needsRestart": false,
    "remote": {
      "nativeHttp": true,
      "nativeOauth": true,
      "fieldShape": "url"
    },
    "paths": {
      "macos": "/Users/you/.config/opencode/opencode.json",
      "windows": "C:\\Users\\you\\.config\\opencode\\opencode.json",
      "linux": "/home/you/.config/opencode/opencode.json"
    }
  },
  {
    "id": "copilot-cli",
    "label": "Copilot CLI",
    "configRoot": "mcpServers",
    "secretStrategy": "shim",
    "needsRestart": false,
    "remote": {
      "nativeHttp": true,
      "nativeOauth": true,
      "fieldShape": "type+url"
    },
    "paths": {
      "macos": "/Users/you/.copilot/mcp-config.json",
      "windows": "C:\\Users\\you\\.copilot\\mcp-config.json",
      "linux": "/home/you/.copilot/mcp-config.json"
    }
  }
];
function guideById(id) {
  return GUIDE_CLIENTS.find((c) => c.id === id);
}
const GLOSSARY = [
  {
    id: "mcp-server",
    term: "MCP server",
    heading: "What is an MCP server?",
    aka: ["MCP servers", "model context protocol server"],
    short: "An MCP server is a program that exposes tools, resources, and prompts to AI applications over the Model Context Protocol, so any compatible client can use its capabilities.",
    body: [
      "An MCP server wraps some capability — reading files, querying a database, searching the web, calling an API — and advertises it through the Model Context Protocol. When an AI application connects, the server tells it which tools and resources are available, and the model can then invoke them during a conversation.",
      "Servers run either locally as a subprocess the client launches over stdio, or remotely as an HTTP service the client connects to. The same server can be used by many different clients, because they all speak the one protocol.",
      "With mcpfold you declare each MCP server once in a single config file and fold that out to every client you use, instead of adding the server by hand in each application separately."
    ],
    related: [
      { href: "/directory", text: "Browse the MCP server directory" },
      { href: "/install", text: "Install mcpfold" },
      { href: "/docs/config-format.html", text: "The config format" }
    ]
  },
  {
    id: "model-context-protocol",
    term: "Model Context Protocol",
    heading: "What is the Model Context Protocol?",
    aka: ["MCP", "model context protocol"],
    short: "The Model Context Protocol (MCP) is an open standard for connecting AI applications to external tools and data sources through a common client–server interface.",
    body: [
      "The Model Context Protocol defines how an AI application (the client) and a capability provider (the server) exchange messages: how a server advertises its tools, resources, and prompts, and how a client calls them. Because the interface is standardized, any compliant client can work with any compliant server.",
      "The protocol was introduced by Anthropic in late 2024 and is published as an open specification that anyone can implement. mcpfold is an independent tool built on top of the protocol and is not affiliated with or endorsed by the MCP project.",
      "A growing set of clients — including Claude Code, Cursor, VS Code, and many others — implement MCP, which is what lets one mcpfold config serve all of them."
    ],
    related: [
      { href: "/glossary/mcp-server", text: "What is an MCP server?" },
      { href: "/glossary/mcp-client", text: "What is an MCP client?" },
      { href: "/directory", text: "MCP server directory" }
    ]
  },
  {
    id: "mcp-client",
    term: "MCP client",
    heading: "What is an MCP client?",
    aka: ["MCP clients", "model context protocol client"],
    short: "An MCP client is the part of an AI application — an editor, chat app, or agent — that connects to MCP servers and lets the model use their tools.",
    body: [
      "The client is the consumer side of the Model Context Protocol. It launches or connects to one or more MCP servers, discovers the tools they expose, and mediates the model’s calls to those tools. Each client stores its MCP configuration in its own file and format.",
      "Editors and assistants such as Claude Code, Cursor, VS Code, Windsurf, and Zed are all MCP clients. Because each keeps its own config, adding a server everywhere normally means editing many different files.",
      "mcpfold renders each client’s native config from one canonical source, so the same servers appear in every client without per-client hand-editing."
    ],
    related: [
      { href: "/directory", text: "MCP server directory" },
      { href: "/glossary/mcp-config-manager", text: "What is an MCP config manager?" },
      { href: "/install", text: "Install mcpfold" }
    ]
  },
  {
    id: "mcp-tools",
    term: "MCP tools",
    heading: "What are MCP tools?",
    aka: ["MCP tool", "tools"],
    short: "MCP tools are the individual actions an MCP server exposes to a model — each with a name, a description, and a JSON-Schema definition of its inputs.",
    body: [
      "When a client connects to a server, the server lists its tools. Each tool has a machine-readable schema so the model knows what arguments it takes, and a description so the model knows when to use it. The model can then choose to call a tool, and the server runs it and returns the result.",
      "Every tool a server advertises adds its schema to the model’s context, whether or not it is ever used. Loading many servers can therefore consume a large share of the context window.",
      "mcpfold lets you allow- or deny-list tools per server, so only the tools you actually need are exposed — keeping the context window lean."
    ],
    related: [
      { href: "/glossary/context-window", text: "What is a context window?" },
      { href: "/docs/benchmark.html", text: "The token-savings benchmark" },
      { href: "/directory", text: "MCP server directory" }
    ]
  },
  {
    id: "context-window",
    term: "Context window",
    heading: "What is a context window?",
    aka: ["context window", "context length"],
    short: "A context window is the maximum amount of text, measured in tokens, that a language model can consider at once — including every MCP tool schema loaded into it.",
    body: [
      "A model can only reason over what fits in its context window. That budget is shared across the system prompt, the conversation, any retrieved content, and the schemas of every tool the connected MCP servers expose.",
      "Because tool schemas are counted whether or not the tools are used, connecting many MCP servers can quietly spend a meaningful fraction of the window before the real work begins.",
      "Curating which servers and tools load — the core of what mcpfold does — keeps more of the context window available for the task at hand. The committed benchmark quantifies the savings."
    ],
    related: [
      { href: "/glossary/mcp-tools", text: "What are MCP tools?" },
      { href: "/docs/benchmark.html", text: "See the benchmark" }
    ]
  },
  {
    id: "secret-reference",
    term: "Secret reference",
    heading: "What is a secret reference?",
    aka: ["secret references", "secret placeholder"],
    short: "A secret reference is a placeholder such as ${env:GITHUB_TOKEN} that points to a secret stored elsewhere, so the raw value is never written into a config file.",
    body: [
      "Instead of pasting an API key or token directly into a client’s MCP config, a secret reference names where the value lives — an environment variable, a dotenv file, or a secret manager such as 1Password or Infisical. The config carries only the reference.",
      "mcpfold resolves each reference at fold time, from your environment or secret manager, so nothing sensitive is written to a client config or committed to git. Some clients can even receive the reference natively via their own input mechanism.",
      "This keeps credentials out of the files that are most likely to be shared, synced, or accidentally checked in."
    ],
    related: [
      { href: "/docs/secrets.html", text: "How secrets work" },
      { href: "/security", text: "Security & trust" }
    ]
  },
  {
    id: "mcp-config-manager",
    term: "MCP config manager",
    heading: "What is an MCP config manager?",
    aka: ["MCP configuration manager", "MCP config tool"],
    short: "An MCP config manager is a tool that maintains your MCP servers in one source of truth and applies that configuration across every client, instead of hand-editing a separate file per application.",
    body: [
      "As soon as you use more than one MCP client, each keeps its own configuration file in its own format. Adding, removing, or updating a server means repeating the edit everywhere and keeping the copies in sync by hand.",
      "An MCP config manager centralizes that: you declare each server once, and the tool renders each client’s native config from the single source. Secrets stay as references, versions can be pinned, and drift between clients disappears.",
      "mcpfold is an MCP config manager: one canonical mcp.config.jsonc, folded out to every supported client with one command."
    ],
    related: [
      { href: "/install", text: "Install mcpfold" },
      { href: "/directory", text: "MCP server directory" },
      { href: "/glossary/mcp-client", text: "What is an MCP client?" }
    ]
  }
];
function termById(id) {
  return GLOSSARY.find((t) => t.id === id);
}
const COMPARISONS = [
  {
    id: "manual-vs-mcpfold",
    navLabel: "By hand vs mcpfold",
    metaTitle: "Managing MCP servers by hand vs mcpfold · comparison",
    h1: "Managing MCP servers by hand vs mcpfold",
    intro: "Editing each client’s MCP config by hand is perfectly reasonable for a single tool, but mcpfold pays off as soon as you run more than one MCP client: you keep one canonical config and fold it out to all of them, with secrets kept as references instead of pasted into files.",
    table: {
      columns: ["By hand", "mcpfold"],
      rows: [
        {
          dimension: "Source of truth",
          cells: ["A separate config file per client", "One canonical mcp.config.jsonc"]
        },
        {
          dimension: "Adding a server",
          cells: ["Edit each client’s file yourself", "mcpfold add, then sync to every client"]
        },
        {
          dimension: "Secrets",
          cells: [
            "Pasted into each client’s config file",
            "${env:…} / ${op:…} references resolved at fold time"
          ]
        },
        {
          dimension: "Keeping clients in sync",
          cells: ["Copy changes between files by hand", "One mcpfold sync"]
        },
        {
          dimension: "Curating tools per server",
          cells: ["Hand-edit each client’s JSON", "Allow / deny-list tools per server"]
        },
        {
          dimension: "Runs where",
          cells: ["In each client", "Locally, as a CLI"]
        },
        {
          dimension: "Cost",
          cells: ["Free", "Free, MIT-licensed CLI"]
        }
      ]
    },
    body: [
      "If you only use one MCP client, editing its config directly is a fine choice — there is nothing to fold out, and no tool to add. The case for mcpfold grows with each additional client you keep in sync.",
      "mcpfold is a local-first CLI. It adds one tool to install and learn, in exchange for removing the per-client copy-paste and keeping secrets out of config files. Everything it does happens on your own machine.",
      "mcpfold is deliberately not a hosted service or an enterprise gateway: there is no server-side access control, org audit, or hosted MCP servers. If you opt into the optional cloud for sharing config across a team, only the config with secret references is ever synced — never the secret values themselves."
    ],
    related: [
      { href: "/install", text: "Install mcpfold" },
      { href: "/directory", text: "Browse the MCP server directory" },
      { href: "/compare/mcp-config-manager", text: "Where mcpfold fits" }
    ]
  },
  {
    id: "mcp-config-manager",
    navLabel: "Where mcpfold fits",
    metaTitle: "MCP config manager — where mcpfold fits · comparison",
    h1: "MCP config manager: where mcpfold fits",
    intro: "An MCP config manager keeps your MCP servers in one place and applies them across clients. mcpfold is a local-first, open-source config manager — one config folded out to every client, with per-server tool curation and secret references — as distinct from hosted MCP gateways that run servers for a team.",
    table: {
      columns: ["By hand", "Hosted MCP gateway", "mcpfold"],
      rows: [
        {
          dimension: "Runs where",
          cells: ["In each client’s file", "On a hosted server", "Locally, as a CLI"]
        },
        {
          dimension: "One source for many clients",
          cells: ["No", "Varies by tool", "Yes — folds to each client’s native format"]
        },
        {
          dimension: "Team RBAC / org audit",
          cells: ["No", "Yes — their focus", "Not a goal — local-first"]
        },
        {
          dimension: "Hosted / managed servers",
          cells: ["No", "Yes — their focus", "No — you run your own"]
        },
        {
          dimension: "Secret handling",
          cells: [
            "Pasted into files",
            "Stored by the service",
            "References resolved locally; values never synced"
          ]
        },
        {
          dimension: "Per-server tool curation",
          cells: ["Manual", "Varies by tool", "Allow / deny lists"]
        },
        {
          dimension: "Open source",
          cells: ["n/a", "Varies by tool", "Yes — MIT, free CLI"]
        },
        {
          dimension: "Best for",
          cells: [
            "A single client",
            "Teams wanting a managed gateway",
            "Anyone using multiple clients locally"
          ]
        }
      ]
    },
    body: [
      "Hosted MCP gateways — for example Composio or MintMCP — run MCP servers for a team and add server-side features such as role-based access control and organization audit logs. That is a different job from mcpfold’s, and for teams that want a managed, multi-tenant gateway those tools fit better.",
      "mcpfold stays local-first by design: it manages MCP configuration on your machine and folds it out to your own clients, with tool curation and secret references. It is not a hosted gateway and does not aim to be — no hosted servers, no server-side access control.",
      "If you want one honest source of truth for your own MCP config across every client you use, that is what mcpfold is for. If you want a hosted gateway that runs servers for an organization, a tool built for that will serve you better — the two are complementary, not competitors."
    ],
    related: [
      { href: "/install", text: "Install mcpfold" },
      { href: "/pricing", text: "Pricing (free CLI, optional cloud)" },
      { href: "/compare/manual-vs-mcpfold", text: "By hand vs mcpfold" }
    ]
  },
  {
    id: "reduce-mcp-token-usage",
    navLabel: "Cut MCP token usage",
    metaTitle: "How to reduce MCP token usage — every approach compared",
    h1: "How to reduce MCP token usage",
    intro: "Reducing MCP token usage means cutting the tool-schema JSON that every connected MCP server loads into the model’s context on each turn — whether the agent uses those tools or not. The main approaches are native tool-search (the model loads tools on demand), schema/response compression, code execution, and deterministic per-client curation. mcpfold takes the curation approach: from one canonical config it loads only the tools each client needs, so the reduction is explicit, reproducible, and works on every client — including Cursor, Windsurf, and Zed, which have no native tool-search.",
    table: {
      columns: ["Native tool-search", "Schema / response compression", "Code execution", "mcpfold"],
      rows: [
        {
          dimension: "What it does",
          cells: [
            "The model searches the tool catalog and loads a few tools on demand",
            "A proxy shrinks tool schemas and/or trims tool outputs",
            "The agent writes code that calls tools, processing data before returning it",
            "You curate which servers and tools each client loads, from one config"
          ]
        },
        {
          dimension: "Deterministic (same tools every run)",
          cells: [
            "No — selection is model-driven and can vary",
            "Yes — the same transform each run",
            "Partly — depends on the generated code",
            "Yes — an explicit allow / deny list"
          ]
        },
        {
          dimension: "Works across every client",
          cells: [
            "No — only clients and models that ship it",
            "Varies by proxy",
            "No — needs a code-execution runtime",
            "Yes — folds to every MCP client from one config"
          ]
        },
        {
          dimension: "Ties you to a model or platform",
          cells: [
            "Yes — specific models / clients",
            "No",
            "Somewhat — needs a sandbox",
            "No — client- and model-agnostic"
          ]
        },
        {
          dimension: "Extra service to run",
          cells: [
            "No — built in",
            "Yes — a proxy",
            "Yes — a sandbox",
            "No — a local CLI already in the launch path"
          ]
        },
        {
          dimension: "Open source",
          cells: ["No — a vendor feature", "Often", "Varies", "Yes — MIT"]
        },
        {
          dimension: "Best for",
          cells: [
            "One supported client where model-driven selection is fine",
            "Large tool schemas or noisy tool outputs",
            "Data-heavy, multi-step tool pipelines",
            "Multiple clients, or when you want deterministic, auditable tool sets"
          ]
        }
      ]
    },
    body: [
      "The cost is real: a handful of busy MCP servers can spend thousands of tokens on tool definitions before the agent does any work. Anthropic measured an ~85% token reduction when Claude loads tools on demand instead of loading every definition up front — a figure that shows how large the untrimmed baseline is. mcpfold’s own reproducible benchmark trims a representative 45-tool setup down to the 9 tools actually needed and cuts tool-schema tokens by ~80%, with no extra configuration because the shim already in the launch path does the filtering.",
      "Which approach to pick: if you use a single client whose model ships native tool-search and you are comfortable with model-driven selection, that built-in feature is the simplest path. If you run more than one client — or use Cursor, Windsurf, or Zed, which have no native tool-search — deterministic per-client curation with mcpfold is the option that works everywhere from one source of truth. If your problem is giant tool outputs rather than too many tools, add a response-filtering proxy; if you run data-heavy multi-step pipelines, code execution goes furthest. These approaches stack.",
      "mcpfold’s wedge is determinism and reach. Native tool-search searches the catalog and loads tools by inference, which is convenient but non-deterministic and can miss a tool; mcpfold curates an explicit allow / deny set, so the toolset is the same on every run and is auditable in a code review or CI gate. And it curates from one canonical config across every MCP client, rather than being a per-platform feature.",
      "mcpfold composes with native tool-search rather than replacing it: mcpfold decides which servers and tools reach a client at all, and any native tool-search then operates on a smaller, cleaner set. It is deliberately not a schema-compression proxy or a code-execution runtime — for those jobs, the tools built for them fit better, and mcpfold sits happily in front of them."
    ],
    related: [
      { href: "/compare/mcpfold-vs-tool-search", text: "mcpfold vs native tool-search" },
      { href: "/features/tool-curation", text: "Per-server tool curation" },
      { href: "/install", text: "Install mcpfold" },
      { href: "/directory", text: "Browse the MCP server directory" }
    ]
  },
  {
    id: "mcpfold-vs-tool-search",
    navLabel: "vs native tool-search",
    metaTitle: "mcpfold vs native MCP tool-search (deferred tool loading)",
    h1: "mcpfold vs native tool-search",
    intro: "Native tool-search (Anthropic’s Tool Search Tool, OpenAI’s deferred tool loading, GitHub Copilot’s virtual tools) lets the model load MCP tools on demand instead of loading every definition up front, cutting context tokens. mcpfold reaches the same goal by deterministic curation: from one config it loads only the tools each client needs. They are complementary — use mcpfold to trim what reaches a client, and native tool-search to search whatever remains — and mcpfold also covers the clients that have no native tool-search at all.",
    table: {
      columns: ["Native tool-search", "mcpfold"],
      rows: [
        {
          dimension: "How tools are chosen",
          cells: [
            "The model searches the catalog and loads a few on demand",
            "You declare an allow / deny set per client"
          ]
        },
        {
          dimension: "Deterministic",
          cells: ["No — model-driven, can vary run to run", "Yes — the same toolset every run"]
        },
        {
          dimension: "Auditable in review / CI",
          cells: ["Hard — selection happens at inference time", "Yes — the set is in your config"]
        },
        {
          dimension: "Client / model coverage",
          cells: [
            "Only clients and models that ship it (not Cursor, Windsurf, Zed)",
            "Every MCP client, from one config"
          ]
        },
        {
          dimension: "Setup",
          cells: ["Built into the platform", "A local CLI in the launch path"]
        },
        {
          dimension: "Use them together",
          cells: [
            "Searches whatever tools it is given",
            "Trims the catalog first, so search runs on a smaller, cleaner set"
          ]
        }
      ]
    },
    body: [
      "Native tool-search is a genuine improvement and, where a client ships it, worth turning on — Anthropic reports large token reductions when Claude loads tools on demand. Its trade-off is that selection is model-driven: which tools load can vary between runs, and the mechanism only exists on the clients and models that implement it.",
      "mcpfold curates deterministically. You declare which servers and tools each client should ever see, and mcpfold folds that out to every client in its native format. The toolset is reproducible, reviewable in a pull request, and gateable in CI — the right fit for agents that must behave identically every run, and the only option on clients without native tool-search, such as Cursor (which caps tools and has no tool-search), Windsurf, and Zed.",
      "The two layers compose. Let mcpfold decide what reaches a client at all; let native tool-search search whatever remains. Using them together gives you a smaller, cleaner catalog and on-demand loading on top — better than either alone. mcpfold is not a replacement for native tool-search and does not try to be; it is the deterministic, cross-client config layer underneath it."
    ],
    related: [
      { href: "/compare/reduce-mcp-token-usage", text: "How to reduce MCP token usage" },
      { href: "/features/tool-curation", text: "Per-server tool curation" },
      { href: "/guides/cursor", text: "Add MCP servers to Cursor" },
      { href: "/install", text: "Install mcpfold" }
    ]
  }
];
function comparisonById(id) {
  return COMPARISONS.find((c) => c.id === id);
}
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}
function tool(name, description, props) {
  const properties = {};
  for (let i = 0; i < props; i++) {
    properties[`arg_${i}`] = {
      type: "string",
      description: `Parameter ${i} for ${name}: provide a well-formed value describing the ${i}th input.`
    };
  }
  return {
    name,
    description,
    inputSchema: { type: "object", properties, required: Object.keys(properties).slice(0, 1) }
  };
}
function makeTools(prefix, count) {
  return Array.from(
    { length: count },
    (_, i) => tool(`${prefix}_${i}`, `Perform operation ${i} on the ${prefix} service with typed inputs.`, 4)
  );
}
const FIXTURE_SERVERS = [
  { name: "github", toolCount: 20 },
  { name: "supabase", toolCount: 15 },
  { name: "playwright", toolCount: 10 }
];
function compute(servers, keepPerServer) {
  let toolsBefore = 0;
  let toolsAfter = 0;
  let tokensBefore = 0;
  let tokensAfter = 0;
  for (const s of servers) {
    const all = makeTools(s.name, s.toolCount);
    const keep = Math.min(keepPerServer, all.length);
    const after = all.slice(0, keep);
    toolsBefore += all.length;
    toolsAfter += after.length;
    tokensBefore += estimateTokens(JSON.stringify(all));
    tokensAfter += estimateTokens(JSON.stringify(after));
  }
  const reductionPct = tokensBefore === 0 ? 0 : Math.round((1 - tokensAfter / tokensBefore) * 100);
  return { toolsBefore, toolsAfter, tokensBefore, tokensAfter, reductionPct };
}
const CLIENT_COUNT = CLIENT_IDS.length;
const bench = compute(FIXTURE_SERVERS, 3);
const FEATURES = [
  {
    id: "one-config",
    nav: "One config, every client",
    h1: "One config, folded out to every client",
    metaTitle: "One MCP config for every client — mcpfold",
    tagline: `Write your MCP servers once in a single canonical config, and mcpfold renders each client's own native format — so the same servers show up in all ${CLIENT_COUNT} supported clients without hand-editing a different file for each.`,
    body: [
      `Every MCP client stores its servers in its own file and its own shape. The root key alone differs — VS Code uses \`servers\`, Zed uses \`context_servers\`, most others use \`mcpServers\`, Goose uses \`extensions\` — and the on-disk path, restart behavior, and remote-transport format vary too. Adding one server everywhere normally means learning ${CLIENT_COUNT} formats.`,
      "mcpfold quarantines all that per-client churn in a small adapter per client. You keep one canonical `mcp.config.jsonc`; `mcpfold sync` renders each client’s native file from it — byte-deterministically, preserving comments and any unmanaged keys in files clients share with non-MCP settings.",
      "Because the adapters are the single place the format traps live, adding a client is one small module, not an engine change — and the config you maintain never has to know the difference."
    ],
    example: {
      label: "One source of truth, folded to every client",
      code: `// mcp.config.jsonc — the one file you maintain
{
  "servers": {
    "github": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"] }
  }
}

$ mcpfold sync   # writes each client's native format (servers / context_servers / mcpServers …)`
    },
    docs: [
      { href: "/docs/config-format.html", text: "The config format" },
      { href: "/docs/adapters.html", text: "How adapters work" },
      { href: "/docs/coverage.html", text: "Adapter coverage matrix" }
    ],
    related: ["tool-curation", "sync-drift"]
  },
  {
    id: "tool-curation",
    nav: "Curate tools",
    h1: "Curate tools, cut the context-window tax",
    metaTitle: "Curate MCP tools, cut context tokens — mcpfold",
    tagline: `Every MCP server dumps its full tool schema into the model's context whether you use those tools or not. Allow- or deny-list tools per server and only what you need loads — the committed benchmark cuts ${bench.toolsBefore} tools to ${bench.toolsAfter} for about ${bench.reductionPct}% fewer tokens.`,
    body: [
      `A model can only reason over what fits in its context window, and that budget is shared with the schema of every tool the connected servers expose. In the published fixture — GitHub, Supabase, and Playwright — that is ${bench.toolsBefore} tools costing roughly ${bench.tokensBefore.toLocaleString("en-US")} tokens before you have done any work.`,
      `mcpfold's proxy lets you allow- or deny-list tools per server, so only the handful you actually use is advertised. Keeping three tools per server in that fixture drops it to ${bench.toolsAfter} tools and about ${bench.tokensAfter.toLocaleString("en-US")} tokens — roughly ${bench.reductionPct}% smaller. The number on this page is computed from the same committed benchmark methodology the docs publish, so the site and the benchmark can never disagree.`
    ],
    example: {
      label: "Keep only the tools you use",
      code: `{
  "servers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "tools": { "allow": ["search_issues", "get_file_contents", "create_pull_request"] }
    }
  }
}`
    },
    docs: [{ href: "/docs/benchmark.html", text: "The context-window benchmark" }],
    related: ["one-config", "secrets"]
  },
  {
    id: "secrets",
    nav: "Secrets as references",
    h1: "Secrets as references, never values",
    metaTitle: "MCP secrets as references, never values — mcpfold",
    tagline: "Your config carries ${env:…} / ${op:…} references instead of raw tokens, so nothing sensitive is ever written to a client config or committed to git. mcpfold resolves each reference at fold time, from your environment or secret manager.",
    body: [
      "A secret reference names where a value lives — an environment variable, a dotenv file, or a secret manager such as 1Password or Infisical, plus the OS keychain — instead of embedding the value. The config you edit and commit contains only the reference.",
      "At fold time mcpfold resolves references from the provider you chose and applies each client’s own secret strategy: a shim that resolves at launch, the client’s native input mechanism, or a direct write on your machine. The invariant holds throughout — a reference is never expanded into a value that gets synced to the cloud; only config with references is ever shared.",
      "The result is that credentials stay out of the files most likely to be shared, synced, or accidentally checked in."
    ],
    example: {
      label: "A reference, not a token",
      code: `{
  "servers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "\${op:GitHub/token}" }
    }
  }
}`
    },
    docs: [
      { href: "/docs/secrets.html", text: "How secrets work" },
      { href: "/security", text: "Security & trust" }
    ],
    related: ["one-config", "sync-drift"]
  },
  {
    id: "sync-drift",
    nav: "Sync & drift control",
    h1: "Sync, diff, and drift control",
    metaTitle: "MCP config sync, diff, and drift control — mcpfold",
    tagline: "See exactly what would change before you write it, fold your config out with one command, and catch drift when a client config wanders from the source — in your terminal or as a CI gate.",
    body: [
      "`mcpfold diff` shows the precise, per-client changes a fold would make before anything is written, so a sync is never a surprise. `mcpfold sync` then applies them deterministically, and can back up what it replaces so a change is always reversible.",
      "Because the canonical config is the source of truth, mcpfold can detect drift — a client file that was hand-edited away from the config — and report it. Run that check in CI as a gate so a repo’s committed MCP config and the clients it targets can never silently diverge.",
      "Import works the other way too: `mcpfold import` reads a client’s existing servers back into the canonical format, so adopting mcpfold never means retyping what you already have."
    ],
    example: {
      label: "Preview, apply, and guard against drift",
      code: `$ mcpfold diff          # what would change, per client — before writing anything
$ mcpfold sync          # apply it (with a backup of what was replaced)
$ mcpfold diff --check  # non-zero exit if any client drifted — use it as a CI gate`
    },
    docs: [
      { href: "/docs/cli-contract.html", text: "The CLI contract" },
      { href: "/docs/github-action.html", text: "The drift-check GitHub Action" }
    ],
    related: ["one-config", "secrets"]
  }
];
function featureById(id) {
  return FEATURES.find((f) => f.id === id);
}
const USE_CASES = [
  {
    id: "solo",
    nav: "Solo developers",
    h1: "mcpfold for solo developers",
    metaTitle: "mcpfold for solo developers — one MCP config across your clients",
    tagline: "If you use more than one AI client, mcpfold keeps your MCP servers in one config and folds them out to every client — so you set a server up once, not once per tool.",
    body: [
      "You run Claude Code, Cursor, and VS Code — and each keeps its MCP servers in its own file and its own shape. Adding one server everywhere means editing several config files by hand and keeping them in sync.",
      "With mcpfold you maintain one canonical `mcp.config.jsonc` and run `mcpfold sync`; each client’s native config is written from it. Curate the tools you actually use to keep your context window lean, and keep API tokens as `${env:…}` / `${op:…}` references instead of pasting them into config files.",
      "Everything runs locally on your machine — no account, no cloud required. Install it and import what you already have in one step."
    ],
    highlights: [
      {
        title: "One config, every client",
        text: "Write servers once; mcpfold renders each client’s native format."
      },
      {
        title: "Curate tools",
        text: "Allow/deny tools per server so only what you need loads."
      },
      {
        title: "Secrets as references",
        text: "Tokens stay as references, never written into a client config."
      },
      {
        title: "Local-first",
        text: "No account needed — the CLI is free and MIT-licensed."
      }
    ],
    primaryCta: { href: "/install", text: "Install mcpfold" },
    secondaryCta: { href: "/directory", text: "Browse the MCP server directory" },
    related: ["teams", "power-users"]
  },
  {
    id: "teams",
    nav: "Teams",
    h1: "mcpfold for teams",
    metaTitle: "mcpfold for teams — standardize MCP setup from one config",
    tagline: "Standardize your team’s MCP setup from one repo-committed config: everyone folds the same servers to their own clients, a CI drift gate keeps them in sync, and secrets stay references — no hosted gateway required.",
    body: [
      "Commit one reviewed `mcp.config.jsonc` to your repo. Every teammate runs `mcpfold sync` to fold it into whatever clients they use, so the whole team runs the same, reviewed set of MCP servers without a shared machine or a hosted service. Add `mcpfold diff --check` to CI as a drift gate, and a client config can never silently wander from the committed source.",
      "Secrets stay as references in the committed config — each developer resolves them locally from their own environment or secret manager — so a shared config never carries a raw token. This repo-committed workflow is the whole team wedge, and it is entirely free and local.",
      "When you want shared config, an audit trail, and sync managed for you, the optional hosted cloud adds that on top — and only ever syncs config with secret references, never secret values. It is self-hostable, and mcpfold stays local-first: it is not a hosted enterprise MCP gateway with server-side access control, and does not aim to be."
    ],
    highlights: [
      {
        title: "Repo-committed config",
        text: "One reviewed config; everyone folds the same servers to their clients."
      },
      {
        title: "CI drift gate",
        text: "`mcpfold diff --check` fails the build if a client drifts from the source."
      },
      {
        title: "References, never values",
        text: "Secrets stay references; the cloud never syncs secret values."
      },
      {
        title: "Optional, self-hostable cloud",
        text: "Shared config + audit + sync when you want it — or self-host it for free."
      }
    ],
    primaryCta: { href: "/pricing", text: "See team pricing" },
    secondaryCta: { href: "/docs/team-config-as-code.html", text: "Team config-as-code guide" },
    related: ["solo", "power-users"]
  },
  {
    id: "power-users",
    nav: "Power users",
    h1: "mcpfold for power users",
    metaTitle: "mcpfold for power users — curate tools, cut the context tax",
    tagline: "Curate exactly the tools you want from a large directory of MCP servers, and cut the context-window tax on every model call — with one config that folds out to every client.",
    body: [
      "Every MCP server advertises its full tool schema whether or not you use those tools, and all of it counts against the model’s context window. Load several servers and a large share of the window is spent before you have done any work.",
      "mcpfold’s proxy lets you allow- or deny-list tools per server, so only the handful you use is exposed. Browse the community directory, add any server in one command with pinned versions and integrity where available, and keep the whole setup in one canonical config that syncs to every client.",
      "The committed benchmark quantifies the savings, so the trade-off is measured, not asserted."
    ],
    highlights: [
      {
        title: "Per-server tool curation",
        text: "Allow/deny lists trim each server to the tools you actually call."
      },
      {
        title: "A curated directory",
        text: "Add any server in one command — pinned and integrity-checked where available."
      },
      {
        title: "Measured savings",
        text: "The committed benchmark shows the context-window reduction."
      }
    ],
    primaryCta: { href: "/directory", text: "Browse the MCP server directory" },
    secondaryCta: { href: "/docs/benchmark.html", text: "See the token benchmark" },
    related: ["solo", "teams"]
  }
];
function useCaseById(id) {
  return USE_CASES.find((u) => u.id === id);
}
const EFFECTIVE_DATE = "2026-07-10";
const VERSION = "1.0";
const CONTACT = "security@mcpfold.com";
const GITHUB$2 = "https://github.com/dj-pearson/MCPFold";
const LEGAL_DOCS = [
  {
    id: "privacy",
    path: "/privacy",
    title: "Privacy policy",
    metaTitle: "Privacy policy — mcpfold",
    metaDescription: "What mcpfold collects: cookieless no-PII website analytics, a local-first CLI that collects nothing by default (opt-in telemetry only), and secret references that never leave your machine.",
    effectiveDate: EFFECTIVE_DATE,
    version: VERSION,
    intro: "mcpfold is built to need as little of your data as possible. The CLI runs entirely on your machine, the website uses privacy-friendly analytics with no cookies and no personal data, and secret values never leave your computer. This policy explains exactly what is and is not collected.",
    sections: [
      {
        heading: "The website",
        paragraphs: [
          "When enabled, this site uses cookieless, privacy-friendly analytics (a Plausible/Umami-style endpoint) that measures aggregate page views and referrers only. It sets no cookies, stores no personally identifying information, and does not track you across other sites. Analytics is off entirely unless the site is built with the analytics environment variables, so previews and local runs never phone home.",
          "Because no personal data or cookies are involved, the site does not show a cookie-consent wall. See the analytics disclosure for details."
        ]
      },
      {
        heading: "The mcpfold CLI",
        paragraphs: [
          "The CLI is local-first and collects nothing by default — there is no network sink wired in the shipped tool. Telemetry is strictly opt-in: it is sent only if you set `MCPFOLD_TELEMETRY=1`, and it is forced off if you set `DO_NOT_TRACK=1` (the cross-tool convention) or `MCPFOLD_TELEMETRY=0`.",
          "If you do opt in, each event is a fixed allow-list of non-identifying fields (such as which subcommand ran) and passes through the same secret redactor the rest of the tool uses, as a final guard. Your configuration contents and secrets are never collected."
        ]
      },
      {
        heading: "The optional hosted cloud",
        paragraphs: [
          "The hosted team cloud is optional (and self-hostable). If you create an account, we store your account identifier (such as your email) and the configuration you choose to sync. That configuration carries secret references — placeholders like `${env:…}` — never the secret values themselves, which stay on your machine and are resolved locally.",
          "We use the account data only to provide the service (authentication, sync, and the audit trail). We do not sell your data."
        ]
      },
      {
        heading: "Data sharing and processors",
        paragraphs: [
          "We do not sell personal data or share it with advertisers. Where the hosted service relies on infrastructure providers (for example, hosting and the database), they process data solely to run the service on our behalf."
        ]
      },
      {
        heading: "Your choices and rights",
        paragraphs: [
          "The CLI and everything local require no account and collect nothing by default. For the hosted cloud, you can request access to or deletion of your account data by contacting us. You can opt out of CLI telemetry at any time as described above, and out of website analytics by blocking the analytics script or sending a Do-Not-Track signal."
        ]
      },
      {
        heading: "Changes to this policy",
        paragraphs: [
          `This policy is versioned and dated (see the effective date above). Material changes will update the version. Questions? Email ${CONTACT} or open an issue on ${GITHUB$2}.`
        ]
      }
    ]
  },
  {
    id: "terms",
    path: "/terms",
    title: "Terms of use",
    metaTitle: "Terms of use — mcpfold",
    metaDescription: "The terms for using the mcpfold website, the MIT-licensed CLI, and the optional hosted cloud service — provided as-is, with the software governed by its MIT license.",
    effectiveDate: EFFECTIVE_DATE,
    version: VERSION,
    intro: "These terms cover your use of the mcpfold website and the optional hosted service. The mcpfold CLI and all local software are open source under the MIT license, and your use of them is governed by that license.",
    sections: [
      {
        heading: "The software is MIT-licensed",
        paragraphs: [
          `The mcpfold CLI, the config format, the adapters, and the rest of the local tooling are released under the MIT license. Your rights to use, modify, and redistribute that software are defined by the license text, available in the repository (${GITHUB$2}/blob/main/LICENSE). Nothing here restricts the rights the MIT license grants you.`
        ]
      },
      {
        heading: "The website",
        paragraphs: [
          "This website is provided for information about the project. You may not use it to attempt to disrupt the service, probe it without authorization, or misrepresent your affiliation with the project."
        ]
      },
      {
        heading: "The optional hosted service",
        paragraphs: [
          "If you use the hosted team cloud, you are responsible for the configuration you sync and for keeping your account credentials secure. You agree to use the service lawfully and not to abuse it (for example, by attempting to access other accounts’ data).",
          "The hosted service is provided on an as-is basis; we do not guarantee uninterrupted availability, and we may change or discontinue features. You can also self-host it under its license terms."
        ]
      },
      {
        heading: "No warranty; limitation of liability",
        paragraphs: [
          "To the maximum extent permitted by law, the website and hosted service are provided without warranties of any kind, and the project and its maintainers are not liable for any indirect or consequential damages arising from their use. The MIT license’s warranty disclaimer governs the software itself."
        ]
      },
      {
        heading: "No implied endorsement",
        paragraphs: [
          "mcpfold is an independent, open-source project. The Model Context Protocol is an open standard; mcpfold is not affiliated with or endorsed by the MCP project, and client and product names are used only to describe compatibility."
        ]
      },
      {
        heading: "Changes and contact",
        paragraphs: [
          `We may update these terms; the version and effective date above will change when we do. Questions? Email ${CONTACT}.`
        ]
      }
    ]
  },
  {
    id: "analytics",
    path: "/analytics",
    title: "Analytics & cookie disclosure",
    metaTitle: "Analytics & cookies — mcpfold",
    metaDescription: "How mcpfold’s website measures traffic: cookieless, privacy-friendly analytics with no personal data and no cookie wall — what is measured, what is not, and how to opt out.",
    effectiveDate: EFFECTIVE_DATE,
    version: VERSION,
    intro: "This site is transparent about measurement. It uses privacy-friendly analytics that set no cookies and collect no personal data — which is exactly why you will never see a cookie-consent wall here.",
    sections: [
      {
        heading: "What we measure",
        paragraphs: [
          "When analytics is enabled, we measure aggregate, non-identifying signals: page views, the pages visited, and referring sources. This is done with a Plausible/Umami-style endpoint that is designed for privacy."
        ]
      },
      {
        heading: "What we do not do",
        paragraphs: [
          "We set no cookies and use no local storage for tracking. We collect no personally identifying information, do not build user profiles, and do not track you across other websites. There are no advertising or third-party marketing trackers."
        ]
      },
      {
        heading: "No cookie wall — by design",
        paragraphs: [
          "Because the analytics stores no personal data and sets no cookies, no consent banner is legally required, and we deliberately do not add one. A cookie wall would be friction without a privacy benefit."
        ]
      },
      {
        heading: "How to opt out",
        paragraphs: [
          "You can opt out at any time by blocking the analytics script in your browser or an extension, or by sending a Do-Not-Track signal. Analytics is also disabled entirely on any build without the analytics configuration. See the privacy policy for the full picture."
        ]
      }
    ]
  }
];
function legalDocById(id) {
  return LEGAL_DOCS.find((d) => d.id === id);
}
const SITE_URL = "https://mcpfold.com";
const HOME_DESC = "Manage MCP servers from one config, folded out to every MCP client — Claude Code, Cursor, VS Code, Windsurf, Zed. Secret references, not hardcoded values.";
function meta(title, description, path) {
  return { title, description, canonical: `${SITE_URL}${path}` };
}
function resolveMeta(path) {
  const p = path !== "/" && path.endsWith("/") ? path.slice(0, -1) : path;
  if (p === "/") {
    return meta("mcpfold — one MCP config for every MCP client", HOME_DESC, "/");
  }
  if (p === "/install") {
    return meta(
      "Install mcpfold — every channel, one copy-paste",
      "Install mcpfold via npx, npm, Homebrew, curl | sh, Scoop, winget, or a standalone binary — then init, import, and sync.",
      "/install"
    );
  }
  if (p === "/directory") {
    return meta(
      "Best MCP servers — the curated directory · mcpfold",
      `Browse ${DIRECTORY$1.length}+ MCP servers by category — files, databases, browsers, search, and more — and add any to your config in one command. A neutral, community-maintained list.`,
      "/directory"
    );
  }
  if (p.startsWith("/directory/category/")) {
    const cat = p.slice("/directory/category/".length);
    if (entriesForCategory(cat).length > 0) {
      const m = categoryMeta(cat);
      return meta(
        `Best ${m.label} MCP servers · mcpfold`,
        `${m.description} Browse ${entriesForCategory(cat).length} and add any to your config in one command.`,
        `/directory/category/${cat}`
      );
    }
    return meta("Category not found — mcpfold directory", "No such category.", p);
  }
  if (p.startsWith("/directory/")) {
    const id = p.slice("/directory/".length);
    const entry = DIRECTORY$1.find((e) => e.id === id);
    if (entry) {
      return meta(
        `${entry.name} — MCP server · mcpfold`,
        entry.description,
        `/directory/${entry.id}`
      );
    }
    return meta("Server not found — mcpfold directory", "No such server.", p);
  }
  if (p === "/guides") {
    return meta(
      "MCP setup guides — add MCP servers to any client · mcpfold",
      `Copy-paste guides to add MCP servers to ${GUIDE_CLIENTS.length} clients — Claude Code, Cursor, VS Code, Windsurf, and more — with one mcpfold config folded out to each.`,
      "/guides"
    );
  }
  if (p.startsWith("/guides/")) {
    const guide = guideById(p.slice("/guides/".length));
    if (guide) {
      return meta(
        `Add MCP servers to ${guide.label} · mcpfold`,
        `Set up MCP servers in ${guide.label} with mcpfold: one canonical config folded into ${guide.label}'s own format, secrets kept as references. Config paths straight from the adapter.`,
        `/guides/${guide.id}`
      );
    }
    return meta("Guide not found — mcpfold", "No such client guide.", p);
  }
  if (p === "/glossary") {
    return meta(
      "MCP glossary — Model Context Protocol concepts explained · mcpfold",
      "Clear, neutral definitions of MCP concepts — MCP server, Model Context Protocol, MCP client, MCP tools, context window, secret reference, and MCP config manager.",
      "/glossary"
    );
  }
  if (p.startsWith("/glossary/")) {
    const entry = termById(p.slice("/glossary/".length));
    if (entry) {
      return meta(`${entry.heading} · mcpfold glossary`, entry.short, `/glossary/${entry.id}`);
    }
    return meta("Term not found — mcpfold glossary", "No such glossary entry.", p);
  }
  if (p === "/compare") {
    return meta(
      "How mcpfold compares — MCP config, by hand vs gateway vs mcpfold",
      "Honest, factual comparisons of ways to manage MCP servers across clients — by hand, with a hosted gateway, or with mcpfold, a local-first open-source CLI. Clear about what mcpfold is not.",
      "/compare"
    );
  }
  if (p.startsWith("/compare/")) {
    const entry = comparisonById(p.slice("/compare/".length));
    if (entry) {
      return meta(`${entry.metaTitle} · mcpfold`, entry.intro, `/compare/${entry.id}`);
    }
    return meta("Comparison not found — mcpfold", "No such comparison.", p);
  }
  if (p === "/features") {
    return meta(
      "Features — what mcpfold does · one config, curation, secrets, drift",
      "Go deep on each mcpfold pillar: one config folded to every client, per-server tool curation to cut context tokens, secrets as references, and sync/diff/drift control.",
      "/features"
    );
  }
  if (p.startsWith("/features/")) {
    const feature = featureById(p.slice("/features/".length));
    if (feature) {
      return meta(`${feature.metaTitle}`, feature.tagline, `/features/${feature.id}`);
    }
    return meta("Feature not found — mcpfold", "No such feature.", p);
  }
  if (p === "/use-cases") {
    return meta(
      "Who mcpfold is for — solo developers, teams, power users",
      "The same product framed around your situation: one MCP config across your own clients, a repo-committed setup for teams with a CI drift gate, or tool curation to cut the context tax.",
      "/use-cases"
    );
  }
  if (p.startsWith("/use-cases/")) {
    const uc = useCaseById(p.slice("/use-cases/".length));
    if (uc) {
      return meta(`${uc.metaTitle}`, uc.tagline, `/use-cases/${uc.id}`);
    }
    return meta("Use case not found — mcpfold", "No such use case.", p);
  }
  if (p === "/pricing") {
    return meta(
      "Pricing — mcpfold",
      "The CLI and everything local is free forever and MIT-licensed. The hosted team cloud — shared configs, audit trail, sync — is the paid surface. Self-host it yourself for free.",
      "/pricing"
    );
  }
  if (p === "/security") {
    return meta(
      "Security & trust — mcpfold",
      "How mcpfold handles secrets (references, never values), stays local-first, redacts diagnostics, keeps telemetry off by default, and how to report a vulnerability privately.",
      "/security"
    );
  }
  if (p === "/about") {
    return meta(
      "About mcpfold — the open-source MCP config manager",
      "mcpfold’s mission and open-source model: one neutral mcp.config.jsonc format for every client, MIT-licensed CLI, an optional self-hostable cloud, and how to contribute an adapter.",
      "/about"
    );
  }
  {
    const legal = p.startsWith("/") ? legalDocById(p.slice(1)) : void 0;
    if (legal && legal.path === p) {
      return meta(legal.metaTitle, legal.metaDescription, legal.path);
    }
  }
  if (p === "/community") {
    return meta(
      "Community & support — mcpfold",
      "Get help in GitHub Discussions, report a bug with the redaction-safe `mcpfold diagnose` bundle, request or contribute a client adapter, and find the contributing guide.",
      "/community"
    );
  }
  if (p === "/blog") {
    return meta(
      "Blog — mcpfold",
      "Launches, deep-dives, and release notes from the mcpfold project.",
      "/blog"
    );
  }
  if (p.startsWith("/blog/")) {
    const slug = p.slice("/blog/".length);
    const post = POSTS.find((e) => e.slug === slug);
    if (post) {
      return meta(`${post.title} — mcpfold`, post.description, `/blog/${post.slug}`);
    }
    return meta("Post not found — mcpfold", "No such post.", p);
  }
  if (p === "/changelog") {
    return meta(
      "Changelog — mcpfold",
      "Human-readable release notes for mcpfold, derived from the CHANGELOG source.",
      "/changelog"
    );
  }
  if (p === "/roadmap") {
    return meta(
      "Roadmap — mcpfold",
      "Where mcpfold is headed: what has shipped, what is next, and what we are exploring — rendered from the project’s single roadmap source. Nothing here is a dated commitment.",
      "/roadmap"
    );
  }
  if (p === "/brand") {
    return meta(
      "Brand & press kit — mcpfold",
      "Logo and wordmark downloads, color tokens, the product one-liner, and usage guidelines for representing mcpfold — an independent, open-source project.",
      "/brand"
    );
  }
  if (p === "/404") {
    return meta(
      "Page not found — mcpfold",
      "This page doesn’t exist. Here’s the way back.",
      "/404"
    );
  }
  return meta("mcpfold", HOME_DESC, p);
}
function allRoutes() {
  return [
    "/",
    "/install",
    "/directory",
    "/pricing",
    "/security",
    "/about",
    "/community",
    "/brand",
    "/blog",
    "/changelog",
    "/guides",
    "/features",
    ...FEATURES.map((f) => `/features/${f.id}`),
    "/use-cases",
    ...USE_CASES.map((u) => `/use-cases/${u.id}`),
    ...LEGAL_DOCS.map((d) => d.path),
    "/roadmap",
    "/glossary",
    "/compare",
    ...categoriesWithPages().map((c) => `/directory/category/${c.id}`),
    ...DIRECTORY$1.map((e) => `/directory/${e.id}`),
    ...GUIDE_CLIENTS.map((c) => `/guides/${c.id}`),
    ...GLOSSARY.map((t) => `/glossary/${t.id}`),
    ...COMPARISONS.map((c) => `/compare/${c.id}`),
    ...POSTS.map((p) => `/blog/${p.slug}`)
  ];
}
const HOME = [
  {
    question: "What is mcpfold?",
    answer: "mcpfold is a free, open-source CLI that keeps one canonical config for your MCP (Model Context Protocol) servers and folds it out to every client — Claude Desktop, Claude Code, Cursor, VS Code, Windsurf, Zed, and more — each in its own native format. You write your servers once; mcpfold renders the right file for each tool."
  },
  {
    question: "How does mcpfold handle secrets?",
    answer: "mcpfold stores secrets as references (for example ${env:GITHUB_PAT} or ${op:vault/item/field}), never as raw values. The reference is the only thing committed to git; the actual secret is resolved from your environment or secret manager at fold time, so credentials are never written to a client config on disk."
  },
  {
    question: "Which MCP clients does mcpfold support?",
    answer: "mcpfold folds to 18 clients from one config: Claude Desktop, Claude Code, Cursor, VS Code, Windsurf, Zed, Cline, Gemini CLI, JetBrains AI Assistant, Visual Studio, Continue, Roo Code, Goose, Codex CLI, LM Studio, Warp, opencode, and GitHub Copilot CLI. Each client has its own config format and path — including YAML (Goose) and TOML (Codex CLI) — and mcpfold handles the per-client dialect automatically."
  },
  {
    question: "How does mcpfold reduce MCP token usage?",
    answer: "mcpfold reduces MCP token usage by curating which tools each client loads, from one canonical config, so only the tools an agent actually needs enter its context window. Every connected MCP server otherwise dumps its full tool schema into context on every turn, used or not. In a reproducible benchmark, trimming a 45-tool setup to the 9 tools actually needed cut tool-schema tokens by about 80% (7,476 to 1,497), with no extra configuration."
  },
  {
    question: "Do I still need mcpfold if my client has native tool-search?",
    answer: "They complement each other. Native tool-search (such as Claude’s Tool Search Tool or OpenAI’s deferred tool loading) lets a model load tools on demand, but it is model-driven, non-deterministic, and only exists on the clients and models that ship it. mcpfold curates deterministically from one config across every MCP client — including Cursor, Windsurf, and Zed, which have no native tool-search — and trims the catalog before any native tool-search runs, so the two layers stack."
  },
  {
    question: "Is mcpfold free?",
    answer: "Yes. The entire mcpfold CLI — every adapter, the canonical config, secret references, sync, diff, doctor, and the config-as-code CI gate — is free and open source under the MIT license, with no account required. Optional paid cloud features add team config sharing, roles, and an audit trail."
  }
];
const INSTALL = [
  {
    question: "How do I install mcpfold?",
    answer: 'Run mcpfold with no install using "npx mcpfold@latest", install it globally with "npm install -g mcpfold", or use a standalone binary via Homebrew ("brew install mcpfold") or Scoop. mcpfold needs Node.js 20+ for the npm paths; the standalone binaries bundle their own runtime.'
  },
  {
    question: "Do I need an account to use mcpfold?",
    answer: "No. mcpfold is local-first — init, import, sync, diff, doctor, and run all work entirely offline with no account and no server. An account is only needed for the optional cloud features (config sync across machines and team sharing)."
  }
];
const DIRECTORY = [
  {
    question: "What is the mcpfold MCP server directory?",
    answer: "The mcpfold directory is a curated, community-maintained list of Model Context Protocol servers you can add to your config in one command. Each entry links to a server you can install; mcpfold pins it to an exact version and stores any credentials as references rather than values."
  },
  {
    question: "How do I add an MCP server with mcpfold?",
    answer: 'Run "mcpfold add <name> --from-registry" to resolve a server from the official MCP registry into a pinned, integrity-hashed, reference-only entry in your canonical config, or "mcpfold add <name> --url <url>" / "--package <spec>" to add one by hand. Then "mcpfold sync" folds it out to every client.'
  }
];
const PRICING = [
  {
    question: "How much does mcpfold cost?",
    answer: "The mcpfold CLI is free forever under the MIT license. Cloud Free ($0) adds config sync for one person across machines; the Team tier ($6/user/month) adds shared team configs, roles, and an audit trail; Enterprise adds SSO and support. Nothing in the local CLI is gated."
  },
  {
    question: "Can I self-host the mcpfold cloud?",
    answer: "Yes — the entire mcpfold cloud (Supabase plus the edge service) is MIT-licensed and self-hostable at no cost. The paid tiers are the convenience of us running it plus the Team/Enterprise features; the code itself is open."
  },
  {
    question: "What is the mcpfold license?",
    answer: "The mcpfold CLI, adapters, core, and the self-hostable cloud are all MIT-licensed. Only the hosted mcpfold.com service and its Team/Enterprise features are commercial."
  },
  {
    question: "What data does the mcpfold cloud store?",
    answer: "The mcpfold cloud stores only your canonical config with secret references (${provider:path}) — never secret values. Everything sensitive stays on your machine and is resolved at launch time."
  }
];
function faqsForPath(path) {
  const p = path !== "/" && path.endsWith("/") ? path.slice(0, -1) : path;
  if (p === "/") return HOME;
  if (p === "/install") return INSTALL;
  if (p === "/directory") return DIRECTORY;
  if (p === "/pricing") return PRICING;
  return [];
}
function faqPageJsonLd(faqs, path) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    url: `${SITE_URL}${path === "/" ? "" : path}`,
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer }
    }))
  };
}
function exampleConfigPath(client) {
  return client.paths.macos ?? client.paths.linux ?? client.paths.windows;
}
function guideSteps(client) {
  const path = exampleConfigPath(client);
  const restart = client.needsRestart ? ` Then restart ${client.label} so it loads the new servers.` : "";
  return [
    {
      name: "Install mcpfold",
      text: "Install the free, open-source mcpfold CLI — no account required.",
      command: "npm install -g mcpfold"
    },
    {
      name: "Create your config",
      text: "Create one canonical mcp.config.jsonc — the single source of truth mcpfold folds out to every client.",
      command: "mcpfold init"
    },
    {
      name: "Add a server",
      text: "Add an MCP server from the registry (secrets stay references, versions stay pinned), or run `mcpfold import` to pull in servers you already configured.",
      command: "mcpfold add <server> --from-registry"
    },
    {
      name: `Fold it out to ${client.label}`,
      text: `Write your servers into ${client.label}'s own config` + (path ? ` (${path})` : "") + ` under its \`${client.configRoot}\` key.${restart}`,
      command: "mcpfold sync"
    }
  ];
}
function secretStrategyNote(client) {
  switch (client.secretStrategy) {
    case "native-input":
      return `${client.label} prompts for secrets itself, so mcpfold folds them to native input references — no token is ever written to disk.`;
    case "inline":
      return `mcpfold resolves each \`\${…}\` reference at fold time and writes the value into ${client.label}'s config only on your machine.`;
    case "shim":
    default:
      return `Secrets stay as \`\${env:…}\` / \`\${op:…}\` references; mcpfold's launcher resolves them at run time, so ${client.label}'s config file never contains a raw token.`;
  }
}
function remoteNote(client) {
  if (!client.remote.nativeHttp) {
    return `${client.label} has no native remote transport, so remote servers are bridged with a pinned \`mcp-remote\` stdio launch (reversible on import).`;
  }
  if (!client.remote.nativeOauth) {
    return `${client.label} can call unauthenticated remotes natively; authenticated ones are bridged with a pinned \`mcp-remote\` launch so credentials are handled safely.`;
  }
  return `${client.label} reaches http/sse remotes natively — mcpfold writes a native remote entry, no bridge needed.`;
}
function softwareApplication() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "mcpfold",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "macOS, Windows, Linux",
    description: "One source of truth for your MCP servers. Write it once, fold it out to every client — secrets never hardcoded, only the tools you need loaded.",
    url: SITE_URL,
    downloadUrl: `${SITE_URL}/install`,
    softwareHelp: `${SITE_URL}/docs`,
    license: "https://opensource.org/licenses/MIT",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }
  };
}
function directoryItemList() {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "MCP server directory",
    description: "A curated, community-maintained directory of MCP servers.",
    numberOfItems: DIRECTORY$1.length,
    itemListElement: DIRECTORY$1.map((entry, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: entry.name,
      url: `${SITE_URL}/directory/${entry.id}`
    }))
  };
}
function categoryItemList(cat) {
  const m = categoryMeta(cat);
  const entries = entriesForCategory(cat);
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${m.label} MCP servers`,
    description: m.description,
    numberOfItems: entries.length,
    itemListElement: entries.map((entry, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: entry.name,
      url: `${SITE_URL}/directory/${entry.id}`
    }))
  };
}
function guidesItemList() {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "MCP client setup guides",
    description: "Guides to add MCP servers to each client mcpfold supports.",
    numberOfItems: GUIDE_CLIENTS.length,
    itemListElement: GUIDE_CLIENTS.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: `Add MCP servers to ${c.label}`,
      url: `${SITE_URL}/guides/${c.id}`
    }))
  };
}
function glossaryTermSet() {
  return {
    "@context": "https://schema.org",
    "@type": "DefinedTermSet",
    "@id": `${SITE_URL}/glossary`,
    name: "MCP glossary",
    description: "Definitions of core Model Context Protocol concepts.",
    hasDefinedTerm: GLOSSARY.map((t) => ({
      "@type": "DefinedTerm",
      name: t.term,
      description: t.short,
      url: `${SITE_URL}/glossary/${t.id}`
    }))
  };
}
function compareItemList() {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "mcpfold comparisons",
    description: "Factual comparisons of ways to manage MCP servers across clients.",
    numberOfItems: COMPARISONS.length,
    itemListElement: COMPARISONS.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.h1,
      url: `${SITE_URL}/compare/${c.id}`
    }))
  };
}
function featuresItemList() {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "mcpfold features",
    description: "The four capabilities mcpfold provides.",
    numberOfItems: FEATURES.length,
    itemListElement: FEATURES.map((f, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: f.h1,
      url: `${SITE_URL}/features/${f.id}`
    }))
  };
}
function useCasesItemList() {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "mcpfold use cases",
    description: "The same product framed around each visitor’s situation.",
    numberOfItems: USE_CASES.length,
    itemListElement: USE_CASES.map((u, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: u.h1,
      url: `${SITE_URL}/use-cases/${u.id}`
    }))
  };
}
function guideHowTo(client) {
  const url = `${SITE_URL}/guides/${client.id}`;
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: `Add MCP servers to ${client.label}`,
    description: `Set up MCP servers in ${client.label} with mcpfold — one canonical config folded into ${client.label}'s own format.`,
    step: guideSteps(client).map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: s.name,
      text: s.text,
      url
    }))
  };
}
function definedTerm(term) {
  return {
    "@context": "https://schema.org",
    "@type": "DefinedTerm",
    name: term.term,
    description: term.short,
    url: `${SITE_URL}/glossary/${term.id}`,
    inDefinedTermSet: `${SITE_URL}/glossary`
  };
}
function compareArticle(entry) {
  return {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: entry.h1,
    description: entry.intro,
    about: "Managing Model Context Protocol (MCP) server configuration",
    url: `${SITE_URL}/compare/${entry.id}`,
    isPartOf: `${SITE_URL}/compare`
  };
}
function featureArticle(feature) {
  return {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: feature.h1,
    description: feature.tagline,
    about: "mcpfold — MCP configuration management",
    url: `${SITE_URL}/features/${feature.id}`,
    isPartOf: `${SITE_URL}/features`
  };
}
function aboutOrganization() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "mcpfold",
    url: SITE_URL,
    description: "An independent, open-source project: one source of truth for your MCP servers, folded out to every client.",
    sameAs: ["https://github.com/dj-pearson/MCPFold", "https://www.npmjs.com/package/mcpfold"]
  };
}
function breadcrumb(trail) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.name,
      item: `${SITE_URL}${crumb.path}`
    }))
  };
}
function jsonLdForPath(path) {
  const p = path !== "/" && path.endsWith("/") ? path.slice(0, -1) : path;
  const faqs = faqsForPath(p);
  const faqNode = faqs.length > 0 ? [faqPageJsonLd(faqs, p)] : [];
  if (p === "/") return [softwareApplication(), ...faqNode];
  if (p === "/directory") return [directoryItemList(), ...faqNode];
  if (p === "/guides") return [guidesItemList(), ...faqNode];
  if (p === "/glossary") return [glossaryTermSet(), ...faqNode];
  if (p === "/compare") return [compareItemList(), ...faqNode];
  if (p === "/features") return [featuresItemList(), ...faqNode];
  if (p === "/use-cases") return [useCasesItemList(), ...faqNode];
  if (p.startsWith("/guides/")) {
    const guide = guideById(p.slice("/guides/".length));
    if (!guide) return [];
    return [
      guideHowTo(guide),
      breadcrumb([
        { name: "Guides", path: "/guides" },
        { name: guide.label, path: `/guides/${guide.id}` }
      ])
    ];
  }
  if (p.startsWith("/glossary/")) {
    const entry = termById(p.slice("/glossary/".length));
    if (!entry) return [];
    return [
      definedTerm(entry),
      breadcrumb([
        { name: "Glossary", path: "/glossary" },
        { name: entry.term, path: `/glossary/${entry.id}` }
      ])
    ];
  }
  if (p.startsWith("/compare/")) {
    const entry = comparisonById(p.slice("/compare/".length));
    if (!entry) return [];
    return [
      compareArticle(entry),
      breadcrumb([
        { name: "Compare", path: "/compare" },
        { name: entry.navLabel, path: `/compare/${entry.id}` }
      ])
    ];
  }
  if (p.startsWith("/features/")) {
    const feature = featureById(p.slice("/features/".length));
    if (!feature) return [];
    return [
      featureArticle(feature),
      breadcrumb([
        { name: "Features", path: "/features" },
        { name: feature.nav, path: `/features/${feature.id}` }
      ])
    ];
  }
  if (p.startsWith("/use-cases/")) {
    const uc = useCaseById(p.slice("/use-cases/".length));
    if (!uc) return [];
    return [
      breadcrumb([
        { name: "Use cases", path: "/use-cases" },
        { name: uc.nav, path: `/use-cases/${uc.id}` }
      ])
    ];
  }
  if (p === "/about")
    return [
      aboutOrganization(),
      breadcrumb([
        { name: "Home", path: "/" },
        { name: "About", path: "/about" }
      ]),
      ...faqNode
    ];
  if (p === "/community")
    return [
      breadcrumb([
        { name: "Home", path: "/" },
        { name: "Community & support", path: "/community" }
      ]),
      ...faqNode
    ];
  if (p === "/roadmap")
    return [
      breadcrumb([
        { name: "Home", path: "/" },
        { name: "Roadmap", path: "/roadmap" }
      ]),
      ...faqNode
    ];
  if (p === "/brand")
    return [
      breadcrumb([
        { name: "Home", path: "/" },
        { name: "Brand & press kit", path: "/brand" }
      ]),
      ...faqNode
    ];
  if (p.startsWith("/directory/category/")) {
    const cat = p.slice("/directory/category/".length);
    if (entriesForCategory(cat).length === 0) return [];
    return [
      categoryItemList(cat),
      breadcrumb([
        { name: "Directory", path: "/directory" },
        { name: categoryMeta(cat).label, path: `/directory/category/${cat}` }
      ])
    ];
  }
  if (p.startsWith("/directory/")) {
    const entry = DIRECTORY$1.find((e) => e.id === p.slice("/directory/".length));
    if (!entry) return [];
    return [
      breadcrumb([
        { name: "Directory", path: "/directory" },
        { name: entry.name, path: `/directory/${entry.id}` }
      ])
    ];
  }
  if (p.startsWith("/blog/")) {
    const post = POSTS.find((e) => e.slug === p.slice("/blog/".length));
    if (!post) return [];
    return [
      breadcrumb([
        { name: "Blog", path: "/blog" },
        { name: post.title, path: `/blog/${post.slug}` }
      ])
    ];
  }
  const legal = p.startsWith("/") ? legalDocById(p.slice(1)) : void 0;
  if (legal && legal.path === p) {
    return [
      breadcrumb([
        { name: "Home", path: "/" },
        { name: legal.title, path: legal.path }
      ]),
      ...faqNode
    ];
  }
  return faqNode;
}
function jsonLdScriptTags(path) {
  return jsonLdForPath(path).map(
    (node) => `<script type="application/ld+json">${JSON.stringify(node).replace(/</g, "\\u003c")}<\/script>`
  ).join("");
}
function setMeta(attr, key, value) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", value);
}
function setCanonical(href) {
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}
function setJsonLd(path) {
  document.head.querySelectorAll('script[type="application/ld+json"][data-route-head]').forEach((el) => el.remove());
  for (const node of jsonLdForPath(path)) {
    const el = document.createElement("script");
    el.setAttribute("type", "application/ld+json");
    el.setAttribute("data-route-head", "");
    el.textContent = JSON.stringify(node);
    document.head.appendChild(el);
  }
}
function RouteHead() {
  const { pathname } = useLocation();
  useEffect(() => {
    const { title, description, canonical } = resolveMeta(pathname);
    document.title = title;
    setMeta("name", "description", description);
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", description);
    setMeta("property", "og:url", canonical);
    setMeta("name", "twitter:title", title);
    setMeta("name", "twitter:description", description);
    setCanonical(canonical);
    setJsonLd(pathname);
  }, [pathname]);
  return null;
}
function Container({ children, style }) {
  return /* @__PURE__ */ jsx(
    "div",
    {
      style: { maxWidth: "var(--maxw)", margin: "0 auto", padding: "0 var(--space-6)", ...style },
      children
    }
  );
}
function Button({
  children,
  href,
  variant = "primary",
  ...rest
}) {
  const base = {
    display: "inline-block",
    padding: "var(--space-3) var(--space-6)",
    borderRadius: "var(--radius)",
    fontWeight: 600,
    textDecoration: "none",
    border: "1px solid transparent",
    transition: "opacity 0.15s ease"
  };
  const variants = {
    primary: { background: "var(--accent)", color: "var(--accent-fg)" },
    ghost: { background: "transparent", color: "var(--fg)", borderColor: "var(--border)" }
  };
  return /* @__PURE__ */ jsx("a", { href, style: { ...base, ...variants[variant] }, ...rest, children });
}
function Badge({ children }) {
  return /* @__PURE__ */ jsx(
    "span",
    {
      style: {
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 999,
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        color: "var(--fg-muted)",
        fontSize: "0.8rem",
        fontWeight: 600
      },
      children
    }
  );
}
const KEY = "mcpfold-theme";
function storedTheme() {
  const v = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
  return v === "light" || v === "dark" ? v : null;
}
function systemTheme() {
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function currentTheme() {
  return storedTheme() ?? systemTheme();
}
function toggleTheme() {
  const next = currentTheme() === "dark" ? "light" : "dark";
  localStorage.setItem(KEY, next);
  document.documentElement.setAttribute("data-theme", next);
  return next;
}
const GITHUB$1 = "https://github.com/dj-pearson/MCPFold";
function isLive(l) {
  return Boolean(l.external) || (l.status ?? "live") === "live";
}
const PRIMARY_NAV = [
  { label: "Features", href: "/features", description: "The four pillars" },
  { label: "Docs", href: "/docs", description: "Config format, secrets, adapters, CLI" },
  { label: "Directory", href: "/directory", description: "Browse MCP servers" },
  { label: "Guides", href: "/guides", description: "Per-client setup" },
  { label: "Pricing", href: "/pricing", description: "Free CLI, optional cloud" },
  { label: "Blog", href: "/blog", description: "Launches and deep-dives" }
];
const PRIMARY_CTA = { label: "Install", href: "/install" };
const SECONDARY_CTA = {
  label: "Open app",
  href: "https://app.mcpfold.com"
};
const FOOTER_GROUPS = [
  {
    title: "Product",
    links: [
      { label: "Install", href: "/install" },
      { label: "Directory", href: "/directory" },
      { label: "Compare", href: "/compare" },
      { label: "Use cases", href: "/use-cases" },
      { label: "Pricing", href: "/pricing" },
      { label: "Features", href: "/features" },
      { label: "Changelog", href: "/changelog" }
    ]
  },
  {
    title: "Resources",
    links: [
      { label: "Documentation", href: "/docs" },
      { label: "Config format", href: "/docs/config-format.html" },
      { label: "Secrets", href: "/docs/secrets.html" },
      { label: "Guides", href: "/guides" },
      { label: "Glossary", href: "/glossary" },
      { label: "Roadmap", href: "/roadmap" },
      { label: "Blog", href: "/blog" }
    ]
  },
  {
    title: "Community",
    links: [
      { label: "Community & support", href: "/community" },
      { label: "GitHub", href: GITHUB$1, external: true },
      { label: "Discussions", href: `${GITHUB$1}/discussions`, external: true },
      { label: "Sponsor", href: "https://github.com/sponsors/dj-pearson", external: true }
    ]
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Security & trust", href: "/security" },
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
      { label: "Analytics & cookies", href: "/analytics" },
      { label: "Brand & press kit", href: "/brand" },
      { label: "MIT license", href: `${GITHUB$1}/blob/main/LICENSE`, external: true }
    ]
  }
];
function liveNav() {
  return PRIMARY_NAV.filter(isLive);
}
function liveFooterGroups() {
  return FOOTER_GROUPS.map((g) => ({ ...g, links: g.links.filter(isLive) })).filter(
    (g) => g.links.length > 0
  );
}
function isHardLink(l) {
  return Boolean(l.external) || l.href.startsWith("/docs");
}
function useActive() {
  const { pathname } = useLocation();
  return (href) => href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
function NavAnchor({
  link,
  active,
  onClick
}) {
  const style = { color: active ? "var(--fg)" : "var(--fg-muted)", fontWeight: active ? 700 : 400 };
  const props = {
    "data-testid": `nav-${link.label.toLowerCase()}`,
    "aria-current": active ? "page" : void 0,
    style,
    onClick
  };
  if (isHardLink(link)) {
    return /* @__PURE__ */ jsx("a", { href: link.href, rel: link.external ? "noreferrer" : void 0, ...props, children: link.label });
  }
  return /* @__PURE__ */ jsx(Link, { to: link.href, ...props, children: link.label });
}
function Header() {
  const [theme, setTheme] = useState("light");
  const [open, setOpen] = useState(false);
  useEffect(() => setTheme(currentTheme()), []);
  const isActive = useActive();
  const nav = liveNav();
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  const themeButton = /* @__PURE__ */ jsx(
    "button",
    {
      type: "button",
      "aria-label": "Toggle color theme",
      "data-testid": "theme-toggle",
      onClick: () => setTheme(toggleTheme()),
      style: {
        background: "transparent",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        color: "var(--fg)",
        cursor: "pointer",
        padding: "4px 10px"
      },
      children: theme === "dark" ? "☀︎" : "☾"
    }
  );
  return /* @__PURE__ */ jsxs(
    "header",
    {
      style: {
        position: "sticky",
        top: 0,
        zIndex: 10,
        borderBottom: "1px solid var(--border)",
        background: "color-mix(in srgb, var(--bg) 88%, transparent)",
        backdropFilter: "blur(8px)"
      },
      children: [
        /* @__PURE__ */ jsxs(
          Container,
          {
            style: { display: "flex", alignItems: "center", gap: "var(--space-4)", height: 60 },
            children: [
              /* @__PURE__ */ jsxs(
                "a",
                {
                  href: "/",
                  style: {
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-2)",
                    fontWeight: 800,
                    fontSize: "1.15rem",
                    color: "var(--fg)"
                  },
                  children: [
                    /* @__PURE__ */ jsx(
                      "img",
                      {
                        src: "/logo-mark.png",
                        alt: "mcpfold logo",
                        width: 28,
                        height: 28,
                        style: { borderRadius: 6, display: "block" }
                      }
                    ),
                    "mcpfold"
                  ]
                }
              ),
              /* @__PURE__ */ jsx("div", { style: { flex: 1 } }),
              /* @__PURE__ */ jsx(
                "nav",
                {
                  className: "nav-desktop",
                  "aria-label": "Primary",
                  style: { gap: "var(--space-6)", alignItems: "center" },
                  children: nav.map((l) => /* @__PURE__ */ jsx(NavAnchor, { link: l, active: isActive(l.href) }, l.href))
                }
              ),
              /* @__PURE__ */ jsxs("div", { className: "nav-desktop", style: { gap: "var(--space-3)", alignItems: "center" }, children: [
                /* @__PURE__ */ jsx("a", { href: SECONDARY_CTA.href, rel: "noreferrer", style: { color: "var(--fg-muted)" }, children: SECONDARY_CTA.label }),
                /* @__PURE__ */ jsx(
                  Link,
                  {
                    to: PRIMARY_CTA.href,
                    "data-testid": "cta-install",
                    style: {
                      background: "var(--accent)",
                      color: "var(--accent-fg)",
                      padding: "6px 14px",
                      borderRadius: "var(--radius)",
                      fontWeight: 600
                    },
                    children: PRIMARY_CTA.label
                  }
                )
              ] }),
              themeButton,
              /* @__PURE__ */ jsx(
                "button",
                {
                  type: "button",
                  className: "nav-toggle",
                  "data-testid": "menu-button",
                  "aria-label": "Menu",
                  "aria-expanded": open,
                  "aria-controls": "mobile-menu",
                  onClick: () => setOpen((v) => !v),
                  style: {
                    background: "transparent",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    color: "var(--fg)",
                    cursor: "pointer",
                    padding: "4px 12px",
                    fontSize: "1.1rem"
                  },
                  children: open ? "✕" : "☰"
                }
              )
            ]
          }
        ),
        open && /* @__PURE__ */ jsxs(
          "nav",
          {
            id: "mobile-menu",
            "aria-label": "Mobile",
            "data-testid": "mobile-menu",
            style: {
              borderTop: "1px solid var(--border)",
              background: "var(--bg)",
              padding: "var(--space-4) var(--space-6)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-4)"
            },
            children: [
              nav.map((l) => /* @__PURE__ */ jsx(
                NavAnchor,
                {
                  link: l,
                  active: isActive(l.href),
                  onClick: () => setOpen(false)
                },
                l.href
              )),
              /* @__PURE__ */ jsx("a", { href: SECONDARY_CTA.href, rel: "noreferrer", style: { color: "var(--fg-muted)" }, children: SECONDARY_CTA.label }),
              /* @__PURE__ */ jsx(
                Link,
                {
                  to: PRIMARY_CTA.href,
                  "data-testid": "cta-install-mobile",
                  onClick: () => setOpen(false),
                  style: {
                    background: "var(--accent)",
                    color: "var(--accent-fg)",
                    padding: "8px 14px",
                    borderRadius: "var(--radius)",
                    fontWeight: 600,
                    textAlign: "center"
                  },
                  children: PRIMARY_CTA.label
                }
              )
            ]
          }
        )
      ]
    }
  );
}
function Footer() {
  const groups = liveFooterGroups();
  return /* @__PURE__ */ jsx("footer", { style: { borderTop: "1px solid var(--border)", marginTop: "var(--space-16)" }, children: /* @__PURE__ */ jsxs(Container, { style: { padding: "var(--space-12) var(--space-6) var(--space-8)" }, children: [
    /* @__PURE__ */ jsxs(
      "div",
      {
        style: {
          display: "grid",
          gap: "var(--space-8)",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))"
        },
        children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsxs(
              "a",
              {
                href: "/",
                style: {
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-2)",
                  fontWeight: 800,
                  color: "var(--fg)"
                },
                children: [
                  /* @__PURE__ */ jsx(
                    "img",
                    {
                      src: "/logo-mark.png",
                      alt: "mcpfold logo",
                      width: 24,
                      height: 24,
                      style: { borderRadius: 6 }
                    }
                  ),
                  "mcpfold"
                ]
              }
            ),
            /* @__PURE__ */ jsx(
              "p",
              {
                style: { color: "var(--fg-muted)", fontSize: "0.9rem", marginTop: "var(--space-3)" },
                children: "One config for every MCP client."
              }
            )
          ] }),
          groups.map((g) => /* @__PURE__ */ jsxs("nav", { "aria-label": g.title, children: [
            /* @__PURE__ */ jsx(
              "h2",
              {
                style: {
                  fontSize: "0.8rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "var(--fg-muted)",
                  margin: "0 0 var(--space-3)"
                },
                children: g.title
              }
            ),
            /* @__PURE__ */ jsx(
              "ul",
              {
                style: {
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  display: "grid",
                  gap: "var(--space-2)"
                },
                children: g.links.map((l) => /* @__PURE__ */ jsx("li", { children: /* @__PURE__ */ jsx(
                  "a",
                  {
                    href: l.href,
                    "data-testid": `footer-link-${l.href}`,
                    rel: l.external ? "noreferrer" : void 0,
                    style: { color: "var(--fg-muted)", fontSize: "0.92rem" },
                    children: l.label
                  }
                ) }, l.href))
              }
            )
          ] }, g.title))
        ]
      }
    ),
    /* @__PURE__ */ jsx(
      "p",
      {
        style: {
          borderTop: "1px solid var(--border)",
          marginTop: "var(--space-8)",
          paddingTop: "var(--space-6)",
          color: "var(--fg-muted)",
          fontSize: "0.85rem"
        },
        children: "© mcpfold — free and open source under the MIT license. A neutral project: mcpfold is not affiliated with or endorsed by the MCP project or the clients and servers it supports."
      }
    )
  ] }) });
}
function Layout() {
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(RouteHead, {}),
    /* @__PURE__ */ jsx("a", { href: "#main", className: "skip-link", "data-testid": "skip-link", children: "Skip to content" }),
    /* @__PURE__ */ jsx(Header, {}),
    /* @__PURE__ */ jsx("main", { id: "main", tabIndex: -1, children: /* @__PURE__ */ jsx(Outlet, {}) }),
    /* @__PURE__ */ jsx(Footer, {})
  ] });
}
function Hero() {
  const headline = compute(FIXTURE_SERVERS, 3);
  return /* @__PURE__ */ jsxs(
    Container,
    {
      style: { padding: "var(--space-16) var(--space-6) var(--space-8)", textAlign: "center" },
      children: [
        /* @__PURE__ */ jsx(Badge, { children: "Open source · local-first" }),
        /* @__PURE__ */ jsxs(
          "h1",
          {
            style: {
              fontSize: "clamp(2rem, 5vw, 3.4rem)",
              lineHeight: 1.1,
              margin: "var(--space-6) 0"
            },
            children: [
              "mcpfold — one ",
              /* @__PURE__ */ jsx("span", { style: { color: "var(--accent)" }, children: "MCP config" }),
              " for every client"
            ]
          }
        ),
        /* @__PURE__ */ jsx(
          "p",
          {
            "data-testid": "hero-intro",
            style: { fontSize: "1.25rem", maxWidth: 720, margin: "0 auto var(--space-6)" },
            children: "mcpfold is a free, open-source CLI that manages your MCP servers from one canonical config and folds it out to every MCP client — Claude Code, Claude Desktop, Cursor, VS Code, Windsurf, and Zed — each in its own format."
          }
        ),
        /* @__PURE__ */ jsxs(
          "p",
          {
            "data-testid": "benchmark-headline",
            style: { fontSize: "1.05rem", maxWidth: 720, margin: "0 auto var(--space-8)" },
            children: [
              "Curate each server’s tools to skip the",
              " ",
              /* @__PURE__ */ jsx("span", { style: { color: "var(--accent)" }, children: "context-window tax" }),
              " — every server dumps its full tool schema into context, used or not. Curating the toolset cuts tool-schema tokens by",
              " ",
              /* @__PURE__ */ jsxs("strong", { style: { color: "var(--accent)" }, children: [
                "~",
                headline.reductionPct,
                "%"
              ] }),
              " ",
              /* @__PURE__ */ jsxs("span", { style: { color: "var(--fg-muted)" }, children: [
                "(",
                headline.tokensBefore.toLocaleString(),
                " → ",
                headline.tokensAfter.toLocaleString(),
                ")"
              ] }),
              ", with secrets kept as $",
              "{env:…}",
              " references, never hardcoded values."
            ]
          }
        ),
        /* @__PURE__ */ jsxs(
          "div",
          {
            style: {
              display: "flex",
              gap: "var(--space-4)",
              justifyContent: "center",
              flexWrap: "wrap"
            },
            children: [
              /* @__PURE__ */ jsx(Button, { href: "/install", children: "Install" }),
              /* @__PURE__ */ jsx(Button, { href: "https://app.mcpfold.com", variant: "ghost", children: "Try the cloud" })
            ]
          }
        ),
        /* @__PURE__ */ jsx(
          "p",
          {
            style: {
              marginTop: "var(--space-4)",
              color: "var(--fg-muted)",
              fontFamily: "var(--font-mono)"
            },
            children: /* @__PURE__ */ jsx("code", { children: "npx mcpfold init" })
          }
        ),
        /* @__PURE__ */ jsx("div", { style: { marginTop: "var(--space-12)" }, children: /* @__PURE__ */ jsx(
          "img",
          {
            src: "/demo.svg",
            alt: "mcpfold in the terminal: init, import, sync, and diff show one config folding out to every client",
            "data-testid": "demo-image",
            style: {
              width: "100%",
              maxWidth: 760,
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)"
            }
          }
        ) })
      ]
    }
  );
}
function Calculator() {
  const [selected, setSelected] = useState(
    () => new Set(FIXTURE_SERVERS.map((s) => s.name))
  );
  const [keep, setKeep] = useState(3);
  const servers = FIXTURE_SERVERS.filter((s) => selected.has(s.name));
  const result = useMemo(() => compute(servers, keep), [servers, keep]);
  const toggle = (name) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    return next;
  });
  const cell2 = {
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    background: "var(--bg-elevated)",
    padding: "var(--space-4)"
  };
  return /* @__PURE__ */ jsxs(
    "section",
    {
      "aria-labelledby": "calc-heading",
      style: {
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: "var(--space-6)",
        background: "var(--bg)"
      },
      children: [
        /* @__PURE__ */ jsx("h2", { id: "calc-heading", style: { marginTop: 0 }, children: "Feel the tax — and the savings" }),
        /* @__PURE__ */ jsxs("p", { style: { color: "var(--fg-muted)", marginTop: 0 }, children: [
          "Pick your servers and how many tools each agent actually needs.",
          " ",
          /* @__PURE__ */ jsx("span", { style: { whiteSpace: "nowrap" }, children: "Example servers" }),
          " from the published benchmark — no endorsement implied."
        ] }),
        /* @__PURE__ */ jsxs("fieldset", { style: { border: "none", padding: 0, margin: 0 }, children: [
          /* @__PURE__ */ jsx("legend", { style: { fontWeight: 600, marginBottom: "var(--space-2)" }, children: "Servers" }),
          /* @__PURE__ */ jsx("div", { style: { display: "flex", flexWrap: "wrap", gap: "var(--space-4)" }, children: FIXTURE_SERVERS.map((s) => /* @__PURE__ */ jsxs(
            "label",
            {
              style: { display: "flex", gap: "var(--space-2)", alignItems: "center" },
              children: [
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "checkbox",
                    checked: selected.has(s.name),
                    onChange: () => toggle(s.name),
                    "data-testid": `server-${s.name}`
                  }
                ),
                /* @__PURE__ */ jsx("code", { children: s.name }),
                /* @__PURE__ */ jsxs("span", { style: { color: "var(--fg-muted)" }, children: [
                  "(",
                  s.toolCount,
                  " tools)"
                ] })
              ]
            },
            s.name
          )) })
        ] }),
        /* @__PURE__ */ jsx("p", { style: { marginBottom: "var(--space-2)", marginTop: "var(--space-6)" }, children: /* @__PURE__ */ jsxs("label", { htmlFor: "keep", style: { fontWeight: 600 }, children: [
          "Tools kept per server: ",
          /* @__PURE__ */ jsx("span", { "data-testid": "keep-value", children: keep })
        ] }) }),
        /* @__PURE__ */ jsx(
          "input",
          {
            id: "keep",
            type: "range",
            min: 0,
            max: 20,
            value: keep,
            onChange: (e) => setKeep(Number(e.target.value)),
            "data-testid": "keep-slider",
            style: { width: "100%" }
          }
        ),
        /* @__PURE__ */ jsxs(
          "div",
          {
            "aria-live": "polite",
            style: {
              display: "grid",
              gap: "var(--space-4)",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              marginTop: "var(--space-6)"
            },
            children: [
              /* @__PURE__ */ jsxs("div", { style: cell2, children: [
                /* @__PURE__ */ jsx("div", { style: { color: "var(--fg-muted)", fontSize: "0.85rem" }, children: "Tools" }),
                /* @__PURE__ */ jsxs("div", { style: { fontSize: "1.4rem", fontWeight: 700 }, "data-testid": "tools-out", children: [
                  result.toolsBefore,
                  " → ",
                  result.toolsAfter
                ] })
              ] }),
              /* @__PURE__ */ jsxs("div", { style: cell2, children: [
                /* @__PURE__ */ jsx("div", { style: { color: "var(--fg-muted)", fontSize: "0.85rem" }, children: "Tool-schema tokens" }),
                /* @__PURE__ */ jsxs("div", { style: { fontSize: "1.4rem", fontWeight: 700 }, "data-testid": "tokens-out", children: [
                  result.tokensBefore.toLocaleString(),
                  " → ",
                  result.tokensAfter.toLocaleString()
                ] })
              ] }),
              /* @__PURE__ */ jsxs("div", { style: { ...cell2, background: "var(--accent)", color: "var(--accent-fg)" }, children: [
                /* @__PURE__ */ jsx("div", { style: { fontSize: "0.85rem", opacity: 0.9 }, children: "Context cut" }),
                /* @__PURE__ */ jsxs("div", { style: { fontSize: "1.8rem", fontWeight: 800 }, "data-testid": "reduction-out", children: [
                  result.reductionPct,
                  "%"
                ] })
              ] })
            ]
          }
        )
      ]
    }
  );
}
function CopyBlock({ command, label }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
    } catch {
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return /* @__PURE__ */ jsxs(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "var(--space-3)",
        background: "var(--code-bg)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: "var(--space-3) var(--space-4)"
      },
      children: [
        /* @__PURE__ */ jsx(
          "code",
          {
            style: { background: "none", padding: 0, flex: 1, overflowX: "auto", whiteSpace: "pre" },
            children: command
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            onClick: copy,
            "aria-label": label ? `Copy: ${label}` : `Copy command: ${command}`,
            "data-testid": "copy-button",
            style: {
              background: "var(--accent)",
              color: "var(--accent-fg)",
              border: "none",
              borderRadius: "var(--radius)",
              padding: "var(--space-2) var(--space-3)",
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap"
            },
            children: copied ? "Copied!" : "Copy"
          }
        )
      ]
    }
  );
}
const STEPS = [
  {
    n: 1,
    command: "mcpfold init",
    title: "init",
    body: "Create the canonical mcp.config.jsonc — one source of truth for every MCP server you run."
  },
  {
    n: 2,
    command: "mcpfold import",
    title: "import",
    body: "Pull the servers already configured across your clients into the canonical config, secrets rewritten as references."
  },
  {
    n: 3,
    command: "mcpfold sync",
    title: "sync",
    body: "Fold the canonical config out to every client's native format — add a server once, it appears everywhere."
  },
  {
    n: 4,
    command: "mcpfold diff",
    title: "diff",
    body: "See any drift between the canonical config and what each client currently has, before you sync."
  }
];
function HowItWorks() {
  return /* @__PURE__ */ jsx(Container, { style: { paddingBottom: "var(--space-16)" }, children: /* @__PURE__ */ jsxs("section", { "data-testid": "how-it-works", "aria-labelledby": "how-heading", children: [
    /* @__PURE__ */ jsx("h2", { id: "how-heading", children: "How it works" }),
    /* @__PURE__ */ jsx("p", { style: { color: "var(--fg-muted)", maxWidth: 640 }, children: "Four commands take you from scattered client configs to one source of truth, folded out everywhere." }),
    /* @__PURE__ */ jsx("ol", { style: { listStyle: "none", padding: 0, margin: "var(--space-6) 0 0" }, children: STEPS.map((s) => /* @__PURE__ */ jsxs("li", { style: { marginBottom: "var(--space-6)" }, children: [
      /* @__PURE__ */ jsxs("h3", { style: { margin: "0 0 var(--space-2)" }, children: [
        /* @__PURE__ */ jsxs("span", { "aria-hidden": "true", style: { color: "var(--fg-muted)" }, children: [
          s.n,
          ".",
          " "
        ] }),
        /* @__PURE__ */ jsx("code", { children: s.command })
      ] }),
      /* @__PURE__ */ jsx("p", { style: { color: "var(--fg-muted)", margin: "0 0 var(--space-3)", maxWidth: 640 }, children: s.body }),
      /* @__PURE__ */ jsx(CopyBlock, { command: s.command, label: `${s.title} command` })
    ] }, s.title)) })
  ] }) });
}
const PERSONAS = [
  {
    id: "solo",
    title: "Solo developers",
    blurb: "Run the same MCP servers in Claude Code, Cursor, and VS Code without hand-editing three config files. Set it up once; every client stays in sync.",
    href: "/use-cases/solo",
    cta: "For solo developers"
  },
  {
    id: "teams",
    title: "Teams",
    blurb: "Share one reviewed config, keep secrets as references, and see every change in an audit trail. The hosted cloud syncs it across the team.",
    href: "/use-cases/teams",
    cta: "For teams"
  },
  {
    id: "power-users",
    title: "Power users",
    blurb: "Curate exactly the tools you want from a large directory of MCP servers, and cut the context-window tax on every model call.",
    href: "/use-cases/power-users",
    cta: "For power users"
  }
];
function UseCases() {
  return /* @__PURE__ */ jsx(Container, { style: { paddingBottom: "var(--space-16)" }, children: /* @__PURE__ */ jsxs("section", { "data-testid": "use-cases", "aria-labelledby": "usecases-heading", children: [
    /* @__PURE__ */ jsx("h2", { id: "usecases-heading", children: "Who mcpfold is for" }),
    /* @__PURE__ */ jsx(
      "div",
      {
        style: {
          display: "grid",
          gap: "var(--space-4)",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          marginTop: "var(--space-6)"
        },
        children: PERSONAS.map((p) => /* @__PURE__ */ jsxs(
          "div",
          {
            "data-testid": `persona-${p.id}`,
            style: {
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              background: "var(--bg-elevated)",
              padding: "var(--space-5)",
              display: "flex",
              flexDirection: "column"
            },
            children: [
              /* @__PURE__ */ jsx("h3", { style: { margin: "0 0 var(--space-2)" }, children: p.title }),
              /* @__PURE__ */ jsx("p", { style: { color: "var(--fg-muted)", margin: "0 0 var(--space-4)", flex: 1 }, children: p.blurb }),
              /* @__PURE__ */ jsxs("a", { href: p.href, children: [
                p.cta,
                " →"
              ] })
            ]
          },
          p.id
        ))
      }
    )
  ] }) });
}
const REPO$2 = "dj-pearson/MCPFold";
function Credibility() {
  const [stars, setStars] = useState(null);
  useEffect(() => {
    let alive = true;
    fetch(`https://api.github.com/repos/${REPO$2}`).then((r) => r.ok ? r.json() : Promise.reject(new Error(String(r.status)))).then((d) => {
      if (alive && typeof d.stargazers_count === "number") setStars(d.stargazers_count);
    }).catch(() => {
    });
    return () => {
      alive = false;
    };
  }, []);
  return /* @__PURE__ */ jsx(Container, { style: { paddingBottom: "var(--space-16)" }, children: /* @__PURE__ */ jsxs(
    "section",
    {
      "data-testid": "credibility",
      "aria-labelledby": "cred-heading",
      style: {
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        background: "var(--bg-elevated)",
        padding: "var(--space-6)"
      },
      children: [
        /* @__PURE__ */ jsx("h2", { id: "cred-heading", style: { marginTop: 0 }, children: "Free, open source, and MIT-licensed" }),
        /* @__PURE__ */ jsxs(
          "ul",
          {
            style: {
              display: "flex",
              flexWrap: "wrap",
              gap: "var(--space-6)",
              listStyle: "none",
              padding: 0,
              margin: 0,
              color: "var(--fg-muted)"
            },
            children: [
              /* @__PURE__ */ jsxs("li", { children: [
                /* @__PURE__ */ jsx(
                  "a",
                  {
                    href: `https://github.com/${REPO$2}`,
                    "data-testid": "github-link",
                    rel: "noreferrer",
                    target: "_blank",
                    children: "GitHub"
                  }
                ),
                stars !== null && /* @__PURE__ */ jsxs(Fragment, { children: [
                  " — ",
                  /* @__PURE__ */ jsxs("strong", { "data-testid": "github-stars", children: [
                    "★ ",
                    stars.toLocaleString("en-US")
                  ] })
                ] })
              ] }),
              /* @__PURE__ */ jsxs("li", { children: [
                "Latest on npm:",
                " ",
                /* @__PURE__ */ jsx("a", { href: "https://www.npmjs.com/package/mcpfold", rel: "noreferrer", target: "_blank", children: /* @__PURE__ */ jsx("strong", { "data-testid": "npm-version", children: `v${"1.0.2"}` }) })
              ] }),
              /* @__PURE__ */ jsx("li", { children: /* @__PURE__ */ jsx(
                "a",
                {
                  href: `https://github.com/${REPO$2}/blob/main/LICENSE`,
                  rel: "noreferrer",
                  target: "_blank",
                  children: "MIT license"
                }
              ) })
            ]
          }
        )
      ]
    }
  ) });
}
function FinalCta() {
  return /* @__PURE__ */ jsx(Container, { style: { paddingBottom: "var(--space-16)" }, children: /* @__PURE__ */ jsxs(
    "section",
    {
      "data-testid": "final-cta",
      "aria-labelledby": "cta-heading",
      style: { textAlign: "center", maxWidth: 640, margin: "0 auto" },
      children: [
        /* @__PURE__ */ jsx("h2", { id: "cta-heading", children: "One config for every MCP client" }),
        /* @__PURE__ */ jsx("p", { style: { color: "var(--fg-muted)" }, children: "Install the free, MIT-licensed CLI and fold your MCP servers out to every client — or add the hosted cloud when your team needs shared configs and an audit trail." }),
        /* @__PURE__ */ jsxs(
          "div",
          {
            style: {
              display: "flex",
              gap: "var(--space-4)",
              justifyContent: "center",
              flexWrap: "wrap",
              marginTop: "var(--space-6)"
            },
            children: [
              /* @__PURE__ */ jsx(Button, { href: "/install", "data-testid": "cta-install", children: "Install mcpfold" }),
              /* @__PURE__ */ jsx(Button, { href: "/pricing", variant: "ghost", "data-testid": "cta-cloud", children: "Explore team cloud" })
            ]
          }
        )
      ]
    }
  ) });
}
function FaqSection({
  path,
  moreLink
}) {
  const faqs = faqsForPath(path);
  if (faqs.length === 0) return null;
  return /* @__PURE__ */ jsx(Container, { style: { paddingBottom: "var(--space-16)" }, children: /* @__PURE__ */ jsxs("section", { "aria-labelledby": "faq-heading", "data-testid": "faq-section", children: [
    /* @__PURE__ */ jsx("h2", { id: "faq-heading", children: "Frequently asked questions" }),
    /* @__PURE__ */ jsx("dl", { children: faqs.map((f) => /* @__PURE__ */ jsxs(
      "div",
      {
        style: {
          borderTop: "1px solid var(--border)",
          padding: "var(--space-5) 0"
        },
        children: [
          /* @__PURE__ */ jsx("dt", { style: { fontWeight: 600, marginBottom: "var(--space-2)" }, children: f.question }),
          /* @__PURE__ */ jsx("dd", { style: { margin: 0, color: "var(--fg-muted)" }, children: f.answer })
        ]
      },
      f.question
    )) }),
    moreLink && /* @__PURE__ */ jsx("p", { style: { marginTop: "var(--space-4)" }, children: /* @__PURE__ */ jsxs("a", { href: moreLink.href, "data-testid": "faq-more-link", children: [
      moreLink.text,
      " →"
    ] }) })
  ] }) });
}
const SINK_URL = "https://api.mcpfold.com/subscribe";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function Subscribe({
  source = "site",
  heading = "Get the occasional update",
  blurb = "New adapters, releases, and the cloud waitlist. No spam, unsubscribe anytime."
}) {
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState("idle");
  async function onSubmit(e) {
    e.preventDefault();
    if (website.trim() !== "") {
      setStatus("success");
      return;
    }
    if (!EMAIL_RE.test(email.trim())) {
      setStatus("error");
      return;
    }
    setStatus("submitting");
    try {
      const res = await fetch(SINK_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), website, source })
      });
      setStatus(res.ok ? "success" : "error");
    } catch {
      setStatus("error");
    }
  }
  return /* @__PURE__ */ jsxs(
    "section",
    {
      "data-testid": "subscribe",
      "aria-labelledby": "subscribe-heading",
      style: {
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        background: "var(--bg-elevated)",
        padding: "var(--space-6)",
        maxWidth: 560
      },
      children: [
        /* @__PURE__ */ jsx("h2", { id: "subscribe-heading", style: { marginTop: 0 }, children: heading }),
        /* @__PURE__ */ jsx("p", { style: { color: "var(--fg-muted)", marginTop: 0 }, children: blurb }),
        status === "success" ? /* @__PURE__ */ jsx("p", { "data-testid": "subscribe-success", role: "status", children: "Thanks! Check your inbox to confirm your subscription." }) : /* @__PURE__ */ jsxs("form", { onSubmit, "data-testid": "subscribe-form", noValidate: true, children: [
          /* @__PURE__ */ jsxs("div", { "aria-hidden": "true", style: { position: "absolute", left: "-9999px", top: "auto" }, children: [
            /* @__PURE__ */ jsx("label", { htmlFor: "subscribe-website", children: "Leave this field empty" }),
            /* @__PURE__ */ jsx(
              "input",
              {
                id: "subscribe-website",
                name: "website",
                type: "text",
                tabIndex: -1,
                autoComplete: "off",
                value: website,
                onChange: (e) => setWebsite(e.target.value)
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }, children: [
            /* @__PURE__ */ jsx("label", { htmlFor: "subscribe-email", style: { position: "absolute", left: "-9999px" }, children: "Email address" }),
            /* @__PURE__ */ jsx(
              "input",
              {
                id: "subscribe-email",
                name: "email",
                type: "email",
                required: true,
                autoComplete: "email",
                placeholder: "you@example.com",
                value: email,
                onChange: (e) => setEmail(e.target.value),
                "aria-invalid": status === "error",
                style: {
                  flex: "1 1 220px",
                  padding: "var(--space-3)",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--fg)"
                }
              }
            ),
            /* @__PURE__ */ jsx(
              "button",
              {
                type: "submit",
                "data-testid": "subscribe-submit",
                disabled: status === "submitting",
                style: {
                  padding: "var(--space-3) var(--space-5)",
                  borderRadius: "var(--radius)",
                  border: "1px solid transparent",
                  background: "var(--accent)",
                  color: "var(--accent-fg)",
                  fontWeight: 600,
                  cursor: "pointer"
                },
                children: status === "submitting" ? "Subscribing…" : "Subscribe"
              }
            )
          ] }),
          /* @__PURE__ */ jsx("p", { "aria-live": "polite", style: { minHeight: "1.2em", margin: "var(--space-2) 0 0" }, children: status === "error" && /* @__PURE__ */ jsx("span", { "data-testid": "subscribe-error", style: { color: "var(--danger, #e5484d)" }, children: "Please enter a valid email — and if it still fails, try again in a moment." }) }),
          /* @__PURE__ */ jsxs("p", { style: { color: "var(--fg-muted)", fontSize: "0.8rem", margin: "var(--space-2) 0 0" }, children: [
            "We store only your email to send these updates, and you can unsubscribe anytime. See how we handle data on the ",
            /* @__PURE__ */ jsx("a", { href: "/security", children: "security page" }),
            "."
          ] })
        ] })
      ]
    }
  );
}
function Home() {
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(Hero, {}),
    /* @__PURE__ */ jsx(Container, { style: { padding: "var(--space-8) var(--space-6)" }, children: /* @__PURE__ */ jsx(Calculator, {}) }),
    /* @__PURE__ */ jsx(Container, { style: { paddingBottom: "var(--space-8)" }, children: /* @__PURE__ */ jsxs("section", { "aria-label": "What mcpfold does", "data-testid": "features", children: [
      /* @__PURE__ */ jsx(
        SeoBlock,
        {
          heading: "Manage every MCP server from one file",
          keyword: "MCP config",
          body: "Write your MCP servers once in a single canonical mcp.config.jsonc — the source of truth mcpfold folds out to every client. Add, curate, and version your MCP config in one place instead of hand-editing a different file for each tool.",
          link: { href: "/docs/config-format.html", text: "See the config format" }
        }
      ),
      /* @__PURE__ */ jsx(
        SeoBlock,
        {
          heading: "Works with every MCP client",
          keyword: "every MCP client",
          body: "mcpfold renders each client's own native format from one config, so the same MCP servers show up everywhere:",
          children: /* @__PURE__ */ jsx("ul", { className: "client-list", "data-testid": "client-list", children: CLIENTS.map((c) => /* @__PURE__ */ jsx("li", { children: /* @__PURE__ */ jsx("a", { href: c.href, children: c.name }) }, c.name)) })
        }
      ),
      /* @__PURE__ */ jsx(
        SeoBlock,
        {
          heading: "Curate tools, cut the context-window tax",
          keyword: "cut MCP context tokens",
          body: "Every MCP server dumps its full tool schema into the model's context whether you use those tools or not. mcpfold lets you allow- or deny-list tools per server, so only what you need loads — the committed benchmark shows the token savings.",
          link: { href: "/docs/benchmark.html", text: "See the benchmark" }
        }
      ),
      /* @__PURE__ */ jsx(
        SeoBlock,
        {
          heading: "Secrets as references, never values",
          keyword: "MCP secrets",
          body: "Your MCP config carries ${env:…} / ${op:…} references instead of raw tokens, so nothing sensitive is ever written to a client config or committed to git. mcpfold resolves the reference at fold time, from your environment or secret manager.",
          link: { href: "/docs/secrets.html", text: "How secrets work" }
        }
      )
    ] }) }),
    /* @__PURE__ */ jsx(HowItWorks, {}),
    /* @__PURE__ */ jsx(UseCases, {}),
    /* @__PURE__ */ jsx(Credibility, {}),
    /* @__PURE__ */ jsx(Container, { style: { paddingBottom: "var(--space-16)" }, children: /* @__PURE__ */ jsxs("section", { "aria-labelledby": "explore-heading", children: [
      /* @__PURE__ */ jsx("h2", { id: "explore-heading", children: "Explore mcpfold" }),
      /* @__PURE__ */ jsx("ul", { className: "explore-links", "data-testid": "explore-links", children: EXPLORE.map((l) => /* @__PURE__ */ jsxs("li", { children: [
        /* @__PURE__ */ jsx("a", { href: l.href, children: l.text }),
        " — ",
        l.desc
      ] }, l.href)) })
    ] }) }),
    /* @__PURE__ */ jsx(FinalCta, {}),
    /* @__PURE__ */ jsx(Container, { style: { paddingBottom: "var(--space-16)" }, children: /* @__PURE__ */ jsx(Subscribe, { source: "home" }) }),
    /* @__PURE__ */ jsx(FaqSection, { path: "/" })
  ] });
}
function SeoBlock({
  heading,
  keyword,
  body,
  link,
  children
}) {
  return /* @__PURE__ */ jsxs("div", { style: { maxWidth: 760, margin: "0 auto var(--space-10)" }, "data-keyword": keyword, children: [
    /* @__PURE__ */ jsx("h2", { style: { marginBottom: "var(--space-3)" }, children: heading }),
    /* @__PURE__ */ jsx("p", { style: { color: "var(--fg-muted)", margin: 0 }, children: body }),
    children,
    link && /* @__PURE__ */ jsx("p", { style: { marginTop: "var(--space-3)" }, children: /* @__PURE__ */ jsxs("a", { href: link.href, children: [
      link.text,
      " →"
    ] }) })
  ] });
}
const CLIENTS = GUIDE_CLIENTS.map((c) => ({ name: c.label, href: `/guides/${c.id}` }));
const EXPLORE = [
  { href: "/install", text: "Install", desc: "npx, npm, Homebrew, or Scoop — no account needed." },
  {
    href: "/features",
    text: "Features",
    desc: "deep dives on the four pillars, with examples and proof."
  },
  {
    href: "/directory",
    text: "MCP server directory",
    desc: "browse and add community MCP servers."
  },
  {
    href: "/guides",
    text: "Client setup guides",
    desc: "add MCP servers to Claude Code, Cursor, VS Code, and more."
  },
  {
    href: "/glossary",
    text: "MCP glossary",
    desc: "what an MCP server, client, and the protocol actually are."
  },
  { href: "/docs", text: "Documentation", desc: "config format, secrets, adapters, CLI contract." },
  {
    href: "/compare",
    text: "How mcpfold compares",
    desc: "by hand vs a hosted gateway vs mcpfold — honestly."
  },
  { href: "/pricing", text: "Pricing", desc: "free CLI (MIT); optional paid cloud for teams." }
];
function detectOS(search = typeof location !== "undefined" ? location.search : "") {
  const override = new URLSearchParams(search).get("os");
  if (override === "mac" || override === "windows" || override === "linux") return override;
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  if (/Mac|iPhone|iPad/i.test(ua)) return "mac";
  if (/Win/i.test(ua)) return "windows";
  return "linux";
}
const OS_LABEL = {
  mac: "macOS",
  windows: "Windows",
  linux: "Linux"
};
const CHANNELS = [
  {
    id: "npx",
    title: "npx (no install)",
    os: "all",
    command: "npx mcpfold init",
    recommendedFor: "linux"
  },
  { id: "npm", title: "npm (global)", os: "all", command: "npm install -g mcpfold" },
  {
    id: "brew",
    title: "Homebrew",
    os: ["mac", "linux"],
    command: "brew install dj-pearson/tap/mcpfold",
    recommendedFor: "mac"
  },
  {
    id: "curl",
    title: "curl | sh",
    os: ["mac", "linux"],
    command: "curl -fsSL https://mcpfold.com/install.sh | sh",
    note: "The installer verifies a SHA-256 checksum before installing and fails closed on any mismatch. Pin a version with MCPFOLD_VERSION=x.y.z."
  },
  {
    id: "scoop",
    title: "Scoop",
    os: ["windows"],
    command: "scoop install dj-pearson/mcpfold",
    recommendedFor: "windows"
  },
  { id: "winget", title: "winget", os: ["windows"], command: "winget install mcpfold" },
  {
    id: "binary",
    title: "Standalone binary",
    os: "all",
    command: "curl -fsSLO https://github.com/dj-pearson/MCPFold/releases/latest/download/mcpfold-macos-arm64",
    note: "Download the binary for your platform plus its .sha256, verify it (shasum -a 256 -c), then put it on your PATH. Binaries: macOS (arm64/x64), Linux (x64/arm64), Windows (x64)."
  }
];
function forOS(c, os) {
  return c.os === "all" || c.os.includes(os);
}
function InstallPage() {
  const [os, setOs] = useState("mac");
  useEffect(() => setOs(detectOS()), []);
  const channels = CHANNELS.filter((c) => forOS(c, os)).sort((a, b) => {
    const ra = a.recommendedFor === os ? 0 : 1;
    const rb = b.recommendedFor === os ? 0 : 1;
    return ra - rb;
  });
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs(Container, { style: { padding: "var(--space-16) var(--space-6)" }, children: [
      /* @__PURE__ */ jsx("h1", { style: { fontSize: "clamp(1.8rem, 4vw, 2.6rem)" }, children: "Install mcpfold" }),
      /* @__PURE__ */ jsxs("p", { style: { color: "var(--fg-muted)", fontSize: "1.1rem" }, children: [
        "Pick your channel — every one resolves to the same release.",
        " ",
        /* @__PURE__ */ jsxs("span", { "data-testid": "version-badge", children: [
          "Latest: ",
          /* @__PURE__ */ jsxs("strong", { children: [
            "v",
            "1.0.2"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsx(
        "div",
        {
          role: "tablist",
          "aria-label": "Operating system",
          style: { display: "flex", gap: "var(--space-2)", margin: "var(--space-6) 0" },
          children: ["mac", "windows", "linux"].map((o) => /* @__PURE__ */ jsx(
            "button",
            {
              role: "tab",
              type: "button",
              "aria-selected": o === os,
              "data-testid": `os-${o}`,
              onClick: () => setOs(o),
              style: {
                padding: "var(--space-2) var(--space-4)",
                borderRadius: "var(--radius)",
                cursor: "pointer",
                border: "1px solid var(--border)",
                background: o === os ? "var(--accent)" : "transparent",
                color: o === os ? "var(--accent-fg)" : "var(--fg)",
                fontWeight: 600
              },
              children: OS_LABEL[o]
            },
            o
          ))
        }
      ),
      /* @__PURE__ */ jsx("div", { style: { display: "grid", gap: "var(--space-6)" }, children: channels.map((c) => /* @__PURE__ */ jsxs("section", { "data-testid": `channel-${c.id}`, children: [
        /* @__PURE__ */ jsxs("h3", { style: { marginBottom: "var(--space-2)" }, children: [
          c.title,
          c.recommendedFor === os && /* @__PURE__ */ jsx(
            "span",
            {
              style: {
                marginLeft: "var(--space-3)",
                fontSize: "0.75rem",
                color: "var(--accent)",
                fontWeight: 700
              },
              children: "RECOMMENDED"
            }
          )
        ] }),
        /* @__PURE__ */ jsx(CopyBlock, { command: c.command, label: c.title }),
        c.note && /* @__PURE__ */ jsx(
          "p",
          {
            style: {
              color: "var(--fg-muted)",
              fontSize: "0.9rem",
              marginTop: "var(--space-2)"
            },
            children: c.note
          }
        )
      ] }, c.id)) }),
      /* @__PURE__ */ jsxs("section", { style: { marginTop: "var(--space-16)" }, children: [
        /* @__PURE__ */ jsx("h2", { children: "Then, get started" }),
        /* @__PURE__ */ jsxs("ol", { style: { color: "var(--fg-muted)", lineHeight: 2 }, children: [
          /* @__PURE__ */ jsxs("li", { children: [
            /* @__PURE__ */ jsx("code", { children: "mcpfold init" }),
            " — scaffold your canonical config."
          ] }),
          /* @__PURE__ */ jsxs("li", { children: [
            /* @__PURE__ */ jsx("code", { children: "mcpfold import" }),
            " — adopt configs you already have."
          ] }),
          /* @__PURE__ */ jsxs("li", { children: [
            /* @__PURE__ */ jsx("code", { children: "mcpfold sync" }),
            " — fold it out to every client."
          ] })
        ] }),
        /* @__PURE__ */ jsxs("p", { children: [
          "New to it? Try the ",
          /* @__PURE__ */ jsx("a", { href: "/docs/quickstart.html", children: "quickstart" }),
          " or the guided flow:",
          " ",
          /* @__PURE__ */ jsx("code", { children: "mcpfold init --guided" }),
          "."
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx(FaqSection, { path: "/install" })
  ] });
}
function DirectoryList() {
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchDirectory(query), [query]);
  const categories = useMemo(() => categoriesWithPages(), []);
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs(Container, { style: { padding: "var(--space-16) var(--space-6)" }, children: [
      /* @__PURE__ */ jsx("h1", { children: "Best MCP servers — the directory" }),
      /* @__PURE__ */ jsxs("p", { style: { color: "var(--fg-muted)", maxWidth: 640 }, children: [
        "Browse ",
        DIRECTORY$1.length,
        "+ MCP servers, curated and grouped by category. A neutral, community-maintained list — mcpfold is not affiliated with or endorsed by these projects. Add any to your config in one command."
      ] }),
      /* @__PURE__ */ jsx("h2", { style: { marginTop: "var(--space-8)" }, children: "Browse by category" }),
      /* @__PURE__ */ jsx(
        "nav",
        {
          "data-testid": "category-nav",
          style: { display: "flex", flexWrap: "wrap", gap: "var(--space-2)" },
          children: categories.map((c) => /* @__PURE__ */ jsx(
            Link,
            {
              to: `/directory/category/${c.id}`,
              "data-testid": `category-${c.id}`,
              style: {
                fontSize: "0.9rem",
                padding: "4px 12px",
                borderRadius: 999,
                border: "1px solid var(--border)",
                color: "var(--fg-muted)",
                textDecoration: "none"
              },
              children: c.label
            },
            c.id
          ))
        }
      ),
      /* @__PURE__ */ jsx(
        "input",
        {
          type: "search",
          placeholder: "Search servers…",
          "aria-label": "Search servers",
          "data-testid": "directory-search",
          value: query,
          onChange: (e) => setQuery(e.target.value),
          style: {
            width: "100%",
            maxWidth: 420,
            padding: "var(--space-3) var(--space-4)",
            margin: "var(--space-6) 0",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            background: "var(--bg-elevated)",
            color: "var(--fg)"
          }
        }
      ),
      /* @__PURE__ */ jsxs(
        "div",
        {
          style: {
            display: "grid",
            gap: "var(--space-4)",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))"
          },
          children: [
            results.map((entry) => /* @__PURE__ */ jsxs(
              Link,
              {
                to: `/directory/${entry.id}`,
                "data-testid": `entry-${entry.id}`,
                style: {
                  display: "block",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  background: "var(--bg-elevated)",
                  padding: "var(--space-4)",
                  color: "var(--fg)",
                  textDecoration: "none"
                },
                children: [
                  /* @__PURE__ */ jsx("strong", { children: entry.name }),
                  /* @__PURE__ */ jsx(
                    "p",
                    {
                      style: {
                        color: "var(--fg-muted)",
                        margin: "var(--space-2) 0 0",
                        fontSize: "0.92rem"
                      },
                      children: entry.description
                    }
                  )
                ]
              },
              entry.id
            )),
            results.length === 0 && /* @__PURE__ */ jsxs("p", { className: "muted", children: [
              "No servers match “",
              query,
              "”."
            ] })
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsx(FaqSection, { path: "/directory" })
  ] });
}
function CategoryPage() {
  const { cat } = useParams();
  const entries = cat && categoryHasPage(cat) ? entriesForCategory(cat) : [];
  if (!cat || !categoryHasPage(cat)) {
    return /* @__PURE__ */ jsxs(Container, { style: { padding: "var(--space-16) var(--space-6)" }, children: [
      /* @__PURE__ */ jsx("h1", { children: "Category not found" }),
      /* @__PURE__ */ jsxs("p", { children: [
        "No such category. ",
        /* @__PURE__ */ jsx(Link, { to: "/directory", children: "Back to the directory" }),
        "."
      ] })
    ] });
  }
  const m = categoryMeta(cat);
  const others = categoriesWithPages().filter((c) => c.id !== cat);
  return /* @__PURE__ */ jsxs(Container, { style: { padding: "var(--space-16) var(--space-6)" }, children: [
    /* @__PURE__ */ jsx("p", { style: { marginBottom: "var(--space-4)" }, children: /* @__PURE__ */ jsx(Link, { to: "/directory", children: "← All MCP servers" }) }),
    /* @__PURE__ */ jsxs("h1", { children: [
      "Best ",
      m.label,
      " MCP servers"
    ] }),
    /* @__PURE__ */ jsxs("p", { style: { color: "var(--fg-muted)", maxWidth: 640 }, children: [
      m.description,
      " A neutral, community-maintained list — add any to your config in one command."
    ] }),
    /* @__PURE__ */ jsx(
      "div",
      {
        "data-testid": "category-entries",
        style: {
          display: "grid",
          gap: "var(--space-4)",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          margin: "var(--space-6) 0 var(--space-10)"
        },
        children: entries.map((entry) => /* @__PURE__ */ jsxs(
          Link,
          {
            to: `/directory/${entry.id}`,
            "data-testid": `entry-${entry.id}`,
            style: {
              display: "block",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              background: "var(--bg-elevated)",
              padding: "var(--space-4)",
              color: "var(--fg)",
              textDecoration: "none"
            },
            children: [
              /* @__PURE__ */ jsx("strong", { children: entry.name }),
              /* @__PURE__ */ jsx(
                "p",
                {
                  style: {
                    color: "var(--fg-muted)",
                    margin: "var(--space-2) 0 0",
                    fontSize: "0.92rem"
                  },
                  children: entry.description
                }
              )
            ]
          },
          entry.id
        ))
      }
    ),
    /* @__PURE__ */ jsx("h2", { children: "Browse other categories" }),
    /* @__PURE__ */ jsx(
      "nav",
      {
        "data-testid": "category-nav",
        style: { display: "flex", flexWrap: "wrap", gap: "var(--space-2)" },
        children: others.map((c) => /* @__PURE__ */ jsx(
          Link,
          {
            to: `/directory/category/${c.id}`,
            style: {
              fontSize: "0.9rem",
              padding: "4px 12px",
              borderRadius: 999,
              border: "1px solid var(--border)",
              color: "var(--fg-muted)",
              textDecoration: "none"
            },
            children: c.label
          },
          c.id
        ))
      }
    )
  ] });
}
function addTarget(entry) {
  if (entry.transport !== "stdio") return entry.url ?? "";
  const pkg = (entry.args ?? []).find(
    (a) => !a.startsWith("-") && !a.startsWith(".") && /[a-z]/i.test(a)
  );
  return pkg ?? entry.id;
}
function cliSnippet(entry) {
  return `mcpfold add ${addTarget(entry)}`;
}
function editorUrl(entry) {
  return `https://app.mcpfold.com/directory?add=${encodeURIComponent(entry.id)}`;
}
function ServerPage() {
  const { id } = useParams();
  const entry = DIRECTORY$1.find((e) => e.id === id);
  if (!entry) {
    return /* @__PURE__ */ jsxs(Container, { style: { padding: "var(--space-16) var(--space-6)" }, children: [
      /* @__PURE__ */ jsx("h1", { children: "Not found" }),
      /* @__PURE__ */ jsxs("p", { children: [
        "No server “",
        id,
        "”. ",
        /* @__PURE__ */ jsx(Link, { to: "/directory", children: "Back to the directory" }),
        "."
      ] })
    ] });
  }
  const launch = entry.transport === "stdio" ? `${entry.command ?? ""} ${(entry.args ?? []).join(" ")}`.trim() : entry.url ?? "";
  return /* @__PURE__ */ jsx(Fragment, { children: /* @__PURE__ */ jsxs(Container, { style: { padding: "var(--space-16) var(--space-6)", maxWidth: 720 }, children: [
    /* @__PURE__ */ jsx("p", { style: { marginBottom: "var(--space-4)" }, children: /* @__PURE__ */ jsx(Link, { to: "/directory", children: "← Directory" }) }),
    /* @__PURE__ */ jsxs("h1", { style: { marginBottom: "var(--space-2)" }, children: [
      entry.name,
      " MCP server"
    ] }),
    /* @__PURE__ */ jsx("p", { style: { color: "var(--fg-muted)", fontSize: "1.1rem" }, children: entry.description }),
    /* @__PURE__ */ jsx(
      "div",
      {
        style: {
          display: "flex",
          gap: "var(--space-2)",
          flexWrap: "wrap",
          margin: "var(--space-4) 0"
        },
        children: entry.suggestedTags.map(
          (t) => categoryHasPage(t) ? /* @__PURE__ */ jsx(
            Link,
            {
              to: `/directory/category/${t}`,
              "data-testid": `tag-${t}`,
              style: {
                fontSize: "0.8rem",
                padding: "2px 10px",
                borderRadius: 999,
                border: "1px solid var(--border)",
                color: "var(--fg-muted)",
                textDecoration: "none"
              },
              children: categoryMeta(t).label
            },
            t
          ) : /* @__PURE__ */ jsx(
            "span",
            {
              style: {
                fontSize: "0.8rem",
                padding: "2px 10px",
                borderRadius: 999,
                border: "1px solid var(--border)",
                color: "var(--fg-muted)"
              },
              children: t
            },
            t
          )
        )
      }
    ),
    /* @__PURE__ */ jsx("h2", { children: "How it runs" }),
    /* @__PURE__ */ jsxs("p", { style: { color: "var(--fg-muted)" }, children: [
      entry.name,
      " is a ",
      /* @__PURE__ */ jsx("strong", { children: entry.transport }),
      " MCP server. mcpfold launches it with:"
    ] }),
    /* @__PURE__ */ jsx(
      "pre",
      {
        "data-testid": "launch",
        style: {
          background: "var(--code-bg)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "var(--space-4)",
          overflowX: "auto"
        },
        children: /* @__PURE__ */ jsx("code", { children: launch })
      }
    ),
    /* @__PURE__ */ jsx("h2", { children: "Add to your config" }),
    /* @__PURE__ */ jsx(
      "pre",
      {
        "data-testid": "add-snippet",
        style: {
          background: "var(--code-bg)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "var(--space-4)",
          overflowX: "auto"
        },
        children: /* @__PURE__ */ jsx("code", { children: cliSnippet(entry) })
      }
    ),
    entry.tokenRef && /* @__PURE__ */ jsxs("p", { style: { color: "var(--fg-muted)", fontSize: "0.9rem" }, children: [
      "Needs a token — mcpfold stores it as a reference (",
      /* @__PURE__ */ jsx("code", { children: entry.tokenRef }),
      "), never a value."
    ] }),
    /* @__PURE__ */ jsx("p", { children: /* @__PURE__ */ jsx("a", { href: editorUrl(entry), "data-testid": "editor-link", children: "Or add it in the web editor →" }) }),
    /* @__PURE__ */ jsx("p", { style: { color: "var(--fg-muted)", fontSize: "0.85rem", marginTop: "var(--space-8)" }, children: "Listed for convenience; mcpfold is not affiliated with or endorsed by this project." })
  ] }) });
}
const TIERS = [
  {
    id: "oss",
    name: "Open source",
    price: "Free forever",
    tagline: "The whole CLI, MIT-licensed. No account, no limits, runs entirely on your machine.",
    features: [
      "Every adapter + the canonical config",
      "Secret references (env, dotenv, op, keychain, infisical)",
      "sync / diff / doctor / status / test / restore, watch mode, completions",
      "Config-as-code drift gate + the GitHub Action",
      "Self-host the cloud (Supabase + edge) yourself"
    ],
    cta: { label: "Install", href: "/install" }
  },
  {
    id: "cloud-free",
    name: "Cloud Free",
    price: "$0",
    tagline: "Hosted sync for one person, so your config follows you across machines.",
    features: [
      "1 user, up to 3 machines",
      "Push / pull sync with 30-day version history",
      "Per-machine device login + revocation"
    ],
    cta: { label: "Sign up", href: "https://app.mcpfold.com" }
  },
  {
    id: "team",
    name: "Team",
    price: "$6 / user / mo",
    tagline: "Shared team configs with roles and an audit trail — standardize MCP across the team.",
    features: [
      "Everything in Cloud Free",
      "Teams, member roles, shared team config",
      "Full change-audit trail (who changed what, when)",
      "1-year version history + priority support"
    ],
    cta: { label: "Start a team", href: "https://app.mcpfold.com" },
    featured: true
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Contact us",
    tagline: "SSO, self-host support, and an SLA for larger orgs.",
    features: [
      "Everything in Team",
      "SSO / SAML, audit export",
      "Self-hosting support + SLA",
      "Security review + invoicing"
    ],
    cta: { label: "Contact sales", href: "mailto:sales@mcpfold.com" }
  }
];
function PricingPage() {
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs(Container, { style: { padding: "var(--space-16) var(--space-6)" }, children: [
      /* @__PURE__ */ jsx("h1", { style: { textAlign: "center" }, children: "Pricing" }),
      /* @__PURE__ */ jsxs(
        "p",
        {
          style: {
            textAlign: "center",
            color: "var(--fg-muted)",
            maxWidth: 620,
            margin: "0 auto var(--space-8)"
          },
          children: [
            "The CLI and everything local are ",
            /* @__PURE__ */ jsx("strong", { children: "free forever" }),
            " and MIT-licensed. The hosted cloud is the paid surface — or self-host the whole thing yourself for free."
          ]
        }
      ),
      /* @__PURE__ */ jsx(
        "div",
        {
          style: {
            display: "grid",
            gap: "var(--space-6)",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            alignItems: "start"
          },
          children: TIERS.map((tier) => /* @__PURE__ */ jsxs(
            "section",
            {
              "data-testid": `tier-${tier.id}`,
              "aria-labelledby": `tier-${tier.id}-name`,
              style: {
                border: `1px solid ${tier.featured ? "var(--accent)" : "var(--border)"}`,
                borderRadius: "var(--radius)",
                background: "var(--bg-elevated)",
                padding: "var(--space-6)",
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-3)",
                boxShadow: tier.featured ? "0 8px 30px color-mix(in srgb, var(--accent) 20%, transparent)" : "none"
              },
              children: [
                /* @__PURE__ */ jsxs("h2", { id: `tier-${tier.id}-name`, style: { margin: 0, fontSize: "1.2rem" }, children: [
                  tier.name,
                  tier.featured && /* @__PURE__ */ jsx(
                    "span",
                    {
                      style: {
                        marginLeft: "var(--space-2)",
                        fontSize: "0.7rem",
                        color: "var(--accent)"
                      },
                      children: "POPULAR"
                    }
                  )
                ] }),
                /* @__PURE__ */ jsx("div", { style: { fontSize: "1.5rem", fontWeight: 800 }, "data-testid": `price-${tier.id}`, children: tier.price }),
                /* @__PURE__ */ jsx("p", { style: { color: "var(--fg-muted)", margin: 0, minHeight: "3em" }, children: tier.tagline }),
                /* @__PURE__ */ jsx("ul", { style: { paddingLeft: "1.1rem", margin: 0, color: "var(--fg-muted)", flex: 1 }, children: tier.features.map((f) => /* @__PURE__ */ jsx("li", { style: { marginBottom: "var(--space-2)" }, children: f }, f)) }),
                /* @__PURE__ */ jsx(
                  "a",
                  {
                    href: tier.cta.href,
                    "data-testid": `cta-${tier.id}`,
                    style: {
                      display: "block",
                      textAlign: "center",
                      padding: "var(--space-3)",
                      borderRadius: "var(--radius)",
                      fontWeight: 600,
                      textDecoration: "none",
                      background: tier.featured ? "var(--accent)" : "transparent",
                      color: tier.featured ? "var(--accent-fg)" : "var(--fg)",
                      border: tier.featured ? "none" : "1px solid var(--border)"
                    },
                    children: tier.cta.label
                  }
                )
              ]
            },
            tier.id
          ))
        }
      )
    ] }),
    /* @__PURE__ */ jsx(
      FaqSection,
      {
        path: "/pricing",
        moreLink: { href: "/security", text: "How we handle secrets — Security & trust" }
      }
    )
  ] });
}
const REPO$1 = "https://github.com/dj-pearson/MCPFold";
function Section({
  id,
  title,
  children,
  more
}) {
  return /* @__PURE__ */ jsxs("section", { "data-testid": id, style: { marginBottom: "var(--space-10)", maxWidth: 720 }, children: [
    /* @__PURE__ */ jsx("h2", { children: title }),
    /* @__PURE__ */ jsx("div", { style: { color: "var(--fg-muted)" }, children }),
    more && /* @__PURE__ */ jsx("p", { style: { marginTop: "var(--space-3)" }, children: /* @__PURE__ */ jsxs("a", { href: more.href, children: [
      more.text,
      " →"
    ] }) })
  ] });
}
function SecurityPage() {
  return /* @__PURE__ */ jsxs(Container, { style: { padding: "var(--space-16) var(--space-6)" }, children: [
    /* @__PURE__ */ jsx("h1", { children: "Security & trust" }),
    /* @__PURE__ */ jsx("p", { style: { color: "var(--fg-muted)", maxWidth: 720, fontSize: "1.1rem" }, children: "mcpfold manages configuration that lives next to your secrets, so its security posture is a feature, not an afterthought. This page summarizes what it guarantees in plain language and links the authoritative, test-backed docs for each claim — no overstatement." }),
    /* @__PURE__ */ jsxs(
      Section,
      {
        id: "security-secrets",
        title: "Secrets are references, never values",
        more: { href: "/docs/secrets.html", text: "How secrets work" },
        children: [
          /* @__PURE__ */ jsxs("p", { children: [
            "Your canonical config stores secret ",
            /* @__PURE__ */ jsx("strong", { children: "references" }),
            " like",
            " ",
            /* @__PURE__ */ jsx("code", { children: "${env:GITHUB_PAT}" }),
            " or ",
            /* @__PURE__ */ jsx("code", { children: "${op:vault/item/field}" }),
            " — never the resolved value. The reference is the only thing committed to git. mcpfold resolves the real value ",
            /* @__PURE__ */ jsx("strong", { children: "in memory" }),
            " at fold/launch time and injects it into the server process; it is never cached to a temp file."
          ] }),
          /* @__PURE__ */ jsxs("p", { children: [
            "When mcpfold renders a client's config, it keeps the token off disk by rewriting the launch to go through ",
            /* @__PURE__ */ jsx("code", { children: "mcpfold run" }),
            ", or by emitting the client's own secret indirection (for example VS Code's ",
            /* @__PURE__ */ jsx("code", { children: "${input:}" }),
            "). The one way a resolved value is ever written to a file is the explicitly opt-in ",
            /* @__PURE__ */ jsx("code", { children: "inline" }),
            " ",
            "strategy — and even then only if the target file is ",
            /* @__PURE__ */ jsx("strong", { children: "gitignored" }),
            "; otherwise mcpfold refuses and warns. This is the honest boundary, not a blanket “never touches disk”."
          ] })
        ]
      }
    ),
    /* @__PURE__ */ jsx(
      Section,
      {
        id: "security-cloud",
        title: "Nothing sensitive is synced to the cloud",
        more: { href: "/docs/security.html", text: "Read the documented audit" },
        children: /* @__PURE__ */ jsxs("p", { children: [
          "The optional cloud stores only your canonical config with secret references — never values. A push is checked three times: a client-side guard, a server-side ref-only guard, and a database ",
          /* @__PURE__ */ jsx("code", { children: "config_is_ref_only" }),
          " constraint as the final backstop. A non-reference in a secret position is rejected before it can be uploaded."
        ] })
      }
    ),
    /* @__PURE__ */ jsx(
      Section,
      {
        id: "security-local",
        title: "Local-first by default",
        more: { href: "/pricing", text: "What the cloud adds" },
        children: /* @__PURE__ */ jsxs("p", { children: [
          /* @__PURE__ */ jsx("code", { children: "init" }),
          ", ",
          /* @__PURE__ */ jsx("code", { children: "import" }),
          ", ",
          /* @__PURE__ */ jsx("code", { children: "sync" }),
          ", ",
          /* @__PURE__ */ jsx("code", { children: "diff" }),
          ",",
          " ",
          /* @__PURE__ */ jsx("code", { children: "doctor" }),
          ", ",
          /* @__PURE__ */ jsx("code", { children: "scan" }),
          ", and ",
          /* @__PURE__ */ jsx("code", { children: "run" }),
          " all work entirely offline with no account and no server. The cloud is opt-in and adds only cross-machine sync and team sharing — the entire CLI is free and MIT-licensed, and the cloud is self-hostable at no cost."
        ] })
      }
    ),
    /* @__PURE__ */ jsxs(
      Section,
      {
        id: "security-redaction",
        title: "Diagnostics are redacted; telemetry is off by default",
        more: { href: "/docs/security.html", text: "Redaction & telemetry details" },
        children: [
          /* @__PURE__ */ jsxs("p", { children: [
            "All CLI output — ",
            /* @__PURE__ */ jsx("code", { children: "diff" }),
            ", ",
            /* @__PURE__ */ jsx("code", { children: "doctor" }),
            ", ",
            /* @__PURE__ */ jsx("code", { children: "--debug" }),
            ", and the",
            " ",
            /* @__PURE__ */ jsx("code", { children: "diagnose" }),
            " bug-report bundle — flows through a redactor that masks reference paths, registered secrets, and token-shaped strings; the bundle is proven leak-free by test."
          ] }),
          /* @__PURE__ */ jsxs("p", { children: [
            "Telemetry collects ",
            /* @__PURE__ */ jsx("strong", { children: "nothing" }),
            " unless you explicitly set",
            " ",
            /* @__PURE__ */ jsx("code", { children: "MCPFOLD_TELEMETRY=1" }),
            ". When enabled it sends only a small, fixed, allow-listed set of non-identifying fields (command name, CLI/Node version, OS, exit code, duration) — never config, paths, server names, or values. Both ",
            /* @__PURE__ */ jsx("code", { children: "DO_NOT_TRACK=1" }),
            " and",
            " ",
            /* @__PURE__ */ jsx("code", { children: "MCPFOLD_TELEMETRY=0" }),
            " disable it, and opt-out always wins."
          ] })
        ]
      }
    ),
    /* @__PURE__ */ jsxs(
      Section,
      {
        id: "security-integrity",
        title: "Supply-chain & integrity",
        more: { href: "/docs/threat-model.html", text: "Full threat model" },
        children: [
          /* @__PURE__ */ jsxs("p", { children: [
            /* @__PURE__ */ jsx("code", { children: "doctor" }),
            " flags any unpinned ",
            /* @__PURE__ */ jsx("code", { children: "@latest" }),
            " stdio server, and a declared",
            " ",
            /* @__PURE__ */ jsx("code", { children: "pin" }),
            " rewrites ",
            /* @__PURE__ */ jsx("code", { children: "@latest" }),
            " to a fixed version in the rendered client file, so a client launches a known version rather than a moving target.",
            " ",
            /* @__PURE__ */ jsx("code", { children: "mcpfold scan" }),
            " is a security preflight that audits every detected client's on-disk config for the known 2025–26 MCP incident root causes (cleartext secrets, unpinned packages, vulnerable ",
            /* @__PURE__ */ jsx("code", { children: "mcp-remote" }),
            " bridges)."
          ] }),
          /* @__PURE__ */ jsxs("p", { children: [
            "The honest caveat: a server's ",
            /* @__PURE__ */ jsx("code", { children: "command" }),
            "/",
            /* @__PURE__ */ jsx("code", { children: "args" }),
            " are executable code, so a tampered config is a code-execution vector — pinning bounds the supply-chain risk, and trust-on-first-use plus signed synced config harden this further."
          ] })
        ]
      }
    ),
    /* @__PURE__ */ jsx(
      Section,
      {
        id: "security-verified",
        title: "Verified, not just asserted",
        more: { href: "/docs/security-posture.html", text: "Claims → evidence ledger" },
        children: /* @__PURE__ */ jsxs("p", { children: [
          "The refs-only invariant is machine-verified on every relevant path: a leak harness injects a known sentinel and exercises ",
          /* @__PURE__ */ jsx("code", { children: "sync" }),
          "/",
          /* @__PURE__ */ jsx("code", { children: "run" }),
          "/",
          /* @__PURE__ */ jsx("code", { children: "diff" }),
          "/",
          /* @__PURE__ */ jsx("code", { children: "doctor" }),
          "/",
          /* @__PURE__ */ jsx("code", { children: "push" }),
          " across every adapter and strategy, asserting the sentinel appears in zero artifacts (files, backups, temp dirs, stdout/stderr, push payloads). CI also runs gitleaks secret scanning and a production dependency audit on every push. A deliberately introduced leak fails the build."
        ] })
      }
    ),
    /* @__PURE__ */ jsx(Section, { id: "security-disclosure", title: "Reporting a vulnerability", children: /* @__PURE__ */ jsxs("p", { children: [
      "Please report security issues ",
      /* @__PURE__ */ jsx("strong", { children: "privately" }),
      " — do not open a public issue. The preferred path is a",
      " ",
      /* @__PURE__ */ jsx(
        "a",
        {
          href: `${REPO$1}/security/advisories/new`,
          "data-testid": "advisory-link",
          rel: "noreferrer",
          target: "_blank",
          children: "GitHub private security advisory"
        }
      ),
      ", or email ",
      /* @__PURE__ */ jsx("a", { href: "mailto:Dan@DanPearson.net", children: "Dan@DanPearson.net" }),
      ". We aim to acknowledge within 3 business days and to ship a fix before any public disclosure, coordinating a timeline with you. Full policy:",
      " ",
      /* @__PURE__ */ jsx(
        "a",
        {
          href: `${REPO$1}/blob/main/SECURITY.md`,
          "data-testid": "security-md-link",
          rel: "noreferrer",
          target: "_blank",
          children: "SECURITY.md"
        }
      ),
      "."
    ] }) })
  ] });
}
function BlogIndex() {
  return /* @__PURE__ */ jsx(Fragment, { children: /* @__PURE__ */ jsxs(Container, { style: { padding: "var(--space-16) var(--space-6)", maxWidth: 760 }, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "baseline", justifyContent: "space-between" }, children: [
      /* @__PURE__ */ jsx("h1", { children: "Blog" }),
      /* @__PURE__ */ jsx("a", { href: "/feed.xml", "aria-label": "RSS feed", children: "RSS" })
    ] }),
    /* @__PURE__ */ jsx("ul", { style: { listStyle: "none", padding: 0 }, children: POSTS.map((post) => /* @__PURE__ */ jsxs(
      "li",
      {
        "data-testid": `post-${post.slug}`,
        style: { margin: "var(--space-8) 0" },
        children: [
          /* @__PURE__ */ jsx(Link, { to: `/blog/${post.slug}`, style: { fontSize: "1.3rem", fontWeight: 700 }, children: post.title }),
          /* @__PURE__ */ jsx(
            "div",
            {
              style: {
                color: "var(--fg-muted)",
                fontSize: "0.85rem",
                margin: "var(--space-2) 0"
              },
              children: post.date
            }
          ),
          /* @__PURE__ */ jsx("p", { style: { color: "var(--fg-muted)", margin: 0 }, children: post.description })
        ]
      },
      post.slug
    )) })
  ] }) });
}
function BlogPost() {
  const { slug } = useParams();
  const post = postBySlug(slug);
  if (!post) {
    return /* @__PURE__ */ jsxs(Container, { style: { padding: "var(--space-16) var(--space-6)" }, children: [
      /* @__PURE__ */ jsx("h1", { children: "Not found" }),
      /* @__PURE__ */ jsxs("p", { children: [
        "No post “",
        slug,
        "”. ",
        /* @__PURE__ */ jsx(Link, { to: "/blog", children: "Back to the blog" }),
        "."
      ] })
    ] });
  }
  return /* @__PURE__ */ jsx(Fragment, { children: /* @__PURE__ */ jsxs(Container, { style: { padding: "var(--space-16) var(--space-6)", maxWidth: 720 }, children: [
    /* @__PURE__ */ jsx("p", { style: { marginBottom: "var(--space-4)" }, children: /* @__PURE__ */ jsx(Link, { to: "/blog", children: "← Blog" }) }),
    /* @__PURE__ */ jsx("h1", { style: { marginBottom: "var(--space-2)" }, children: post.title }),
    /* @__PURE__ */ jsx("div", { style: { color: "var(--fg-muted)", marginBottom: "var(--space-8)" }, children: post.date }),
    /* @__PURE__ */ jsx(
      "article",
      {
        className: "prose",
        "data-testid": "post-body",
        dangerouslySetInnerHTML: { __html: post.html }
      }
    )
  ] }) });
}
const changelogRaw = "# Changelog\n\nPer-package changelogs are generated by [Changesets](https://github.com/changesets/changesets)\nand live next to each package (`packages/*/CHANGELOG.md`) — this file is the human-readable\nsummary of notable releases.\n\n## Unreleased — v0.1.0 (initial public release)\n\nThe local-first wedge:\n\n- **Canonical format** — one neutral `mcp.config.jsonc` (versioned, JSON-Schema-backed) as the\n  single source of truth, with `${provider:path}` secret references.\n- **Six client adapters** — Cursor, Claude Desktop, Claude Code, VS Code (root key `servers`,\n  `${input:}` secrets), Windsurf (`mcp-remote` wrapping), and Zed (`context_servers`).\n- **CLI** — `init`, `import`, `add`, `sync` (backups + atomic writes), `diff` (CI-gateable\n  drift), `doctor` (catches the silent-failure footguns), `migrate`, and the `run` shim launcher.\n- **Secrets off disk** — fail-closed resolution across env / dotenv / Infisical / OS keychain /\n  1Password, with per-adapter strategies (shim / native-input / inline) so a plaintext token\n  never lands in a client file. Machine-verified by a suite-wide leak harness.\n- **Tool-curation proxy** — trims each server's `tools/list` to an allow/deny set, cutting\n  tool-schema context by **~80%** in the benchmark (45 tools → 9; 7,476 → 1,497 tokens).\n- **Contracts** — stable `--json` envelope + exit codes, deterministic output with `sync --check`,\n  redaction-safe diagnostics, schema versioning + `migrate`, and a defined offline/degraded mode.\n\nPublishing is gated on the `NPM_TOKEN` repo secret; see [docs/launch.md](docs/launch.md).\n";
const html = marked.parse(changelogRaw, { async: false });
function Changelog() {
  return /* @__PURE__ */ jsx(Fragment, { children: /* @__PURE__ */ jsx(Container, { style: { padding: "var(--space-16) var(--space-6)", maxWidth: 720 }, children: /* @__PURE__ */ jsx(
    "article",
    {
      className: "prose",
      "data-testid": "changelog-body",
      dangerouslySetInnerHTML: { __html: html }
    }
  ) }) });
}
const codeBlock$1 = {
  display: "block",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  padding: "var(--space-3) var(--space-4)",
  margin: "var(--space-2) 0 0",
  fontFamily: "var(--font-mono, monospace)",
  fontSize: "0.9rem",
  overflowX: "auto",
  whiteSpace: "pre"
};
function GuidesIndex() {
  return /* @__PURE__ */ jsxs(Container, { style: { padding: "var(--space-16) var(--space-6)" }, children: [
    /* @__PURE__ */ jsx("h1", { children: "Add MCP servers to any client" }),
    /* @__PURE__ */ jsxs("p", { style: { color: "var(--fg-muted)", maxWidth: 680 }, children: [
      "Pick your client for a copy-paste guide to adding MCP servers with mcpfold — one canonical config, folded out to the client’s own native format. Each guide’s config paths and secret handling come straight from mcpfold’s adapter for that client, so they match exactly what ",
      /* @__PURE__ */ jsx("code", { children: "mcpfold sync" }),
      " writes."
    ] }),
    /* @__PURE__ */ jsx(
      "div",
      {
        "data-testid": "guides-index",
        style: {
          display: "grid",
          gap: "var(--space-4)",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          margin: "var(--space-8) 0 var(--space-10)"
        },
        children: GUIDE_CLIENTS.map((c) => /* @__PURE__ */ jsxs(
          Link,
          {
            to: `/guides/${c.id}`,
            "data-testid": `guide-${c.id}`,
            style: {
              display: "block",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              background: "var(--bg-elevated)",
              padding: "var(--space-4)",
              color: "var(--fg)",
              textDecoration: "none"
            },
            children: [
              /* @__PURE__ */ jsx("strong", { children: c.label }),
              /* @__PURE__ */ jsxs(
                "p",
                {
                  style: { color: "var(--fg-muted)", margin: "var(--space-2) 0 0", fontSize: "0.9rem" },
                  children: [
                    "Add MCP servers to ",
                    c.label
                  ]
                }
              )
            ]
          },
          c.id
        ))
      }
    ),
    /* @__PURE__ */ jsxs("p", { children: [
      "New to mcpfold? ",
      /* @__PURE__ */ jsx(Link, { to: "/install", children: "Install it" }),
      ", then browse the",
      " ",
      /* @__PURE__ */ jsx(Link, { to: "/directory", children: "MCP server directory" }),
      " for servers to add."
    ] })
  ] });
}
function Fact({ label, children }) {
  return /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: "var(--space-3)", padding: "var(--space-2) 0" }, children: [
    /* @__PURE__ */ jsx("div", { style: { minWidth: 140, color: "var(--fg-muted)", fontWeight: 600 }, children: label }),
    /* @__PURE__ */ jsx("div", { style: { minWidth: 0 }, children })
  ] });
}
function GuidePage() {
  const { client } = useParams();
  const guide = client ? guideById(client) : void 0;
  if (!guide) {
    return /* @__PURE__ */ jsxs(Container, { style: { padding: "var(--space-16) var(--space-6)" }, children: [
      /* @__PURE__ */ jsx("h1", { children: "Guide not found" }),
      /* @__PURE__ */ jsxs("p", { children: [
        "No setup guide for that client. ",
        /* @__PURE__ */ jsx(Link, { to: "/guides", children: "Browse all client guides" }),
        "."
      ] })
    ] });
  }
  const steps = guideSteps(guide);
  const path = exampleConfigPath(guide);
  return /* @__PURE__ */ jsxs(Container, { style: { padding: "var(--space-16) var(--space-6)" }, children: [
    /* @__PURE__ */ jsx("p", { style: { marginBottom: "var(--space-4)" }, children: /* @__PURE__ */ jsx(Link, { to: "/guides", children: "← All client guides" }) }),
    /* @__PURE__ */ jsxs("h1", { children: [
      "Add MCP servers to ",
      guide.label
    ] }),
    /* @__PURE__ */ jsxs("p", { style: { color: "var(--fg-muted)", maxWidth: 680 }, children: [
      "Manage ",
      guide.label,
      "’s MCP servers from one canonical config with mcpfold — the free, open-source CLI. Write your servers once and fold them out to ",
      guide.label,
      "’s own",
      " ",
      /* @__PURE__ */ jsx("code", { children: guide.configRoot }),
      " config, with secrets kept as references, not hardcoded values."
    ] }),
    /* @__PURE__ */ jsxs("h2", { style: { marginTop: "var(--space-10)" }, children: [
      "Set up ",
      guide.label,
      " in ",
      steps.length,
      " steps"
    ] }),
    /* @__PURE__ */ jsx("ol", { "data-testid": "guide-steps", style: { maxWidth: 720, lineHeight: 1.6 }, children: steps.map((step) => /* @__PURE__ */ jsxs("li", { style: { marginBottom: "var(--space-5)" }, children: [
      /* @__PURE__ */ jsxs("strong", { children: [
        step.name,
        "."
      ] }),
      " ",
      step.text,
      step.command && /* @__PURE__ */ jsx("code", { "data-testid": "guide-command", style: codeBlock$1, children: step.command })
    ] }, step.name)) }),
    /* @__PURE__ */ jsxs("h2", { style: { marginTop: "var(--space-10)" }, children: [
      "What mcpfold writes for ",
      guide.label
    ] }),
    /* @__PURE__ */ jsxs(
      "div",
      {
        "data-testid": "guide-facts",
        style: {
          maxWidth: 720,
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "var(--space-4) var(--space-5)",
          margin: "var(--space-4) 0"
        },
        children: [
          /* @__PURE__ */ jsxs(Fact, { label: "Config file", children: [
            path ? /* @__PURE__ */ jsx("code", { children: path }) : /* @__PURE__ */ jsxs("span", { children: [
              "Managed in ",
              guide.label,
              "’s own settings."
            ] }),
            /* @__PURE__ */ jsxs("div", { style: { color: "var(--fg-muted)", fontSize: "0.85rem", marginTop: 4 }, children: [
              "Windows: ",
              /* @__PURE__ */ jsx("code", { children: guide.paths.windows ?? "—" })
            ] })
          ] }),
          /* @__PURE__ */ jsx(Fact, { label: "Config key", children: /* @__PURE__ */ jsx("code", { children: guide.configRoot }) }),
          /* @__PURE__ */ jsx(Fact, { label: "Secrets", children: secretStrategyNote(guide) }),
          /* @__PURE__ */ jsx(Fact, { label: "Remote servers", children: remoteNote(guide) }),
          /* @__PURE__ */ jsx(Fact, { label: "After sync", children: guide.needsRestart ? `Restart ${guide.label} to load new or changed servers.` : `Changes are picked up without restarting ${guide.label}.` })
        ]
      }
    ),
    /* @__PURE__ */ jsxs("p", { children: [
      "Looking for servers to add? Browse the ",
      /* @__PURE__ */ jsx(Link, { to: "/directory", children: "MCP server directory" }),
      " — every entry adds in one ",
      /* @__PURE__ */ jsx("code", { children: "mcpfold add" }),
      ". Or see the",
      " ",
      /* @__PURE__ */ jsx(Link, { to: "/install", children: "install options" }),
      "."
    ] }),
    /* @__PURE__ */ jsxs("p", { style: { color: "var(--fg-muted)", fontSize: "0.85rem", marginTop: "var(--space-8)" }, children: [
      "mcpfold is an independent, open-source project and is not affiliated with or endorsed by",
      " ",
      guide.label,
      ". Names are used only to describe compatibility."
    ] })
  ] });
}
function GlossaryIndex() {
  return /* @__PURE__ */ jsxs(Container, { style: { padding: "var(--space-16) var(--space-6)" }, children: [
    /* @__PURE__ */ jsx("h1", { children: "MCP glossary" }),
    /* @__PURE__ */ jsx("p", { style: { color: "var(--fg-muted)", maxWidth: 680 }, children: "Plain, accurate definitions of the core Model Context Protocol concepts — what an MCP server is, what a client is, how tools and the context window relate, and how mcpfold fits in. Each page links down to the product, the directory, and the docs." }),
    /* @__PURE__ */ jsx(
      "dl",
      {
        "data-testid": "glossary-index",
        style: { maxWidth: 760, margin: "var(--space-8) 0 var(--space-10)" },
        children: GLOSSARY.map((t) => /* @__PURE__ */ jsxs("div", { style: { marginBottom: "var(--space-6)" }, children: [
          /* @__PURE__ */ jsx("dt", { style: { fontWeight: 700, fontSize: "1.05rem" }, children: /* @__PURE__ */ jsx(Link, { to: `/glossary/${t.id}`, "data-testid": `term-${t.id}`, children: t.term }) }),
          /* @__PURE__ */ jsx("dd", { style: { margin: "var(--space-1) 0 0", color: "var(--fg-muted)" }, children: t.short })
        ] }, t.id))
      }
    ),
    /* @__PURE__ */ jsxs("p", { children: [
      "Ready to use it? ",
      /* @__PURE__ */ jsx(Link, { to: "/install", children: "Install mcpfold" }),
      " or browse the",
      " ",
      /* @__PURE__ */ jsx(Link, { to: "/directory", children: "MCP server directory" }),
      "."
    ] })
  ] });
}
function TermPage() {
  const { term } = useParams();
  const entry = term ? termById(term) : void 0;
  if (!entry) {
    return /* @__PURE__ */ jsxs(Container, { style: { padding: "var(--space-16) var(--space-6)" }, children: [
      /* @__PURE__ */ jsx("h1", { children: "Term not found" }),
      /* @__PURE__ */ jsxs("p", { children: [
        "No such glossary entry. ",
        /* @__PURE__ */ jsx(Link, { to: "/glossary", children: "Back to the glossary" }),
        "."
      ] })
    ] });
  }
  return /* @__PURE__ */ jsxs(Container, { style: { padding: "var(--space-16) var(--space-6)" }, children: [
    /* @__PURE__ */ jsx("p", { style: { marginBottom: "var(--space-4)" }, children: /* @__PURE__ */ jsx(Link, { to: "/glossary", children: "← MCP glossary" }) }),
    /* @__PURE__ */ jsx("h1", { children: entry.heading }),
    entry.aka && entry.aka.length > 0 && /* @__PURE__ */ jsxs("p", { style: { color: "var(--fg-muted)", fontSize: "0.9rem", marginTop: 0 }, children: [
      "Also: ",
      entry.aka.join(", ")
    ] }),
    /* @__PURE__ */ jsx(
      "p",
      {
        "data-testid": "definition",
        style: {
          fontSize: "1.15rem",
          lineHeight: 1.5,
          maxWidth: 720,
          borderLeft: "3px solid var(--accent)",
          paddingLeft: "var(--space-4)",
          margin: "var(--space-4) 0 var(--space-8)"
        },
        children: entry.short
      }
    ),
    /* @__PURE__ */ jsx("div", { style: { maxWidth: 720, lineHeight: 1.7 }, children: entry.body.map((para, i) => /* @__PURE__ */ jsx("p", { style: { marginBottom: "var(--space-4)" }, children: para }, i)) }),
    /* @__PURE__ */ jsx("h2", { style: { marginTop: "var(--space-8)" }, children: "Related" }),
    /* @__PURE__ */ jsx("ul", { "data-testid": "term-related", children: entry.related.map((l) => /* @__PURE__ */ jsx("li", { style: { marginBottom: "var(--space-2)" }, children: l.href.startsWith("/docs/") || l.href.startsWith("http") ? /* @__PURE__ */ jsx("a", { href: l.href, children: l.text }) : /* @__PURE__ */ jsx(Link, { to: l.href, children: l.text }) }, l.href)) }),
    /* @__PURE__ */ jsx("p", { style: { color: "var(--fg-muted)", fontSize: "0.85rem", marginTop: "var(--space-8)" }, children: "mcpfold is an independent, open-source project. The Model Context Protocol is an open standard; mcpfold is not affiliated with or endorsed by the MCP project." })
  ] });
}
const cell = {
  border: "1px solid var(--border)",
  padding: "var(--space-3)",
  textAlign: "left",
  verticalAlign: "top"
};
function CompareIndex() {
  return /* @__PURE__ */ jsxs(Container, { style: { padding: "var(--space-16) var(--space-6)" }, children: [
    /* @__PURE__ */ jsx("h1", { children: "How mcpfold compares" }),
    /* @__PURE__ */ jsx("p", { style: { color: "var(--fg-muted)", maxWidth: 680 }, children: "Honest, factual comparisons of the ways to manage MCP servers across clients — by hand, with a hosted gateway, or with mcpfold — so you can see where each one fits. mcpfold is a local-first, open-source CLI; these pages are clear about what it is and is not." }),
    /* @__PURE__ */ jsx("ul", { "data-testid": "compare-index", style: { maxWidth: 720, margin: "var(--space-8) 0" }, children: COMPARISONS.map((c) => /* @__PURE__ */ jsxs("li", { style: { marginBottom: "var(--space-4)" }, children: [
      /* @__PURE__ */ jsx(Link, { to: `/compare/${c.id}`, "data-testid": `compare-${c.id}`, children: /* @__PURE__ */ jsx("strong", { children: c.h1 }) }),
      /* @__PURE__ */ jsx("p", { style: { color: "var(--fg-muted)", margin: "var(--space-1) 0 0" }, children: c.intro })
    ] }, c.id)) }),
    /* @__PURE__ */ jsxs("p", { children: [
      "Ready to try it? ",
      /* @__PURE__ */ jsx(Link, { to: "/install", children: "Install mcpfold" }),
      " or browse the",
      " ",
      /* @__PURE__ */ jsx(Link, { to: "/directory", children: "MCP server directory" }),
      "."
    ] })
  ] });
}
function ComparePage() {
  const { id } = useParams();
  const entry = id ? comparisonById(id) : void 0;
  if (!entry) {
    return /* @__PURE__ */ jsxs(Container, { style: { padding: "var(--space-16) var(--space-6)" }, children: [
      /* @__PURE__ */ jsx("h1", { children: "Comparison not found" }),
      /* @__PURE__ */ jsxs("p", { children: [
        "No such comparison. ",
        /* @__PURE__ */ jsx(Link, { to: "/compare", children: "See all comparisons" }),
        "."
      ] })
    ] });
  }
  return /* @__PURE__ */ jsxs(Container, { style: { padding: "var(--space-16) var(--space-6)" }, children: [
    /* @__PURE__ */ jsx("p", { style: { marginBottom: "var(--space-4)" }, children: /* @__PURE__ */ jsx(Link, { to: "/compare", children: "← All comparisons" }) }),
    /* @__PURE__ */ jsx("h1", { children: entry.h1 }),
    /* @__PURE__ */ jsx(
      "p",
      {
        "data-testid": "compare-intro",
        style: { fontSize: "1.1rem", lineHeight: 1.55, maxWidth: 720, color: "var(--fg)" },
        children: entry.intro
      }
    ),
    /* @__PURE__ */ jsx("div", { style: { overflowX: "auto", margin: "var(--space-8) 0" }, children: /* @__PURE__ */ jsxs(
      "table",
      {
        "data-testid": "compare-table",
        style: { borderCollapse: "collapse", width: "100%", minWidth: 520 },
        children: [
          /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
            /* @__PURE__ */ jsx("th", { style: { ...cell, background: "var(--bg-elevated)" } }),
            entry.table.columns.map((col) => /* @__PURE__ */ jsx(
              "th",
              {
                style: { ...cell, background: "var(--bg-elevated)", fontWeight: 700 },
                children: col
              },
              col
            ))
          ] }) }),
          /* @__PURE__ */ jsx("tbody", { children: entry.table.rows.map((row) => /* @__PURE__ */ jsxs("tr", { children: [
            /* @__PURE__ */ jsx("th", { scope: "row", style: { ...cell, fontWeight: 600 }, children: row.dimension }),
            row.cells.map((c, i) => /* @__PURE__ */ jsx("td", { style: cell, children: c }, i))
          ] }, row.dimension)) })
        ]
      }
    ) }),
    /* @__PURE__ */ jsx("div", { style: { maxWidth: 720, lineHeight: 1.7 }, children: entry.body.map((para, i) => /* @__PURE__ */ jsx("p", { style: { marginBottom: "var(--space-4)" }, children: para }, i)) }),
    /* @__PURE__ */ jsx("h2", { style: { marginTop: "var(--space-8)" }, children: "Related" }),
    /* @__PURE__ */ jsx("ul", { "data-testid": "compare-related", children: entry.related.map((l) => /* @__PURE__ */ jsx("li", { style: { marginBottom: "var(--space-2)" }, children: l.href.startsWith("/docs/") || l.href.startsWith("http") ? /* @__PURE__ */ jsx("a", { href: l.href, children: l.text }) : /* @__PURE__ */ jsx(Link, { to: l.href, children: l.text }) }, l.href)) }),
    /* @__PURE__ */ jsx("p", { style: { color: "var(--fg-muted)", fontSize: "0.85rem", marginTop: "var(--space-8)" }, children: "mcpfold is an independent, open-source project and is not affiliated with or endorsed by the MCP project or any other tool named here. Comparisons describe categories factually." })
  ] });
}
const codeBlock = {
  display: "block",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  padding: "var(--space-4)",
  margin: "var(--space-2) 0 0",
  fontFamily: "var(--font-mono, monospace)",
  fontSize: "0.86rem",
  lineHeight: 1.55,
  overflowX: "auto",
  whiteSpace: "pre"
};
function FeaturesIndex() {
  return /* @__PURE__ */ jsxs(Container, { style: { padding: "var(--space-16) var(--space-6)" }, children: [
    /* @__PURE__ */ jsx("h1", { children: "What mcpfold does" }),
    /* @__PURE__ */ jsx("p", { style: { color: "var(--fg-muted)", maxWidth: 680 }, children: "Four capabilities, one CLI: keep one config for every client, curate tools to cut the context-window tax, keep secrets as references, and preview and guard every change. Go deep on the one that matters to you." }),
    /* @__PURE__ */ jsx(
      "div",
      {
        "data-testid": "features-index",
        style: {
          display: "grid",
          gap: "var(--space-4)",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          margin: "var(--space-8) 0 var(--space-10)"
        },
        children: FEATURES.map((f) => /* @__PURE__ */ jsxs(
          Link,
          {
            to: `/features/${f.id}`,
            "data-testid": `feature-${f.id}`,
            style: {
              display: "block",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              background: "var(--bg-elevated)",
              padding: "var(--space-4)",
              color: "var(--fg)",
              textDecoration: "none"
            },
            children: [
              /* @__PURE__ */ jsx("strong", { children: f.h1 }),
              /* @__PURE__ */ jsx(
                "p",
                {
                  style: { color: "var(--fg-muted)", margin: "var(--space-2) 0 0", fontSize: "0.9rem" },
                  children: f.tagline
                }
              )
            ]
          },
          f.id
        ))
      }
    ),
    /* @__PURE__ */ jsxs("p", { children: [
      "New here? ",
      /* @__PURE__ */ jsx(Link, { to: "/install", children: "Install mcpfold" }),
      " or browse the",
      " ",
      /* @__PURE__ */ jsx(Link, { to: "/directory", children: "MCP server directory" }),
      "."
    ] })
  ] });
}
function FeaturePage() {
  const { id } = useParams();
  const feature = id ? featureById(id) : void 0;
  if (!feature) {
    return /* @__PURE__ */ jsxs(Container, { style: { padding: "var(--space-16) var(--space-6)" }, children: [
      /* @__PURE__ */ jsx("h1", { children: "Feature not found" }),
      /* @__PURE__ */ jsxs("p", { children: [
        "No such feature. ",
        /* @__PURE__ */ jsx(Link, { to: "/features", children: "See all features" }),
        "."
      ] })
    ] });
  }
  const related = feature.related.map(featureById).filter((f) => !!f);
  return /* @__PURE__ */ jsxs(Container, { style: { padding: "var(--space-16) var(--space-6)" }, children: [
    /* @__PURE__ */ jsx("p", { style: { marginBottom: "var(--space-4)" }, children: /* @__PURE__ */ jsx(Link, { to: "/features", children: "← All features" }) }),
    /* @__PURE__ */ jsx("h1", { children: feature.h1 }),
    /* @__PURE__ */ jsx(
      "p",
      {
        "data-testid": "feature-tagline",
        style: { fontSize: "1.15rem", lineHeight: 1.5, maxWidth: 720, color: "var(--fg)" },
        children: feature.tagline
      }
    ),
    /* @__PURE__ */ jsx("div", { style: { maxWidth: 720, lineHeight: 1.7, margin: "var(--space-6) 0" }, children: feature.body.map((para, i) => /* @__PURE__ */ jsx("p", { style: { marginBottom: "var(--space-4)" }, children: para }, i)) }),
    /* @__PURE__ */ jsx("h2", { children: feature.example.label }),
    /* @__PURE__ */ jsx("code", { "data-testid": "feature-example", style: codeBlock, children: feature.example.code }),
    /* @__PURE__ */ jsx("h2", { style: { marginTop: "var(--space-8)" }, children: "Go deeper" }),
    /* @__PURE__ */ jsx("ul", { "data-testid": "feature-docs", children: feature.docs.map((d) => /* @__PURE__ */ jsx("li", { style: { marginBottom: "var(--space-2)" }, children: d.href.startsWith("/docs/") || d.href.startsWith("http") ? /* @__PURE__ */ jsx("a", { href: d.href, children: d.text }) : /* @__PURE__ */ jsx(Link, { to: d.href, children: d.text }) }, d.href)) }),
    related.length > 0 && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("h2", { style: { marginTop: "var(--space-8)" }, children: "Related features" }),
      /* @__PURE__ */ jsx("ul", { "data-testid": "feature-related", children: related.map((f) => /* @__PURE__ */ jsx("li", { style: { marginBottom: "var(--space-2)" }, children: /* @__PURE__ */ jsx(Link, { to: `/features/${f.id}`, children: f.h1 }) }, f.id)) })
    ] }),
    /* @__PURE__ */ jsxs("p", { style: { marginTop: "var(--space-8)" }, children: [
      "Ready to try it? ",
      /* @__PURE__ */ jsx(Link, { to: "/install", children: "Install mcpfold" }),
      " — the CLI is free and MIT-licensed. Or head ",
      /* @__PURE__ */ jsx(Link, { to: "/", children: "back to the overview" }),
      "."
    ] })
  ] });
}
function UseCasesIndex() {
  return /* @__PURE__ */ jsxs(Container, { style: { padding: "var(--space-16) var(--space-6)" }, children: [
    /* @__PURE__ */ jsx("h1", { children: "Who mcpfold is for" }),
    /* @__PURE__ */ jsx("p", { style: { color: "var(--fg-muted)", maxWidth: 680 }, children: "The same product, framed around your situation — whether you’re wrangling MCP config across your own clients, standardizing a team’s setup from a repo, or curating tools to cut the context-window tax." }),
    /* @__PURE__ */ jsx(
      "div",
      {
        "data-testid": "use-cases-index",
        style: {
          display: "grid",
          gap: "var(--space-4)",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          margin: "var(--space-8) 0 var(--space-10)"
        },
        children: USE_CASES.map((u) => /* @__PURE__ */ jsxs(
          Link,
          {
            to: `/use-cases/${u.id}`,
            "data-testid": `use-case-${u.id}`,
            style: {
              display: "block",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              background: "var(--bg-elevated)",
              padding: "var(--space-4)",
              color: "var(--fg)",
              textDecoration: "none"
            },
            children: [
              /* @__PURE__ */ jsx("strong", { children: u.h1 }),
              /* @__PURE__ */ jsx(
                "p",
                {
                  style: { color: "var(--fg-muted)", margin: "var(--space-2) 0 0", fontSize: "0.9rem" },
                  children: u.tagline
                }
              )
            ]
          },
          u.id
        ))
      }
    )
  ] });
}
function UseCasePage() {
  const { id } = useParams();
  const uc = id ? useCaseById(id) : void 0;
  if (!uc) {
    return /* @__PURE__ */ jsxs(Container, { style: { padding: "var(--space-16) var(--space-6)" }, children: [
      /* @__PURE__ */ jsx("h1", { children: "Use case not found" }),
      /* @__PURE__ */ jsxs("p", { children: [
        "No such use case. ",
        /* @__PURE__ */ jsx(Link, { to: "/use-cases", children: "See who mcpfold is for" }),
        "."
      ] })
    ] });
  }
  const related = uc.related.map(useCaseById).filter((u) => !!u);
  return /* @__PURE__ */ jsxs(Container, { style: { padding: "var(--space-16) var(--space-6)" }, children: [
    /* @__PURE__ */ jsx("p", { style: { marginBottom: "var(--space-4)" }, children: /* @__PURE__ */ jsx(Link, { to: "/use-cases", children: "← Who mcpfold is for" }) }),
    /* @__PURE__ */ jsx("h1", { children: uc.h1 }),
    /* @__PURE__ */ jsx(
      "p",
      {
        "data-testid": "use-case-tagline",
        style: { fontSize: "1.15rem", lineHeight: 1.5, maxWidth: 720, color: "var(--fg)" },
        children: uc.tagline
      }
    ),
    /* @__PURE__ */ jsx("div", { style: { maxWidth: 720, lineHeight: 1.7, margin: "var(--space-6) 0" }, children: uc.body.map((para, i) => /* @__PURE__ */ jsx("p", { style: { marginBottom: "var(--space-4)" }, children: para }, i)) }),
    /* @__PURE__ */ jsx(
      "ul",
      {
        "data-testid": "use-case-highlights",
        style: { maxWidth: 720, listStyle: "none", padding: 0, margin: "0 0 var(--space-8)" },
        children: uc.highlights.map((h) => /* @__PURE__ */ jsxs("li", { style: { marginBottom: "var(--space-3)" }, children: [
          /* @__PURE__ */ jsxs("strong", { children: [
            h.title,
            "."
          ] }),
          " ",
          /* @__PURE__ */ jsx("span", { style: { color: "var(--fg-muted)" }, children: h.text })
        ] }, h.title))
      }
    ),
    /* @__PURE__ */ jsxs(
      "div",
      {
        "data-testid": "use-case-cta",
        style: { display: "flex", gap: "var(--space-3)", flexWrap: "wrap" },
        children: [
          /* @__PURE__ */ jsx(Button, { href: uc.primaryCta.href, children: uc.primaryCta.text }),
          uc.secondaryCta && /* @__PURE__ */ jsx(Button, { href: uc.secondaryCta.href, variant: "ghost", children: uc.secondaryCta.text })
        ]
      }
    ),
    related.length > 0 && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("h2", { style: { marginTop: "var(--space-10)" }, children: "Other use cases" }),
      /* @__PURE__ */ jsx("ul", { "data-testid": "use-case-related", children: related.map((u) => /* @__PURE__ */ jsx("li", { style: { marginBottom: "var(--space-2)" }, children: /* @__PURE__ */ jsx(Link, { to: `/use-cases/${u.id}`, children: u.h1 }) }, u.id)) })
    ] })
  ] });
}
const REPO = "dj-pearson/MCPFold";
const GH = `https://github.com/${REPO}`;
function useGitHubSignals() {
  const [stars, setStars] = useState(null);
  const [contributors, setContributors] = useState(null);
  useEffect(() => {
    let alive = true;
    fetch(`https://api.github.com/repos/${REPO}`).then((r) => r.ok ? r.json() : Promise.reject(new Error(String(r.status)))).then((d) => {
      if (alive && typeof d.stargazers_count === "number") setStars(d.stargazers_count);
    }).catch(() => {
    });
    fetch(`https://api.github.com/repos/${REPO}/contributors?per_page=1&anon=1`).then((r) => {
      if (!r.ok) return Promise.reject(new Error(String(r.status)));
      const link = r.headers.get("link");
      const m = link && /[?&]page=(\d+)>;\s*rel="last"/.exec(link);
      if (m) return Number(m[1]);
      return r.json().then((arr) => Array.isArray(arr) ? arr.length : null);
    }).then((n) => {
      if (alive && typeof n === "number") setContributors(n);
    }).catch(() => {
    });
    return () => {
      alive = false;
    };
  }, []);
  return { stars, contributors };
}
const card$1 = {
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  background: "var(--bg-elevated)",
  padding: "var(--space-6)",
  margin: "var(--space-6) 0"
};
function About() {
  const { stars, contributors } = useGitHubSignals();
  return /* @__PURE__ */ jsxs(Container, { style: { padding: "var(--space-16) var(--space-6)", maxWidth: 820 }, children: [
    /* @__PURE__ */ jsx("h1", { children: "About mcpfold" }),
    /* @__PURE__ */ jsx("p", { style: { fontSize: "1.15rem", lineHeight: 1.5, color: "var(--fg)" }, children: "mcpfold is a free, open-source CLI that gives you one source of truth for your MCP servers — one canonical config, folded out to every client — so you stop hand-editing a different file for each tool." }),
    /* @__PURE__ */ jsx("h2", { children: "The mission" }),
    /* @__PURE__ */ jsxs("p", { children: [
      "Every MCP client keeps its servers in its own file and its own shape, and every server dumps its full tool schema into the model’s context whether you use it or not. mcpfold exists to fix both: own one neutral, portable ",
      /* @__PURE__ */ jsx("code", { children: "mcp.config.jsonc" }),
      " format that renders to every client, and curate the tools that load so you stop paying the context-window tax. Secrets stay as references, never values."
    ] }),
    /* @__PURE__ */ jsx("h2", { children: "Open source, with a clear line" }),
    /* @__PURE__ */ jsxs("p", { children: [
      "The CLI and everything local — the config format, the adapters, the proxy, secret resolution — are ",
      /* @__PURE__ */ jsx("strong", { children: "free forever and MIT-licensed" }),
      ". There is no paid tier hiding local features behind a login."
    ] }),
    /* @__PURE__ */ jsxs("p", { children: [
      "The only commercial surface is the optional hosted ",
      /* @__PURE__ */ jsx("strong", { children: "team cloud" }),
      " — shared configs, an audit trail, and managed sync — which you can also",
      " ",
      /* @__PURE__ */ jsx(Link, { to: "/pricing", children: "self-host for free" }),
      ". Even then, only config with secret",
      " ",
      /* @__PURE__ */ jsx("em", { children: "references" }),
      " is ever synced; secret values never leave your machine. mcpfold stays local-first and is deliberately not a hosted enterprise MCP gateway."
    ] }),
    /* @__PURE__ */ jsxs("div", { "data-testid": "project-signals", style: card$1, children: [
      /* @__PURE__ */ jsx("h2", { style: { marginTop: 0 }, children: "Project signals" }),
      /* @__PURE__ */ jsxs(
        "ul",
        {
          style: {
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--space-6)",
            listStyle: "none",
            padding: 0,
            margin: 0,
            color: "var(--fg-muted)"
          },
          children: [
            /* @__PURE__ */ jsxs("li", { children: [
              "Latest release:",
              " ",
              /* @__PURE__ */ jsx("a", { href: "https://www.npmjs.com/package/mcpfold", rel: "noreferrer", target: "_blank", children: /* @__PURE__ */ jsx("strong", { "data-testid": "latest-release", children: `v${"1.0.2"}` }) })
            ] }),
            /* @__PURE__ */ jsxs("li", { children: [
              /* @__PURE__ */ jsx("a", { href: GH, "data-testid": "about-github", rel: "noreferrer", target: "_blank", children: "GitHub" }),
              stars !== null && /* @__PURE__ */ jsxs(Fragment, { children: [
                " — ",
                /* @__PURE__ */ jsxs("strong", { "data-testid": "about-stars", children: [
                  "★ ",
                  stars.toLocaleString("en-US")
                ] })
              ] })
            ] }),
            contributors !== null && /* @__PURE__ */ jsxs("li", { children: [
              /* @__PURE__ */ jsx("strong", { "data-testid": "about-contributors", children: contributors.toLocaleString("en-US") }),
              " ",
              "contributors"
            ] }),
            /* @__PURE__ */ jsx("li", { children: /* @__PURE__ */ jsx("a", { href: `${GH}/blob/main/LICENSE`, rel: "noreferrer", target: "_blank", children: "MIT license" }) })
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsx("h2", { children: "Get involved" }),
    /* @__PURE__ */ jsxs("p", { children: [
      "mcpfold is built in the open and adding a client is a one-PR job — the fastest way to help is to ",
      /* @__PURE__ */ jsx("a", { href: "/docs/adapters.html", children: "contribute an adapter" }),
      " for a client you use (there’s a ",
      /* @__PURE__ */ jsx("code", { children: "mcpfold scaffold-adapter" }),
      " command to start you off)."
    ] }),
    /* @__PURE__ */ jsxs("ul", { "data-testid": "about-links", children: [
      /* @__PURE__ */ jsx("li", { children: /* @__PURE__ */ jsx("a", { href: GH, rel: "noreferrer", target: "_blank", children: "Source on GitHub" }) }),
      /* @__PURE__ */ jsx("li", { children: /* @__PURE__ */ jsx("a", { href: `${GH}/blob/main/CONTRIBUTING.md`, rel: "noreferrer", target: "_blank", children: "Contributing guide" }) }),
      /* @__PURE__ */ jsx("li", { children: /* @__PURE__ */ jsx("a", { href: "/docs/governance.html", children: "Project governance" }) }),
      /* @__PURE__ */ jsx("li", { children: /* @__PURE__ */ jsx("a", { href: "/docs/roadmap.html", children: "Roadmap" }) }),
      /* @__PURE__ */ jsx("li", { children: /* @__PURE__ */ jsx("a", { href: "/docs/adapters.html", children: "Write an adapter" }) })
    ] }),
    /* @__PURE__ */ jsx("p", { style: { color: "var(--fg-muted)", fontSize: "0.85rem", marginTop: "var(--space-8)" }, children: "mcpfold is an independent, open-source project. The Model Context Protocol is an open standard; mcpfold is not affiliated with or endorsed by the MCP project." })
  ] });
}
function LegalPage({ id }) {
  const doc = legalDocById(id);
  if (!doc) {
    return /* @__PURE__ */ jsxs(Container, { style: { padding: "var(--space-16) var(--space-6)" }, children: [
      /* @__PURE__ */ jsx("h1", { children: "Page not found" }),
      /* @__PURE__ */ jsxs("p", { children: [
        "No such policy. ",
        /* @__PURE__ */ jsx(Link, { to: "/", children: "Back home" }),
        "."
      ] })
    ] });
  }
  return /* @__PURE__ */ jsxs(Container, { style: { padding: "var(--space-16) var(--space-6)", maxWidth: 760 }, children: [
    /* @__PURE__ */ jsx("h1", { children: doc.title }),
    /* @__PURE__ */ jsxs("p", { "data-testid": "legal-effective", style: { color: "var(--fg-muted)", fontSize: "0.9rem" }, children: [
      "Version ",
      doc.version,
      " · Effective ",
      doc.effectiveDate
    ] }),
    /* @__PURE__ */ jsx("p", { style: { fontSize: "1.05rem", lineHeight: 1.6 }, children: doc.intro }),
    doc.sections.map((section) => /* @__PURE__ */ jsxs("section", { style: { marginTop: "var(--space-6)" }, children: [
      /* @__PURE__ */ jsx("h2", { children: section.heading }),
      section.paragraphs.map((para, i) => /* @__PURE__ */ jsx("p", { style: { lineHeight: 1.7 }, children: para }, i))
    ] }, section.heading)),
    /* @__PURE__ */ jsxs("p", { style: { color: "var(--fg-muted)", fontSize: "0.9rem", marginTop: "var(--space-10)" }, children: [
      "See also: ",
      /* @__PURE__ */ jsx(Link, { to: "/privacy", children: "Privacy" }),
      " · ",
      /* @__PURE__ */ jsx(Link, { to: "/terms", children: "Terms" }),
      " ·",
      " ",
      /* @__PURE__ */ jsx(Link, { to: "/analytics", children: "Analytics & cookies" }),
      " · ",
      /* @__PURE__ */ jsx(Link, { to: "/security", children: "Security" })
    ] })
  ] });
}
const GITHUB = "https://github.com/dj-pearson/MCPFold";
const cardStyle = {
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  background: "var(--bg-elevated)",
  padding: "var(--space-5)"
};
function Ext({ href, children }) {
  return /* @__PURE__ */ jsx("a", { href, rel: "noreferrer", target: "_blank", children });
}
function Community() {
  return /* @__PURE__ */ jsxs(Container, { style: { padding: "var(--space-16) var(--space-6)", maxWidth: 820 }, children: [
    /* @__PURE__ */ jsx("h1", { children: "Community & support" }),
    /* @__PURE__ */ jsx("p", { style: { fontSize: "1.1rem", lineHeight: 1.55, color: "var(--fg)" }, children: "mcpfold is built in the open. Whether you’re stuck, found a bug, or want to add support for a client you use, here’s the fastest way to the right place." }),
    /* @__PURE__ */ jsxs(
      "div",
      {
        "data-testid": "community-channels",
        style: {
          display: "grid",
          gap: "var(--space-4)",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          margin: "var(--space-8) 0"
        },
        children: [
          /* @__PURE__ */ jsxs("section", { style: cardStyle, children: [
            /* @__PURE__ */ jsx("h2", { style: { marginTop: 0 }, children: "Get help" }),
            /* @__PURE__ */ jsxs("p", { style: { color: "var(--fg-muted)" }, children: [
              "Questions and how-tos are best in",
              " ",
              /* @__PURE__ */ jsx(Ext, { href: `${GITHUB}/discussions`, children: "GitHub Discussions" }),
              " — the project’s community forum. Search ",
              /* @__PURE__ */ jsx(Ext, { href: `${GITHUB}/issues`, children: "existing issues" }),
              " first in case it’s already known."
            ] })
          ] }),
          /* @__PURE__ */ jsxs("section", { style: cardStyle, children: [
            /* @__PURE__ */ jsx("h2", { style: { marginTop: 0 }, children: "Request or add a client" }),
            /* @__PURE__ */ jsxs("p", { style: { color: "var(--fg-muted)" }, children: [
              "Want a client mcpfold doesn’t support yet? Open an",
              " ",
              /* @__PURE__ */ jsx(Ext, { href: `${GITHUB}/issues/new?template=adapter_request.yml`, children: "adapter request" }),
              ". Adding one is a one-PR job — see the ",
              /* @__PURE__ */ jsx("a", { href: "/docs/adapters.html", children: "adapter guide" }),
              " and",
              " ",
              /* @__PURE__ */ jsx(Ext, { href: `${GITHUB}/blob/main/CONTRIBUTING.md`, children: "CONTRIBUTING" }),
              "."
            ] })
          ] })
        ]
      }
    ),
    /* @__PURE__ */ jsxs("section", { "data-testid": "bug-guidance", style: { ...cardStyle, margin: "var(--space-4) 0" }, children: [
      /* @__PURE__ */ jsx("h2", { style: { marginTop: 0 }, children: "Report a bug" }),
      /* @__PURE__ */ jsxs("p", { style: { color: "var(--fg-muted)" }, children: [
        "The best bug reports come with a diagnostics bundle. Run ",
        /* @__PURE__ */ jsx("code", { children: "mcpfold diagnose" }),
        " — it collects your environment and the shape of your config with",
        " ",
        /* @__PURE__ */ jsx("strong", { children: "secrets and personal paths redacted" }),
        ", so it’s safe to attach. Then open a",
        " ",
        /* @__PURE__ */ jsx(Ext, { href: `${GITHUB}/issues/new?template=bug_report.yml`, children: "bug report" }),
        " and include it, plus what you expected versus what happened."
      ] }),
      /* @__PURE__ */ jsxs("p", { style: { color: "var(--fg-muted)", margin: 0 }, children: [
        "The bundle never contains secret values — see how redaction works on the",
        " ",
        /* @__PURE__ */ jsx(Link, { to: "/security", children: "security page" }),
        ", and the full command contract in the",
        " ",
        /* @__PURE__ */ jsx("a", { href: "/docs/cli-contract.html", children: "CLI docs" }),
        "."
      ] })
    ] }),
    /* @__PURE__ */ jsx("h2", { children: "Stay in the loop & support the project" }),
    /* @__PURE__ */ jsxs("ul", { "data-testid": "community-links", children: [
      /* @__PURE__ */ jsxs("li", { children: [
        /* @__PURE__ */ jsx(Link, { to: "/blog", children: "Blog" }),
        " — launches and deep-dives."
      ] }),
      /* @__PURE__ */ jsxs("li", { children: [
        /* @__PURE__ */ jsx(Link, { to: "/changelog", children: "Changelog" }),
        " — what shipped."
      ] }),
      /* @__PURE__ */ jsxs("li", { children: [
        /* @__PURE__ */ jsx("a", { href: "/docs/governance.html", children: "Project governance" }),
        " — how decisions get made."
      ] }),
      /* @__PURE__ */ jsxs("li", { children: [
        /* @__PURE__ */ jsx(Ext, { href: "https://github.com/sponsors/dj-pearson", children: "Sponsor" }),
        " — support the work."
      ] })
    ] }),
    /* @__PURE__ */ jsxs("p", { style: { color: "var(--fg-muted)", fontSize: "0.85rem", marginTop: "var(--space-8)" }, children: [
      "mcpfold is an independent, open-source project and is not affiliated with or endorsed by the MCP project. To report a security vulnerability privately, see the",
      " ",
      /* @__PURE__ */ jsx(Link, { to: "/security", children: "security page" }),
      "."
    ] })
  ] });
}
const roadmapRaw = "# Roadmap\n\nA living, public view of where mcpfold is headed. Priorities are driven by the\n[opt-in adoption signal](./telemetry.md), open issues, and the [adapter coverage](./coverage.md)\ngaps. Nothing here is a dated commitment.\n\n## Shipped\n\n- **Local core:** canonical `mcp.config.jsonc`, 8 client adapters, secret references,\n  `sync`/`diff`/`doctor`/`status`/`test`/`restore`, watch mode, guided onboarding, completions.\n- **Distribution:** npm, Homebrew, `curl | sh`, Scoop/winget, standalone binaries, update notifier.\n- **Team-without-a-backend:** repo config-as-code drift gate + the packaged GitHub Action.\n- **Cloud:** self-hosted Supabase + edge sync, device-code login, refresh-token rotation, the web\n  console (visual editor, sync dashboard, team console + audit trail).\n- **Site:** marketing site, interactive benchmark, install page, unified docs + search, server\n  directory.\n\n## Next\n\n- **Pricing + billing:** wire Stripe to the [entitlement checker](./pricing-model.md#billing) and\n  ship the pricing page (S13.6).\n- **Adapter breadth:** the next tranche from the [coverage roadmap](./coverage.md#roadmap-prioritization)\n  (Continue, Goose, Warp, JetBrains AI, Cody, Roo Code).\n- **Compat automation:** act on the weekly compat-harness drift reports\n  ([`packages/adapters/compat`](https://github.com/dj-pearson/MCPFold/blob/main/packages/adapters/compat/README.md)).\n- **Launch collateral:** the scripted demo GIF render, blog/changelog.\n\n## Exploring\n\n- Deeper editor integrations, richer proxy tool-curation policies, org-wide policy enforcement.\n\n## MCP 2026-07-28 stateless-core readiness (S17.6)\n\nThe 2026-07-28 protocol revision (release candidate now; final expected ~July 28, 2026) is\nbreaking. mcpfold's proxy sits mid-conversation and must speak both worlds during the transition.\nThis checklist maps each RC changelog item to how mcpfold handles it. Revisit when the final ships.\n\n| RC changelog item                                     | mcpfold status | How                                                            |\n| ----------------------------------------------------- | -------------- | -------------------------------------------------------------- |\n| Removes `initialize`                                  | supported      | Handshake `mode: 'stateless'` probes via `server/discover`     |\n| Removes `Mcp-Session-Id`; version/identity in `_meta` | passthrough    | Proxy never rewrites `_meta`; only the tool array of a listing |\n| Mandatory `server/discover`                           | supported      | Proxy curates its response exactly like `tools/list`           |\n| MRTR (`resultType: 'input_required'` + retry)         | passthrough    | Forwarded verbatim; not a listing, so never rewritten          |\n| Tasks moved to an official extension                  | passthrough    | Forwarded verbatim                                             |\n| Deprecates HTTP+SSE (12-month lifecycle)              | tracked        | Both transports still work; watch the sunset window            |\n| Deprecates Roots / Sampling / Logging                 | **non-goal**   | We build no features on these; forwarded verbatim if present   |\n\nEnforcement is mode-agnostic: a denied `tools/call` is rejected whether or not a session exists,\nbecause the call keeps its `params.name` shape. Dual-mode tests\n([`packages/proxy/test/stateless.test.ts`](https://github.com/dj-pearson/MCPFold/blob/main/packages/proxy/test/stateless.test.ts))\nprove identical filtering/enforcement for a 2025-11-25 session and a stateless-core session of the\nsame server. The `_meta` version key is provisional until the final spec fixes it.\n\nHave a request? Open an issue — adapter requests use the `adapter-request` label. See\n[Governance](./governance.md) for how proposals become work.\n";
function rewriteDocLinks(html2) {
  return html2.replace(
    /href="\.\/([^"#]+)\.md(#[^"]*)?"/g,
    (_all, file, anchor = "") => `href="/docs/${file}.html${anchor}"`
  );
}
const ROADMAP_HTML = rewriteDocLinks(marked.parse(roadmapRaw, { async: false }));
function Roadmap() {
  return /* @__PURE__ */ jsx(Container, { style: { padding: "var(--space-16) var(--space-6)", maxWidth: 760 }, children: /* @__PURE__ */ jsx(
    "article",
    {
      className: "prose",
      "data-testid": "roadmap-body",
      dangerouslySetInnerHTML: { __html: ROADMAP_HTML }
    }
  ) });
}
const ONE_LINER = "One source of truth for your MCP servers — write it once, fold it out to every client.";
const COLORS = [
  { name: "Accent", hex: "#4c6ef5", note: "Primary brand blue (light theme)" },
  { name: "Accent (dark)", hex: "#748ffc", note: "Brand blue on dark backgrounds" },
  { name: "Foreground", hex: "#14161a", note: "Near-black text" },
  { name: "Background", hex: "#ffffff", note: "Light surface" },
  { name: "Background (dark)", hex: "#0b0d12", note: "Dark surface" }
];
const ASSETS = [
  { href: "/brand/mcpfold-logomark.svg", label: "Logomark (SVG)", note: "The folded-sheet mark" },
  { href: "/brand/mcpfold-wordmark.svg", label: "Wordmark (SVG)", note: "Mark + “mcpfold” lockup" },
  { href: "/logo-mark.png", label: "Logomark (PNG)", note: "Raster fallback" },
  { href: "/og.svg", label: "Social card (SVG)", note: "Open Graph / share image" }
];
const card = {
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  background: "var(--bg-elevated)",
  padding: "var(--space-4)"
};
function Brand() {
  return /* @__PURE__ */ jsxs(Container, { style: { padding: "var(--space-16) var(--space-6)", maxWidth: 820 }, children: [
    /* @__PURE__ */ jsx("h1", { children: "Brand & press kit" }),
    /* @__PURE__ */ jsx("p", { style: { fontSize: "1.1rem", lineHeight: 1.55 }, children: "Assets and guidelines for writing about or linking to mcpfold. Everything here is free to use within the notes below." }),
    /* @__PURE__ */ jsx("h2", { children: "The one-liner" }),
    /* @__PURE__ */ jsx(
      "blockquote",
      {
        "data-testid": "brand-oneliner",
        style: {
          borderLeft: "3px solid var(--accent)",
          paddingLeft: "var(--space-4)",
          margin: "var(--space-4) 0",
          fontSize: "1.15rem"
        },
        children: ONE_LINER
      }
    ),
    /* @__PURE__ */ jsx("h2", { children: "Logo & wordmark" }),
    /* @__PURE__ */ jsx(
      "div",
      {
        "data-testid": "brand-assets",
        style: {
          display: "grid",
          gap: "var(--space-4)",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          margin: "var(--space-4) 0"
        },
        children: ASSETS.map((a) => /* @__PURE__ */ jsxs("div", { style: card, children: [
          /* @__PURE__ */ jsx(
            "img",
            {
              src: a.href,
              alt: a.label,
              style: { maxWidth: "100%", height: 64, objectFit: "contain" }
            }
          ),
          /* @__PURE__ */ jsx("p", { style: { margin: "var(--space-2) 0 0", fontWeight: 600 }, children: a.label }),
          /* @__PURE__ */ jsx(
            "p",
            {
              style: {
                margin: "2px 0 var(--space-2)",
                color: "var(--fg-muted)",
                fontSize: "0.85rem"
              },
              children: a.note
            }
          ),
          /* @__PURE__ */ jsx("a", { href: a.href, download: true, "data-testid": "brand-download", children: "Download" })
        ] }, a.href))
      }
    ),
    /* @__PURE__ */ jsx("h2", { children: "Colors" }),
    /* @__PURE__ */ jsx(
      "div",
      {
        "data-testid": "brand-colors",
        style: {
          display: "grid",
          gap: "var(--space-3)",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          margin: "var(--space-4) 0"
        },
        children: COLORS.map((c) => /* @__PURE__ */ jsxs(
          "div",
          {
            style: { ...card, display: "flex", gap: "var(--space-3)", alignItems: "center" },
            children: [
              /* @__PURE__ */ jsx(
                "span",
                {
                  "aria-hidden": "true",
                  style: {
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: c.hex,
                    border: "1px solid var(--border)",
                    flex: "0 0 auto"
                  }
                }
              ),
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("strong", { children: c.name }),
                /* @__PURE__ */ jsx("div", { style: { fontFamily: "var(--font-mono, monospace)", fontSize: "0.85rem" }, children: c.hex }),
                /* @__PURE__ */ jsx("div", { style: { color: "var(--fg-muted)", fontSize: "0.8rem" }, children: c.note })
              ] })
            ]
          },
          c.name
        ))
      }
    ),
    /* @__PURE__ */ jsx("h2", { children: "Usage" }),
    /* @__PURE__ */ jsxs("ul", { style: { lineHeight: 1.7 }, children: [
      /* @__PURE__ */ jsx("li", { children: "Use the wordmark or logomark as provided; don’t stretch, recolor, or add effects." }),
      /* @__PURE__ */ jsx("li", { children: "Keep clear space around the mark and don’t place it on low-contrast backgrounds." }),
      /* @__PURE__ */ jsx("li", { children: "Write the name as “mcpfold” (all lowercase)." }),
      /* @__PURE__ */ jsxs("li", { children: [
        "Link to ",
        /* @__PURE__ */ jsx("a", { href: "https://mcpfold.com", children: "mcpfold.com" }),
        " where practical."
      ] })
    ] }),
    /* @__PURE__ */ jsx("p", { style: { color: "var(--fg-muted)", fontSize: "0.85rem", marginTop: "var(--space-8)" }, children: "mcpfold is an independent, open-source project. The Model Context Protocol is an open standard; mcpfold is not affiliated with or endorsed by the MCP project. Don’t use these assets in a way that implies such an affiliation, or to endorse another product." })
  ] });
}
const TOP_LINKS = [
  { href: "/", label: "Home", internal: true },
  { href: "/install", label: "Install", internal: true },
  { href: "/directory", label: "MCP server directory", internal: true },
  { href: "/docs", label: "Documentation" },
  { href: "/pricing", label: "Pricing", internal: true },
  { href: "/community", label: "Community & support", internal: true }
];
function NotFound() {
  return /* @__PURE__ */ jsxs(Container, { style: { padding: "var(--space-16) var(--space-6)", maxWidth: 640 }, children: [
    /* @__PURE__ */ jsx("p", { style: { color: "var(--fg-muted)", fontWeight: 700, letterSpacing: "0.08em" }, children: "404" }),
    /* @__PURE__ */ jsx("h1", { "data-testid": "notfound-heading", children: "This page folded away" }),
    /* @__PURE__ */ jsx("p", { style: { color: "var(--fg-muted)", fontSize: "1.05rem", lineHeight: 1.6 }, children: "The URL you followed doesn’t exist (or moved). Here’s the way back — or search the server directory and the docs for what you need." }),
    /* @__PURE__ */ jsx(
      "nav",
      {
        "aria-label": "Helpful links",
        "data-testid": "notfound-links",
        style: { margin: "var(--space-6) 0" },
        children: /* @__PURE__ */ jsx("ul", { style: { display: "grid", gap: "var(--space-2)", listStyle: "none", padding: 0 }, children: TOP_LINKS.map((l) => /* @__PURE__ */ jsx("li", { children: l.internal ? /* @__PURE__ */ jsx(Link, { to: l.href, children: l.label }) : /* @__PURE__ */ jsx("a", { href: l.href, children: l.label }) }, l.href)) })
      }
    ),
    /* @__PURE__ */ jsxs("p", { style: { color: "var(--fg-muted)", fontSize: "0.9rem" }, children: [
      "Looking for a specific MCP server? ",
      /* @__PURE__ */ jsx(Link, { to: "/directory", children: "Browse the directory" }),
      ". Need a setup step? The ",
      /* @__PURE__ */ jsx("a", { href: "/docs", children: "docs" }),
      " have search built in."
    ] })
  ] });
}
function App() {
  return /* @__PURE__ */ jsx(Routes, { children: /* @__PURE__ */ jsxs(Route, { element: /* @__PURE__ */ jsx(Layout, {}), children: [
    /* @__PURE__ */ jsx(Route, { path: "/", element: /* @__PURE__ */ jsx(Home, {}) }),
    /* @__PURE__ */ jsx(Route, { path: "/install", element: /* @__PURE__ */ jsx(InstallPage, {}) }),
    /* @__PURE__ */ jsx(Route, { path: "/directory", element: /* @__PURE__ */ jsx(DirectoryList, {}) }),
    /* @__PURE__ */ jsx(Route, { path: "/directory/category/:cat", element: /* @__PURE__ */ jsx(CategoryPage, {}) }),
    /* @__PURE__ */ jsx(Route, { path: "/directory/:id", element: /* @__PURE__ */ jsx(ServerPage, {}) }),
    /* @__PURE__ */ jsx(Route, { path: "/guides", element: /* @__PURE__ */ jsx(GuidesIndex, {}) }),
    /* @__PURE__ */ jsx(Route, { path: "/guides/:client", element: /* @__PURE__ */ jsx(GuidePage, {}) }),
    /* @__PURE__ */ jsx(Route, { path: "/glossary", element: /* @__PURE__ */ jsx(GlossaryIndex, {}) }),
    /* @__PURE__ */ jsx(Route, { path: "/glossary/:term", element: /* @__PURE__ */ jsx(TermPage, {}) }),
    /* @__PURE__ */ jsx(Route, { path: "/compare", element: /* @__PURE__ */ jsx(CompareIndex, {}) }),
    /* @__PURE__ */ jsx(Route, { path: "/compare/:id", element: /* @__PURE__ */ jsx(ComparePage, {}) }),
    /* @__PURE__ */ jsx(Route, { path: "/features", element: /* @__PURE__ */ jsx(FeaturesIndex, {}) }),
    /* @__PURE__ */ jsx(Route, { path: "/features/:id", element: /* @__PURE__ */ jsx(FeaturePage, {}) }),
    /* @__PURE__ */ jsx(Route, { path: "/use-cases", element: /* @__PURE__ */ jsx(UseCasesIndex, {}) }),
    /* @__PURE__ */ jsx(Route, { path: "/use-cases/:id", element: /* @__PURE__ */ jsx(UseCasePage, {}) }),
    /* @__PURE__ */ jsx(Route, { path: "/pricing", element: /* @__PURE__ */ jsx(PricingPage, {}) }),
    /* @__PURE__ */ jsx(Route, { path: "/security", element: /* @__PURE__ */ jsx(SecurityPage, {}) }),
    /* @__PURE__ */ jsx(Route, { path: "/about", element: /* @__PURE__ */ jsx(About, {}) }),
    /* @__PURE__ */ jsx(Route, { path: "/privacy", element: /* @__PURE__ */ jsx(LegalPage, { id: "privacy" }) }),
    /* @__PURE__ */ jsx(Route, { path: "/terms", element: /* @__PURE__ */ jsx(LegalPage, { id: "terms" }) }),
    /* @__PURE__ */ jsx(Route, { path: "/analytics", element: /* @__PURE__ */ jsx(LegalPage, { id: "analytics" }) }),
    /* @__PURE__ */ jsx(Route, { path: "/community", element: /* @__PURE__ */ jsx(Community, {}) }),
    /* @__PURE__ */ jsx(Route, { path: "/blog", element: /* @__PURE__ */ jsx(BlogIndex, {}) }),
    /* @__PURE__ */ jsx(Route, { path: "/blog/:slug", element: /* @__PURE__ */ jsx(BlogPost, {}) }),
    /* @__PURE__ */ jsx(Route, { path: "/changelog", element: /* @__PURE__ */ jsx(Changelog, {}) }),
    /* @__PURE__ */ jsx(Route, { path: "/roadmap", element: /* @__PURE__ */ jsx(Roadmap, {}) }),
    /* @__PURE__ */ jsx(Route, { path: "/brand", element: /* @__PURE__ */ jsx(Brand, {}) }),
    /* @__PURE__ */ jsx(Route, { path: "*", element: /* @__PURE__ */ jsx(NotFound, {}) })
  ] }) });
}
const KEYWORD_MAP = [
  { keyword: "mcp config manager", page: "/", volume: 200, intent: "commercial", geo: true },
  { keyword: "manage mcp servers", page: "/", volume: 400, intent: "commercial", geo: true },
  { keyword: "mcp config", page: "/", volume: 1600, intent: "informational", geo: true },
  { keyword: "mcp server directory", page: "/directory", volume: 900, intent: "commercial" },
  {
    keyword: "best mcp servers",
    page: "/directory",
    volume: 2400,
    intent: "commercial",
    geo: true
  },
  {
    keyword: "database mcp server",
    page: "/directory/category/database",
    volume: 700,
    intent: "commercial"
  },
  { keyword: "install mcpfold", page: "/install", volume: 50, intent: "transactional" },
  { keyword: "mcpfold", page: "/", volume: 100, intent: "navigational" },
  { keyword: "mcp secrets", page: "/security", volume: 300, intent: "informational" },
  { keyword: "mcp config manager pricing", page: "/pricing", volume: 40, intent: "commercial" },
  // Token / context-window reduction cluster (docs/token-query-geo-plan.md). The pillar page is the
  // one canonical target for the head terms; the vs-page owns the "native tool-search" comparison.
  {
    keyword: "reduce mcp token usage",
    page: "/compare/reduce-mcp-token-usage",
    volume: 900,
    intent: "informational",
    geo: true
  },
  {
    keyword: "mcp too many tools context window",
    page: "/compare/reduce-mcp-token-usage",
    volume: 500,
    intent: "informational",
    geo: true
  },
  {
    keyword: "mcp token optimization",
    page: "/compare/reduce-mcp-token-usage",
    volume: 400,
    intent: "informational",
    geo: true
  },
  {
    keyword: "reduce mcp tokens cursor",
    page: "/compare/reduce-mcp-token-usage",
    volume: 200,
    intent: "informational",
    geo: true
  },
  {
    keyword: "mcp tool search alternative",
    page: "/compare/mcpfold-vs-tool-search",
    volume: 150,
    intent: "commercial",
    geo: true
  }
];
function mappedPaths() {
  return [...new Set(KEYWORD_MAP.map((k) => k.page))];
}
function render(url) {
  const appHtml = renderToString(
    /* @__PURE__ */ jsx(StrictMode, { children: /* @__PURE__ */ jsx(StaticRouter, { location: url, children: /* @__PURE__ */ jsx(App, {}) }) })
  );
  return { appHtml, meta: resolveMeta(url), jsonLd: jsonLdScriptTags(url) };
}
export {
  allRoutes,
  mappedPaths,
  render
};
