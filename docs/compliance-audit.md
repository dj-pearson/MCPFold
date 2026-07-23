# Compliance audit — legal pages, WCAG/ADA, GDPR/US privacy

**Date:** 2026-07-23 · **Scope:** the public marketing site (`apps/site`), the hosted cloud web app
(`apps/web`), and the edge service (`services/edge`). **Standard targets:** WCAG 2.2 AA / ADA, and
GDPR + UK GDPR + US state privacy laws (CCPA/CPRA and equivalents).

This document records the audit findings, what was remediated in the accompanying change, and the
items that still need an owner decision or backend work before the project can claim *full*
compliance. Items are tagged **✅ Fixed here**, **⚠️ Owner decision**, or **⛔ Follow-up required**.

---

## 0. Headline finding (Critical)

The site's published Privacy Policy and Analytics disclosure promised **cookieless, no-PII,
no-third-party-tracker analytics with "no cookie wall — by design."** In reality, `apps/site/index.html`
hardcoded **Google Analytics (gtag.js, `G-2LCNNCXPG7`)**, loaded unconditionally on every production
page. GA sets `_ga`/`_gid` cookies, collects IP/device data, and transfers it to a third party in the
US.

This was a direct contradiction between the shipped code and the posted legal documents:

- **GDPR:** GA requires prior informed consent (a compliant CMP/banner); none existed → unlawful
  processing for EU/EEA/UK visitors.
- **US:** a published privacy policy that materially misstates data practices is a deceptive-practices
  exposure (FTC Act §5 / state UDAP statutes).

**✅ Fixed here.** Google Analytics was removed from `apps/site/index.html`. The site now uses only the
first-party, cookieless, env-gated Plausible/Umami-style analytics that `src/analytics.ts` already
implemented — which is what every legal page describes. A regression test (below) prevents any
third-party tracker from silently returning.

---

## 1. Required documents & pages — inventory

| Document | Status | Location |
| --- | --- | --- |
| Privacy Policy | ✅ Present (expanded) | `/privacy` → `src/legal/legal-content.ts` |
| Terms of Use | ✅ Present | `/terms` |
| Analytics & Cookie disclosure | ✅ Present (corrected) | `/analytics` |
| **Accessibility Statement** | ✅ **Added here** | `/accessibility` (new) |
| Security & trust | ✅ Present | `/security` |
| License (MIT) | ✅ Present | `LICENSE`, footer |
| Security policy / disclosure | ✅ Present | `SECURITY.md` |

All are footer-linked, prerendered (indexable), in the sitemap, and cross-linked. The Accessibility
Statement is new (see §2).

---

## 2. Accessibility (WCAG 2.2 AA / ADA)

### Strengths already in place (verified)

- **Skip-to-content link** as the first focusable element (`src/Layout.tsx`), visually-hidden-until-focus.
- **`<html lang="en">`** on the prerendered shell.
- **Landmarks** (`header`/`nav`/`main`/`footer`), uniquely labeled `nav`s, and a single ordered `h1`
  per page.
- **Image alt text** everywhere; decorative images use `aria-hidden`.
- **Form labeling**: every input has an associated `<label>` or `aria-label`; `aria-invalid`,
  `role="status"`, and `aria-live` are used correctly (subscribe form, calculators, search).
- **`prefers-reduced-motion`** honored in both the GSAP hero (`TheFold.tsx`) and CSS reveals
  (`fold.css`).
- **Automated gate**: a Lighthouse accessibility budget (`lighthouserc.json`, min score 0.95) plus
  keyboard/ARIA e2e assertions.

### Gaps and remediation

