# Exposure plan — growth beyond SEO/GEO

The [token-query GEO plan](./token-query-geo-plan.md) covers being *cited* for one query cluster. This
doc is the wider growth picture: the wedge asset, the channels, and specs for the initiatives that are
separate projects (not one-file edits). It's honest about effort and payoff so the next few weeks go to
the highest-leverage work.

## What already shipped (this workstream)

- **Free MCP token calculator** — `/mcp-token-calculator` (client-side, paste-your-config, presets,
  context-window share, WebApplication + FAQPage JSON-LD). The utility-first wedge asset.
- **Pillar + comparison pages** — `/compare/reduce-mcp-token-usage`, `/compare/mcpfold-vs-tool-search`,
  `/compare/open-source-mcp-gateway`, all keyword-mapped.
- **GEO surface** — token Q&A on the homepage FAQ and in `llms.txt` / `llms-full.txt`; token-cluster
  GEO check + baseline in [geo-playbook.md](./geo-playbook.md).
- **Distribution copy** — [launch/growth-channels.md](./launch/growth-channels.md) (newsletters, X,
  LinkedIn, Reddit, syndication) and the token campaign in [launch/listings.md](./launch/listings.md).

## Channel priorities (do in this order)

1. **Ship + share the calculator** — it's live; now it needs distribution (X anchor post, newsletter
   submits). A tool with no traffic is a tree falling in an empty forest.
2. **Newsletter submits** (Console.dev, TLDR, Cooperpress) — cheapest reach per hour, one-time.
3. **X build-in-public** — start now, compounding; the audience is here.
4. **The "measured the MCP tax" data piece** — one strong post that travels (HN/Reddit/X) and seeds
   the GEO corpus. Neutral-map framing.
5. **Awesome-list PRs + directory listings** (Glama, PulseMCP, mcp.so) — durable backlinks.
6. **LinkedIn config-as-code posts** — reaches the team buyer the other channels miss.

## Strategic watch-items

- **Broaden the top-of-funnel message.** "Save tokens" is being commoditized by native tool-search.
  The durable, less-contested headline is **"one config for every AI coding tool"** (+ secrets +
  CI/determinism). Token savings is the *proof*, not the whole pitch. See the homepage message test
  below before committing.
- **Acquisition ≠ activation.** Measure time-to-first-`sync` and where people drop; exposure is wasted
  on a leaky funnel. See instrumentation spec below.
- **Reach the buyer.** Revenue is teams/cloud; make sure some content targets that audience.
- **Measure what converts.** Tag referrers → installs, or you're guessing which channel to double down
  on.
- **Credibility as a solo maker** in a lane with Anthropic/IBM/Docker: lean on the trust signals you
  already have (real tests, CI-guarded claims, MIT, governance) — they beat thin competitors.

---

# Specs for the bigger initiatives

## 1. VS Code extension (highest-leverage new surface)

**Why:** the VS Code Marketplace is a huge, intent-rich discovery channel with its own search — free
traffic mcpfold has no presence in today. Even a thin extension is a listing that ranks for "MCP".

**MVP scope:**
- Commands: `mcpfold: Init`, `Import`, `Sync`, `Diff`, `Doctor` — thin wrappers shelling out to the
  CLI (detect global install or `npx`), streaming output to a VS Code output channel.
- A status-bar item showing sync/drift state (green in sync / amber drifted), driven by `sync --check`.
- A "tool budget" codelens/notification surfacing the estimated token cost of the active config (reuse
  `packages/proxy/bench` logic) — ties the extension to the calculator narrative.
- Marketplace listing: name "mcpfold — MCP config manager", the token-tax hook, screenshots, links.

**Effort:** medium (new `apps/vscode-extension` package, `vsce` publish pipeline). **Payoff:** high and
durable. **Risk:** keep it a thin CLI front-end so it can't drift from CLI behavior.

## 2. Activation instrumentation & channel attribution

**Why:** you can't improve or double-down on what you don't measure. Respect the local-first/privacy
posture (telemetry is off by default — see [telemetry.md](./telemetry.md)); measure the *web* funnel,
which needs no CLI telemetry.

**Web funnel (no CLI changes):**
- Privacy-respecting analytics already on the site — define the funnel: landing → `/install` →
  install-command copy event → outbound to npm/GitHub. Add a copy-to-clipboard event on install
  commands.
- **Referrer → install attribution:** UTM the links in every growth channel (`?ref=console`,
  `?ref=x-calculator`, …) and segment the funnel by `ref`. Now you know which channel converts.
- Calculator engagement: track "config pasted" and "install clicked from calculator" as the wedge's
  conversion signal.

**CLI activation (opt-in only, later):** if/when telemetry is opted into, the one metric worth having
is **time-to-first-successful-`sync`** and the drop-off step (init → import → sync). Never on by
default; document it in `telemetry.md`.

## 3. MCP server token-cost leaderboard (citable data asset)

**Why:** a maintained "here's what the top MCP servers actually cost in tokens" resource is inherently
linkable and quotable — the backlink + GEO flywheel. **Blocked on real data:** the directory
(`packages/core/src/directory.ts`) has server metadata but **no tool counts or schemas**, so the
numbers must be *collected*, not estimated, or the asset loses its credibility.

**Data-collection step (required first):**
- A script that, for each directory server, launches it via the proxy, captures `tools/list`, and
  records tool count + serialized-schema token cost (reuse `packages/proxy` + the bench tokenizer).
- Store results as committed JSON (e.g. `packages/core/src/directory-toolcost.json`) with a captured-on
  date; treat as a periodic refresh (servers change).
- Then render `/mcp-server-token-costs` (a sortable table) + wire it into the calculator presets so
  those become *real* numbers, not the current honest estimates.

**Effort:** medium (needs sandboxed server launches, some servers need creds/skip). **Payoff:** high —
it's the asset others cite. **Until then:** the calculator is correctly framed as an editable estimator.

## 4. Homepage message test (decide before rewriting)

**Question:** should the H1 lead with "one config for every AI coding tool" (broad, ownable) instead of
the token-tax line (narrower, commoditizing)? Current copy already leads with "one MCP config for every
client" and uses the tax as subhead — which is likely right. **Action:** don't rewrite on a hunch;
run the GEO/rank check for both message clusters (config-manager vs token) for a few weeks, and let the
data pick the emphasis. Keep the token-tax as the proof point regardless.

## 5. Contributor growth loop

**Why:** your "new adapter = one PR" on-ramp turns users into contributors, and contributors into
advocates + stars. Make it visible:
- Curate `good first issue` labels for the highest-demand missing adapters and secret providers.
- A short "add your client in one PR" section on `/community` linking a template adapter + the test
  fixture pattern.
- Acknowledge contributors visibly (README/site) — the cheapest retention there is.

---

## Definition of "working"

Review monthly against the [seo-measurement](./seo-measurement.md) cadence and the GEO checks:
- Calculator sessions + install-clicks trending up.
- At least one channel with a measurable referrer→install rate to double down on.
- mcpfold "named as an option" on the token-cluster GEO prompts (prompt 5, Cursor, first).
- Star velocity after each anchor post / newsletter placement.
