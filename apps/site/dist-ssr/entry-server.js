import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import { useEffect, useState, useMemo, StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server.mjs";
import { useLocation, Outlet, Link, useParams, Routes, Route } from "react-router-dom";
import { z } from "zod";
import { marked } from "marked";
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
const CLIENT_IDS = [
  "claude-desktop",
  "claude-code",
  "cursor",
  "vscode",
  "windsurf",
  "zed",
  "cline",
  "gemini-cli"
];
const TRANSPORTS = ["stdio", "http", "sse"];
const SCOPES = ["user", "project", "workspace"];
const SECRET_REF_RE = /^\$\{[a-z0-9_-]+:.+\}$/;
const SecretRef = z.string().regex(SECRET_REF_RE, {
  message: "secret reference must look like ${scheme:path}, e.g. ${env:GITHUB_PAT}"
});
const StringOrSecretRef = z.union([z.string(), SecretRef]);
const AuthSchema = z.object({
  type: z.enum(["bearer", "header", "none"]).default("none"),
  token: SecretRef.optional(),
  headers: z.record(StringOrSecretRef).optional()
}).strict();
const ToolsSchema = z.object({
  mode: z.enum(["allow", "deny"]),
  list: z.array(z.string())
}).strict();
const ServerSchema = z.object({
  transport: z.enum(TRANSPORTS),
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
  include: z.array(z.string())
}).strict().refine((p) => p.scope === "user" || Boolean(p.path), {
  message: '`path` is required when scope is "project" or "workspace"'
});
z.object({
  /** Optional JSON Schema pointer for editor autocomplete; ignored semantically. */
  $schema: z.string().optional(),
  version: z.literal(1),
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
const DIRECTORY = [
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
    id: "github",
    name: "GitHub",
    description: "Repositories, issues, and pull requests via the GitHub API.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    tokenRef: "${env:GITHUB_PAT}",
    suggestedTags: ["git", "work"]
  },
  {
    id: "fetch",
    name: "Fetch",
    description: "Fetch and convert web pages to markdown for the model.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-fetch"],
    suggestedTags: ["web"]
  },
  {
    id: "postgres",
    name: "Postgres",
    description: "Read-only SQL queries against a Postgres database.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-postgres"],
    tokenRef: "${env:DATABASE_URL}",
    suggestedTags: ["db"]
  },
  {
    id: "playwright",
    name: "Playwright",
    description: "Drive a browser for scraping and end-to-end testing.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@playwright/mcp@latest"],
    suggestedTags: ["browser", "code"]
  }
];
function searchDirectory(query) {
  const q = query.trim().toLowerCase();
  if (!q)
    return DIRECTORY;
  return DIRECTORY.filter((e) => e.name.toLowerCase().includes(q) || e.description.toLowerCase().includes(q) || e.suggestedTags.some((t) => t.toLowerCase().includes(q)));
}
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
const SITE_URL = "https://mcpfold.com";
const HOME_DESC = "Connect every MCP server without paying the context-window tax. One canonical config, folded out to every client, with secret references instead of hardcoded values.";
function meta(title, description, path) {
  return { title, description, canonical: `${SITE_URL}${path}` };
}
function resolveMeta(path) {
  const p = path !== "/" && path.endsWith("/") ? path.slice(0, -1) : path;
  if (p === "/") {
    return meta("mcpfold — one config for every MCP client", HOME_DESC, "/");
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
      "MCP server directory — browse and add servers",
      "Browse a curated directory of MCP servers and add any of them to your config in one command. A neutral, community-maintained list.",
      "/directory"
    );
  }
  if (p.startsWith("/directory/")) {
    const id = p.slice("/directory/".length);
    const entry = DIRECTORY.find((e) => e.id === id);
    if (entry) {
      return meta(
        `${entry.name} — MCP server · mcpfold`,
        entry.description,
        `/directory/${entry.id}`
      );
    }
    return meta("Server not found — mcpfold directory", "No such server.", p);
  }
  if (p === "/pricing") {
    return meta(
      "Pricing — mcpfold",
      "The CLI and everything local is free forever and MIT-licensed. The hosted team cloud — shared configs, audit trail, sync — is the paid surface. Self-host it yourself for free.",
      "/pricing"
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
  return meta("mcpfold", HOME_DESC, p);
}
function allRoutes() {
  return [
    "/",
    "/install",
    "/directory",
    "/pricing",
    "/blog",
    "/changelog",
    ...DIRECTORY.map((e) => `/directory/${e.id}`),
    ...POSTS.map((p) => `/blog/${p.slug}`)
  ];
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
    numberOfItems: DIRECTORY.length,
    itemListElement: DIRECTORY.map((entry, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: entry.name,
      url: `${SITE_URL}/directory/${entry.id}`
    }))
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
  if (p === "/") return [softwareApplication()];
  if (p === "/directory") return [directoryItemList()];
  if (p.startsWith("/directory/")) {
    const entry = DIRECTORY.find((e) => e.id === p.slice("/directory/".length));
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
  return [];
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
function Layout() {
  const [theme, setTheme] = useState("light");
  useEffect(() => setTheme(currentTheme()), []);
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(RouteHead, {}),
    /* @__PURE__ */ jsx(
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
        children: /* @__PURE__ */ jsxs(
          Container,
          {
            style: { display: "flex", alignItems: "center", gap: "var(--space-6)", height: 60 },
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
              /* @__PURE__ */ jsxs("nav", { style: { display: "flex", gap: "var(--space-6)", marginLeft: "auto" }, children: [
                /* @__PURE__ */ jsx("a", { href: "/install", style: { color: "var(--fg-muted)" }, children: "Install" }),
                /* @__PURE__ */ jsx("a", { href: "/directory", style: { color: "var(--fg-muted)" }, children: "Directory" }),
                /* @__PURE__ */ jsx("a", { href: "/pricing", style: { color: "var(--fg-muted)" }, children: "Pricing" }),
                /* @__PURE__ */ jsx("a", { href: "/blog", style: { color: "var(--fg-muted)" }, children: "Blog" }),
                /* @__PURE__ */ jsx("a", { href: "/docs", style: { color: "var(--fg-muted)" }, children: "Docs" }),
                /* @__PURE__ */ jsx(
                  "a",
                  {
                    href: "https://github.com/dj-pearson/MCPFold",
                    style: { color: "var(--fg-muted)" },
                    rel: "noreferrer",
                    children: "GitHub"
                  }
                ),
                /* @__PURE__ */ jsx(
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
                )
              ] })
            ]
          }
        )
      }
    ),
    /* @__PURE__ */ jsx("main", { children: /* @__PURE__ */ jsx(Outlet, {}) }),
    /* @__PURE__ */ jsx("footer", { style: { borderTop: "1px solid var(--border)", marginTop: "var(--space-16)" }, children: /* @__PURE__ */ jsxs(
      Container,
      {
        style: {
          display: "flex",
          flexWrap: "wrap",
          gap: "var(--space-4)",
          justifyContent: "space-between",
          padding: "var(--space-8) var(--space-6)",
          color: "var(--fg-muted)",
          fontSize: "0.9rem"
        },
        children: [
          /* @__PURE__ */ jsx("span", { children: "© mcpfold — MIT licensed, open source." }),
          /* @__PURE__ */ jsxs("span", { style: { display: "flex", gap: "var(--space-6)" }, children: [
            /* @__PURE__ */ jsx("a", { href: "/docs", children: "Docs" }),
            /* @__PURE__ */ jsx("a", { href: "/docs/security.html", children: "Security" }),
            /* @__PURE__ */ jsx("a", { href: "https://github.com/sponsors/dj-pearson", rel: "noreferrer", children: "Sponsor" }),
            /* @__PURE__ */ jsx("a", { href: "https://github.com/dj-pearson/MCPFold", rel: "noreferrer", children: "GitHub" })
          ] })
        ]
      }
    ) })
  ] });
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
              "Connect every MCP server without paying the",
              /* @__PURE__ */ jsx("span", { style: { color: "var(--accent)" }, children: " context-window tax" }),
              "."
            ]
          }
        ),
        /* @__PURE__ */ jsxs(
          "p",
          {
            "data-testid": "benchmark-headline",
            style: { fontSize: "1.25rem", maxWidth: 680, margin: "0 auto var(--space-8)" },
            children: [
              "Every server you connect dumps its full tool schema into context — used or not. Curating the toolset cuts tool-schema tokens by",
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
              "."
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
  const cell = {
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
              /* @__PURE__ */ jsxs("div", { style: cell, children: [
                /* @__PURE__ */ jsx("div", { style: { color: "var(--fg-muted)", fontSize: "0.85rem" }, children: "Tools" }),
                /* @__PURE__ */ jsxs("div", { style: { fontSize: "1.4rem", fontWeight: 700 }, "data-testid": "tools-out", children: [
                  result.toolsBefore,
                  " → ",
                  result.toolsAfter
                ] })
              ] }),
              /* @__PURE__ */ jsxs("div", { style: cell, children: [
                /* @__PURE__ */ jsx("div", { style: { color: "var(--fg-muted)", fontSize: "0.85rem" }, children: "Tool-schema tokens" }),
                /* @__PURE__ */ jsxs("div", { style: { fontSize: "1.4rem", fontWeight: 700 }, "data-testid": "tokens-out", children: [
                  result.tokensBefore.toLocaleString(),
                  " → ",
                  result.tokensAfter.toLocaleString()
                ] })
              ] }),
              /* @__PURE__ */ jsxs("div", { style: { ...cell, background: "var(--accent)", color: "var(--accent-fg)" }, children: [
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
function Home() {
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(Hero, {}),
    /* @__PURE__ */ jsx(Container, { style: { padding: "var(--space-8) var(--space-6)" }, children: /* @__PURE__ */ jsx(Calculator, {}) }),
    /* @__PURE__ */ jsx(Container, { style: { paddingBottom: "var(--space-16)" }, children: /* @__PURE__ */ jsx(
      "div",
      {
        style: {
          display: "grid",
          gap: "var(--space-6)",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))"
        },
        children: FEATURES.map((f) => /* @__PURE__ */ jsxs(
          "div",
          {
            style: {
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              background: "var(--bg-elevated)",
              padding: "var(--space-6)"
            },
            children: [
              /* @__PURE__ */ jsx("h3", { style: { marginTop: 0 }, children: f.title }),
              /* @__PURE__ */ jsx("p", { style: { color: "var(--fg-muted)", margin: 0 }, children: f.body })
            ]
          },
          f.title
        ))
      }
    ) })
  ] });
}
const FEATURES = [
  {
    title: "One source of truth",
    body: "Write your servers once. Fold out to Claude, Cursor, VS Code, Windsurf, Zed — each in its own format."
  },
  {
    title: "Secrets as references",
    body: "Configs carry ${env:…} / ${op:…} references, never values. Nothing sensitive is written to disk."
  },
  {
    title: "Drift-gated in CI",
    body: "Commit the config to your repo and fail CI when a checkout drifts — standardize your team, no backend."
  }
];
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
  return /* @__PURE__ */ jsx(Fragment, { children: /* @__PURE__ */ jsxs(Container, { style: { padding: "var(--space-16) var(--space-6)" }, children: [
    /* @__PURE__ */ jsx("h1", { style: { fontSize: "clamp(1.8rem, 4vw, 2.6rem)" }, children: "Install mcpfold" }),
    /* @__PURE__ */ jsxs("p", { style: { color: "var(--fg-muted)", fontSize: "1.1rem" }, children: [
      "Pick your channel — every one resolves to the same release.",
      " ",
      /* @__PURE__ */ jsxs("span", { "data-testid": "version-badge", children: [
        "Latest: ",
        /* @__PURE__ */ jsxs("strong", { children: [
          "v",
          "1.0.0"
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
  ] }) });
}
function DirectoryList() {
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchDirectory(query), [query]);
  return /* @__PURE__ */ jsx(Fragment, { children: /* @__PURE__ */ jsxs(Container, { style: { padding: "var(--space-16) var(--space-6)" }, children: [
    /* @__PURE__ */ jsx("h1", { children: "MCP server directory" }),
    /* @__PURE__ */ jsx("p", { style: { color: "var(--fg-muted)" }, children: "A neutral, community-maintained list — mcpfold is not affiliated with or endorsed by these projects. Add any to your config in one command." }),
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
  ] }) });
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
  const entry = DIRECTORY.find((e) => e.id === id);
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
  return /* @__PURE__ */ jsx(Fragment, { children: /* @__PURE__ */ jsxs(Container, { style: { padding: "var(--space-16) var(--space-6)", maxWidth: 720 }, children: [
    /* @__PURE__ */ jsx("p", { style: { marginBottom: "var(--space-4)" }, children: /* @__PURE__ */ jsx(Link, { to: "/directory", children: "← Directory" }) }),
    /* @__PURE__ */ jsx("h1", { style: { marginBottom: "var(--space-2)" }, children: entry.name }),
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
        children: entry.suggestedTags.map((t) => /* @__PURE__ */ jsx(
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
        ))
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
  return /* @__PURE__ */ jsx(Fragment, { children: /* @__PURE__ */ jsxs(Container, { style: { padding: "var(--space-16) var(--space-6)" }, children: [
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
    ),
    /* @__PURE__ */ jsxs("section", { style: { maxWidth: 720, margin: "var(--space-16) auto 0" }, children: [
      /* @__PURE__ */ jsx("h2", { children: "FAQ" }),
      FAQ.map((item) => /* @__PURE__ */ jsxs(
        "details",
        {
          style: { borderBottom: "1px solid var(--border)", padding: "var(--space-4) 0" },
          children: [
            /* @__PURE__ */ jsx("summary", { style: { cursor: "pointer", fontWeight: 600 }, children: item.q }),
            /* @__PURE__ */ jsx("p", { style: { color: "var(--fg-muted)", marginBottom: 0 }, children: item.a })
          ]
        },
        item.q
      ))
    ] })
  ] }) });
}
const FAQ = [
  {
    q: "Can I self-host the cloud?",
    a: "Yes — the whole cloud (Supabase + edge service) is MIT-licensed and self-hostable at no cost. See the self-hosting docs. The paid tiers are the convenience of us running it, plus team features."
  },
  {
    q: "What is the license?",
    a: "The CLI, adapters, core, and the self-hostable cloud are MIT. Only the hosted mcpfold.com service and its Team/Enterprise features are commercial. See docs/governance.md."
  },
  {
    q: "What data does the cloud store?",
    a: "Only your canonical config with secret references (${provider:path}) — never secret values. Everything sensitive stays on your machine and is resolved at launch time."
  },
  {
    q: "Is the free tier really free forever?",
    a: "Yes. The entire local CLI — all adapters, sync, diff, doctor, watch, the config-as-code drift gate — is free forever with no account."
  }
];
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
function App() {
  return /* @__PURE__ */ jsx(Routes, { children: /* @__PURE__ */ jsxs(Route, { element: /* @__PURE__ */ jsx(Layout, {}), children: [
    /* @__PURE__ */ jsx(Route, { path: "/", element: /* @__PURE__ */ jsx(Home, {}) }),
    /* @__PURE__ */ jsx(Route, { path: "/install", element: /* @__PURE__ */ jsx(InstallPage, {}) }),
    /* @__PURE__ */ jsx(Route, { path: "/directory", element: /* @__PURE__ */ jsx(DirectoryList, {}) }),
    /* @__PURE__ */ jsx(Route, { path: "/directory/:id", element: /* @__PURE__ */ jsx(ServerPage, {}) }),
    /* @__PURE__ */ jsx(Route, { path: "/pricing", element: /* @__PURE__ */ jsx(PricingPage, {}) }),
    /* @__PURE__ */ jsx(Route, { path: "/blog", element: /* @__PURE__ */ jsx(BlogIndex, {}) }),
    /* @__PURE__ */ jsx(Route, { path: "/blog/:slug", element: /* @__PURE__ */ jsx(BlogPost, {}) }),
    /* @__PURE__ */ jsx(Route, { path: "/changelog", element: /* @__PURE__ */ jsx(Changelog, {}) })
  ] }) });
}
function render(url) {
  const appHtml = renderToString(
    /* @__PURE__ */ jsx(StrictMode, { children: /* @__PURE__ */ jsx(StaticRouter, { location: url, children: /* @__PURE__ */ jsx(App, {}) }) })
  );
  return { appHtml, meta: resolveMeta(url), jsonLd: jsonLdScriptTags(url) };
}
export {
  allRoutes,
  render
};