| # | Finding | Severity | Status |
| --- | --- | --- | --- |
| A1 | No accessibility statement page | Medium | ✅ Fixed — `/accessibility` added |
| A2 | No brand `:focus-visible` ring; keyboard focus relied on UA defaults only | Medium | ✅ Fixed — `tokens.css` adds a 2px accent focus ring on all interactive controls (WCAG 2.4.7 / 2.4.11) |
| A3 | Dark-mode primary CTA: white text on `--accent #748ffc` ≈ **3.0:1** — fails AA (4.5:1) | High | ✅ Fixed — dark-mode `--accent-fg` flips to dark ink → **6.55:1** |
| A4 | Light-mode accent link/button text ≈ **4.3:1** — marginally under AA | Medium | ✅ Fixed — `--accent` → `#3b5bdb` → **5.67:1** |
| A5 | `--danger` token undefined; error text falls back to `#e5484d` ≈ 3.9:1 | Low | ✅ Fixed — per-theme `--danger` (`#c92a2a` / `#ff8787`) clears AA |
| A6 | Mobile menu closes on Escape but has no focus trap / focus-return | Low | ✅ Fixed — focus moves into the menu on open and returns to the toggle on close |
| A7 | No axe/jest-axe rule engine (Lighthouse only) | Low | ✅ Fixed — `@axe-core/playwright` scan added to the e2e suite |

All contrast pairs were verified against the WCAG 1.4.3 formula in both light and dark themes; the
lowest ratio after the change is 5.29:1 (accent link on the elevated surface).

---

## 3. Privacy (GDPR / UK GDPR / US state law)

### Analytics & cookies

- First-party analytics (`src/analytics.ts`) sets **no cookies**, collects **no PII**, is **off unless
  built with `VITE_ANALYTICS_*`**, and uses a single first-party `sessionStorage` key for campaign
  attribution (no identifier).
- **✅ Fixed here:** the loader now **honors Do-Not-Track and Global Privacy Control (GPC)** — it never
  loads analytics when either signal is set (`privacySignalOptOut()`), making the opt-out the policy
  promised actually enforced in code. The analytics disclosure was updated to (a) drop the now-false
  "no local storage" phrasing and accurately disclose the first-party attribution key, and (b) describe
  the DNT/GPC enforcement.

### Legal-content completeness

The Privacy Policy was expanded (v1.0 → **v1.1**, effective 2026-07-23) to add the disclosures GDPR/CCPA
require, which were previously missing:

| Element | Before | Status |
| --- | --- | --- |
| Lawful basis (GDPR Art. 6) | Missing | ✅ Added — contract / legitimate interest / consent |
| Access, rectification, **erasure**, **portability**, objection/restriction, withdraw consent | Partial | ✅ Added — full rights section + response timeframes + complaint-to-DPA right |
| CCPA/CPRA "Do Not Sell or Share" + CA-resident rights | Weak | ✅ Added — explicit no-sale/no-share + GPC honored |
| Data retention | Missing | ✅ Added — retention tied to account lifecycle |
| International transfers | Missing | ✅ Added — SCCs via providers |
| Named subprocessors | Missing | ✅ Added — Supabase, Stripe, Cloudflare |
| Children's data / age | Missing | ✅ Added — not directed to under-16 |

### Data-subject request (DSAR) fulfillment — backend

- **✅ Fixed here.** Added two authenticated edge endpoints and self-service UI:
  - `GET /account-export` — a JSON copy of the caller's data (profile, machines, teams, personal
    config versions), RLS-scoped via `asUser`. Surfaced as a "Download my data" button on the app
    dashboard.
  - `POST /account-delete` — deletes the caller's `auth.users` row on the privileged connection; the
    schema's `on delete cascade` erases the public profile, machines, configs, owned teams, and
    memberships. Surfaced as a confirming "Delete my account" button.
  - `functions/account/index.ts` + `test/account.test.ts` (DB-free unit tests: auth-required, correct
    scoping, idempotent delete). Wired in `services/edge/src/server.ts`; client methods in
    `apps/web/src/api/cloud.ts`; UI in `apps/web/src/account/AccountPrivacy.tsx`.
- **✅ Fixed here.** Newsletter unsubscribe: `POST /unsubscribe` (public) sets a subscriber's status
  to `unsubscribed` by row-id token or email, honoring the form's "unsubscribe anytime" promise
  (`functions/subscribe/index.ts` `createUnsubscribeHandler` + tests). The one remaining step is to
  include the unsubscribe link in outbound emails once the double-opt-in email flow is wired.
- **✅ Fixed here (needs one ops step).** The policy now names a dedicated privacy contact,
  `privacy@mcpfold.com`, for all data-subject requests (security reports still go to
  `security@mcpfold.com`). **Action for the owner:** create the `privacy@mcpfold.com` alias and
  forward it to a monitored inbox — the address is now published, so it must resolve.

