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
| A3 | Dark-mode primary CTA: white text on `--accent #748ffc` ≈ **3.0:1** — fails AA (4.5:1) | High | ⚠️ Owner decision (brand color) — see §4 |
| A4 | Light-mode accent link/button text ≈ **4.3:1** — marginally under AA | Medium | ⚠️ Owner decision (brand color) — see §4 |
| A5 | `--danger` token undefined; error text falls back to `#e5484d` ≈ 3.9:1 | Low | ⚠️ Owner decision — define an AA-passing `--danger` |
| A6 | Mobile menu closes on Escape but has no focus trap / focus-return | Low | ⛔ Follow-up (2.4.3) |
| A7 | No axe/jest-axe rule engine (Lighthouse only) | Low | ⛔ Follow-up — add `@axe-core/playwright` |

Both contrast items (A3–A5) are documented as *known limitations* in the new Accessibility Statement
so the posted claim stays honest until the palette is tuned.

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

- The policy now describes access/erasure/portability rights, **but the hosted cloud has no
  self-service endpoint** to fulfill them. There is no account-deletion route, no data-export route, and
  the `configs`/audit tables are append-only. A DSAR currently requires manual Supabase-admin action.
  **⛔ Follow-up required** — build deletion + export endpoints in `services/edge`, or document the
  manual SLA-backed process. The schema already cascades on `auth.users` delete, so a deletion endpoint
  is mostly wiring.
- The subscribe form promises "unsubscribe anytime" and the `newsletter_subscribers` table has an
  `unsubscribed` state, but **nothing sets it** — there is no unsubscribe endpoint. **⛔ Follow-up
  required.**
- DSAR contact is the shared `security@mcpfold.com` mailbox. **⚠️ Owner decision** — consider a
  dedicated `privacy@mcpfold.com` alias and, if you have EU/EEA users at scale, whether a GDPR Art. 27
  EU representative is required.

---

## 4. Items requiring an owner decision

1. **Brand accent contrast (A3–A5).** Fixing the dark-mode CTA and borderline link contrast means
   darkening `--accent` (or the button background), which changes the visual identity site-wide. A
   value near `#3b5bdb`/`#4263eb` gets white-on-accent comfortably past 4.5:1 in both themes. Left for
   design sign-off; flagged as a known limitation in the Accessibility Statement in the meantime.
2. **DSAR backend** (deletion + export endpoints) and **newsletter unsubscribe** endpoint.
3. **Dedicated privacy contact** (`privacy@`) and EU Art. 27 representative assessment.
4. **A subprocessor page/DPA** if you begin signing enterprise data-processing agreements (the named
   list in the policy is sufficient for now).

---

## 5. What changed in this commit

- `apps/site/index.html` — removed hardcoded Google Analytics/gtag.
- `apps/site/src/analytics.ts` — honor Do-Not-Track / Global Privacy Control before loading analytics.
- `apps/site/src/design/tokens.css` — brand `:focus-visible` keyboard focus ring.
- `apps/site/src/legal/legal-content.ts` — expanded Privacy Policy (GDPR/CCPA) + corrected Analytics
  disclosure + new **Accessibility Statement**; version bumped to 1.1.
- `apps/site/src/App.tsx`, `src/site-structure.ts`, `src/legal/LegalPage.tsx` — wire the `/accessibility`
  route, footer link, and cross-links (auto-prerendered, in sitemap).
- `apps/site/test/legal.e2e.ts` — assert the new disclosures render, the accessibility page renders,
  and **no third-party tracker ships in the built HTML** (regression guard).

Verification: `tsc --noEmit` clean, `vite build` + SSG prerender (143 routes) succeeds, and the legal
e2e suite passes (6/6). Two unrelated suite failures (`about.e2e`, hydrate test on `/`) are caused by
`api.github.com` returning 403 in the sandboxed audit environment — both exercise live-GitHub fetches
on pages this change does not touch.