### EU representative (GDPR Art. 27) — assessment

A controller with no establishment in the EU/EEA must designate an EU representative if it offers
goods/services to, or monitors the behavior of, people in the EU (Art. 27(1)). There is an exemption
(Art. 27(2)) for processing that is **occasional**, does **not** include large-scale special-category
or criminal data, and is **unlikely to result in a risk** to individuals.

- **Where mcpfold sits today:** the site's analytics is cookieless and non-identifying; the hosted
  cloud stores only an email + refs-only config (never secret values, never special-category data).
  This is low-risk and, at current scale, plausibly "occasional" — so the Art. 27(2) exemption
  **likely applies** and no representative is required yet.
- **Reassess and appoint a representative if** the hosted cloud starts serving EU users at
  non-trivial, ongoing scale, or you begin systematic monitoring. This is a **⚠️ owner decision** to
  confirm with counsel; it is a documented judgement, not a code change.

---

## 4. Remaining items (owner action, not code)

The audit findings above are now remediated in code. What's left needs a person, not a commit:

1. **Create the `privacy@mcpfold.com` alias** and forward it to a monitored inbox. The address is
   published in the policy, so it must resolve. (One-time ops step.)
2. **Confirm the EU Art. 27 representative assessment** (§3) with counsel. Current read: the
   exemption likely applies; revisit if EU hosted-cloud usage grows.
3. **Wire the unsubscribe link into outbound emails** once the double-opt-in email flow is built —
   the `/unsubscribe` endpoint and token are ready to receive it.
4. **Legal review of the expanded policy copy.** The disclosures are accurate to the architecture,
   but a lawyer should sign off before it's treated as final.
5. **Optional:** a standalone subprocessor page / DPA if you begin signing enterprise data-processing
   agreements (the named list in the policy is sufficient for now).

---

## 5. What changed (across the audit commits)

**Analytics / privacy contradiction**
- `apps/site/index.html` — removed hardcoded Google Analytics/gtag.
- `apps/site/src/analytics.ts` — honor Do-Not-Track / Global Privacy Control before loading analytics.
- `apps/site/test/legal.e2e.ts` — regression guard: no third-party tracker in the built HTML.

**Accessibility (WCAG 2.2 AA / ADA)**
- `apps/site/src/design/tokens.css` — AA-tuned `--accent` (per-theme `--accent-fg`), per-theme
  `--danger`, and a brand `:focus-visible` ring. `Brand.tsx` / `notfound.e2e.ts` follow the new hex.
- `apps/site/src/nav/Header.tsx` — mobile-menu focus-move-in + focus-return.
- `apps/site/test/a11y.e2e.ts` — `@axe-core/playwright` scan (WCAG 2.0/2.1/2.2 A+AA), all pass.
- New **Accessibility Statement** at `/accessibility` (route + footer link + sitemap).

**Privacy legal content (GDPR / CCPA)**
- `apps/site/src/legal/legal-content.ts` — lawful basis, full data-subject rights, retention,
  international transfers, named subprocessors, US-state "do not sell/share", children's data, a
  dedicated `privacy@` contact; version bumped to 1.1.

**DSAR + unsubscribe backend + UI**
- `services/edge/functions/account/index.ts` — `/account-export` + `/account-delete`.
- `services/edge/functions/subscribe/index.ts` — `/unsubscribe`.
- `services/edge/src/server.ts` routing; `services/edge/test/{account,subscribe}.test.ts`.
- `apps/web` — `cloud.ts` client methods + `account/AccountPrivacy.tsx` dashboard panel.

Verification: site `tsc --noEmit` clean; `vite build` + SSG prerender (143 routes) succeeds; the
legal (6/6), a11y axe (6/6), nav, and notfound suites pass. The web app typechecks clean. The edge
DSAR/unsubscribe unit tests follow the existing DB-free pattern and run under `deno task test` in CI
(Deno's binary couldn't be fetched in this sandbox to run them locally). Pre-existing browser-based
suite failures (`about.e2e`, the hydrate test) come from `api.github.com` returning 403 and a
provisioned-chromium/Playwright version skew in this sandbox — not from these changes.
