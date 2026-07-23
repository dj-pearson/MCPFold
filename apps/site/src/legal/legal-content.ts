/**
 * Legal & policy content (S13.14) — privacy, terms, and the analytics/cookie disclosure, kept in ONE
 * typed source so they are easy to date/version and update together.
 *
 * The copy is written to match the ACTUAL implementation, not boilerplate:
 *   - Site analytics is cookieless and PII-free, off unless built with VITE_ANALYTICS_* (see
 *     src/analytics.ts), and there is deliberately no cookie wall (docs/site-hosting.md).
 *   - The CLI collects nothing by default; telemetry is strictly opt-in (`MCPFOLD_TELEMETRY=1`),
 *     honors `DO_NOT_TRACK`, is a fixed allow-list of non-identifying fields, and passes through the
 *     secret redactor (docs/telemetry.md).
 *   - Secrets are always references; secret VALUES never leave your machine, including when syncing
 *     config to the optional cloud.
 *
 * Indexing note (documented choice): these are legitimate, low-competition pages, so they are
 * prerendered and left INDEXABLE (in the sitemap) rather than noindex — there is no thin-page or
 * index-bloat risk, and having them crawlable aids transparency.
 */

const EFFECTIVE_DATE = '2026-07-23';
const VERSION = '1.1';
const CONTACT = 'security@mcpfold.com';
const GITHUB = 'https://github.com/dj-pearson/MCPFold';

export interface LegalSection {
  heading: string;
  paragraphs: string[];
}

export interface LegalDoc {
  id: string;
  path: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  effectiveDate: string;
  version: string;
  intro: string;
  sections: LegalSection[];
}

export const LEGAL_DOCS: readonly LegalDoc[] = [
  {
    id: 'privacy',
    path: '/privacy',
    title: 'Privacy policy',
    metaTitle: 'Privacy policy — mcpfold',
    metaDescription:
      'What mcpfold collects: cookieless no-PII website analytics, a local-first CLI that collects nothing by default (opt-in telemetry only), and secret references that never leave your machine.',
    effectiveDate: EFFECTIVE_DATE,
    version: VERSION,
    intro:
      'mcpfold is built to need as little of your data as possible. The CLI runs entirely on your machine, the website uses privacy-friendly analytics with no cookies and no personal data, and secret values never leave your computer. This policy explains exactly what is and is not collected.',
    sections: [
      {
        heading: 'The website',
        paragraphs: [
          'When enabled, this site uses cookieless, privacy-friendly analytics (a Plausible/Umami-style endpoint) that measures aggregate page views and referrers only. It sets no cookies, stores no personally identifying information, and does not track you across other sites. Analytics is off entirely unless the site is built with the analytics environment variables, so previews and local runs never phone home.',
          'Because no personal data or cookies are involved, the site does not show a cookie-consent wall. See the analytics disclosure for details.',
        ],
      },
      {
        heading: 'The mcpfold CLI',
        paragraphs: [
          'The CLI is local-first and collects nothing by default — there is no network sink wired in the shipped tool. Telemetry is strictly opt-in: it is sent only if you set `MCPFOLD_TELEMETRY=1`, and it is forced off if you set `DO_NOT_TRACK=1` (the cross-tool convention) or `MCPFOLD_TELEMETRY=0`.',
          'If you do opt in, each event is a fixed allow-list of non-identifying fields (such as which subcommand ran) and passes through the same secret redactor the rest of the tool uses, as a final guard. Your configuration contents and secrets are never collected.',
        ],
      },
      {
        heading: 'The optional hosted cloud',
        paragraphs: [
          'The hosted team cloud is optional (and self-hostable). If you create an account, we store your account identifier (such as your email) and the configuration you choose to sync. That configuration carries secret references — placeholders like `${env:…}` — never the secret values themselves, which stay on your machine and are resolved locally.',
          'We use the account data only to provide the service (authentication, sync, and the audit trail). We do not sell your data.',
        ],
      },
      {
        heading: 'Legal bases for processing (GDPR)',
        paragraphs: [
          'For visitors in the EU/EEA and UK, we process the limited data described here on the following legal bases under the GDPR: performance of a contract (Art. 6(1)(b)) to operate the hosted cloud you signed up for — authentication, config sync, and the audit trail; our legitimate interests (Art. 6(1)(f)) in understanding aggregate, cookieless site traffic to improve the project, which is why analytics carries no personal data and honors Do-Not-Track / Global Privacy Control; and your consent (Art. 6(1)(a)) where you actively opt in, such as CLI telemetry or subscribing to updates. The local CLI processes no personal data at all.',
        ],
      },
      {
        heading: 'Data sharing, processors and subprocessors',
        paragraphs: [
          'We do not sell personal data, share it for cross-context behavioral advertising, or share it with advertisers. Where the hosted service relies on infrastructure providers, they act as processors that handle data solely to run the service on our behalf under data-processing terms.',
          'The subprocessors we currently use are: Supabase (managed Postgres, authentication, and hosting for the hosted cloud and edge service), Stripe (payment and subscription processing for paid plans — Stripe handles card data directly; we never see full card numbers), and Cloudflare (Pages hosting and CDN for the website). This list is kept current; material changes are reflected in the version and effective date above.',
        ],
      },
      {
        heading: 'International data transfers',
        paragraphs: [
          'Our infrastructure providers may process data in the United States and other countries. Where personal data of EU/EEA or UK residents is transferred internationally, it is protected by appropriate safeguards such as the Standard Contractual Clauses offered by those providers. Because the CLI and all local software run entirely on your own machine, they involve no cross-border transfer.',
        ],
      },
      {
        heading: 'Data retention',
        paragraphs: [
          'The website analytics is aggregate and non-identifying, so there is nothing personal to retain. For the hosted cloud, we retain your account data and synced configuration for as long as your account is active; when you close your account or ask us to delete it, we remove your account data (which cascades to the teams, machines, configs, and audit records tied to it), subject to any short retention required to meet legal, security, or billing obligations. Opt-in CLI telemetry events are non-identifying and retained only in aggregate.',
        ],
      },
      {
        heading: 'Your rights and choices',
        paragraphs: [
          'The CLI and everything local require no account and collect nothing by default. For the hosted cloud, and to the extent the GDPR, UK GDPR, or US state privacy laws apply to you, you have the right to access a copy of your data, to correct inaccurate data, to delete your data, to receive it in a portable format, to object to or restrict certain processing, and to withdraw consent at any time. You will not be discriminated against for exercising these rights.',
          `To exercise any of these rights, email ${CONTACT} from the address associated with your account and tell us what you would like to do; we respond within the timeframes the applicable law requires (generally within 30 days for GDPR and 45 days for California requests). You can also opt out of CLI telemetry at any time as described above, unsubscribe from any update emails, and opt out of website analytics by sending a Do-Not-Track or Global Privacy Control signal, which we honor automatically.`,
          'If you are in the EU/EEA or UK and believe we have not handled your data properly, you have the right to lodge a complaint with your local data-protection authority.',
        ],
      },
      {
        heading: 'California and US state privacy rights',
        paragraphs: [
          'We do not sell your personal information and we do not share it for cross-context behavioral advertising, so there is no "sale" or "share" to opt out of under the CCPA/CPRA and comparable US state laws. California and other US-state residents still have the rights to know, access, correct, delete, and be free from discrimination for exercising them; use the same contact above to make a request. Because we honor Global Privacy Control, a GPC signal is treated as a valid opt-out preference.',
        ],
      },
      {
        heading: "Children's privacy",
        paragraphs: [
          'mcpfold is a developer tool intended for adults and is not directed to children. We do not knowingly collect personal information from anyone under 16. If you believe a child has provided us personal data, contact us and we will delete it.',
        ],
      },
      {
        heading: 'Changes to this policy',
        paragraphs: [
          `This policy is versioned and dated (see the effective date above). Material changes will update the version. Questions? Email ${CONTACT} or open an issue on ${GITHUB}.`,
        ],
      },
    ],
  },
  {
    id: 'terms',
    path: '/terms',
    title: 'Terms of use',
    metaTitle: 'Terms of use — mcpfold',
    metaDescription:
      'The terms for using the mcpfold website, the MIT-licensed CLI, and the optional hosted cloud service — provided as-is, with the software governed by its MIT license.',
    effectiveDate: EFFECTIVE_DATE,
    version: VERSION,
    intro:
      'These terms cover your use of the mcpfold website and the optional hosted service. The mcpfold CLI and all local software are open source under the MIT license, and your use of them is governed by that license.',
    sections: [
      {
        heading: 'The software is MIT-licensed',
        paragraphs: [
          `The mcpfold CLI, the config format, the adapters, and the rest of the local tooling are released under the MIT license. Your rights to use, modify, and redistribute that software are defined by the license text, available in the repository (${GITHUB}/blob/main/LICENSE). Nothing here restricts the rights the MIT license grants you.`,
        ],
      },
      {
        heading: 'The website',
        paragraphs: [
          'This website is provided for information about the project. You may not use it to attempt to disrupt the service, probe it without authorization, or misrepresent your affiliation with the project.',
        ],
      },
      {
        heading: 'The optional hosted service',
        paragraphs: [
          'If you use the hosted team cloud, you are responsible for the configuration you sync and for keeping your account credentials secure. You agree to use the service lawfully and not to abuse it (for example, by attempting to access other accounts’ data).',
          'The hosted service is provided on an as-is basis; we do not guarantee uninterrupted availability, and we may change or discontinue features. You can also self-host it under its license terms.',
        ],
      },
      {
        heading: 'No warranty; limitation of liability',
        paragraphs: [
          'To the maximum extent permitted by law, the website and hosted service are provided without warranties of any kind, and the project and its maintainers are not liable for any indirect or consequential damages arising from their use. The MIT license’s warranty disclaimer governs the software itself.',
        ],
      },
      {
        heading: 'No implied endorsement',
        paragraphs: [
          'mcpfold is an independent, open-source project. The Model Context Protocol is an open standard; mcpfold is not affiliated with or endorsed by the MCP project, and client and product names are used only to describe compatibility.',
        ],
      },
      {
        heading: 'Changes and contact',
        paragraphs: [
          `We may update these terms; the version and effective date above will change when we do. Questions? Email ${CONTACT}.`,
        ],
      },
    ],
  },
  {
    id: 'analytics',
    path: '/analytics',
    title: 'Analytics & cookie disclosure',
    metaTitle: 'Analytics & cookies — mcpfold',
    metaDescription:
      'How mcpfold’s website measures traffic: cookieless, privacy-friendly analytics with no personal data and no cookie wall — what is measured, what is not, and how to opt out.',
    effectiveDate: EFFECTIVE_DATE,
    version: VERSION,
    intro:
      'This site is transparent about measurement. It uses privacy-friendly analytics that set no cookies and collect no personal data — which is exactly why you will never see a cookie-consent wall here.',
    sections: [
      {
        heading: 'What we measure',
        paragraphs: [
          'When analytics is enabled, we measure aggregate, non-identifying signals: page views, the pages visited, and referring sources. This is done with a Plausible/Umami-style endpoint that is designed for privacy.',
        ],
      },
      {
        heading: 'What we do not do',
        paragraphs: [
          'We set no cookies and load no third-party advertising or marketing trackers. We collect no personally identifying information, do not build user profiles, and do not track you across other websites. There are deliberately no Google Analytics, gtag, or similar tags on this site.',
          'The only client-side storage we use is first-party and functional: your theme preference, and — if you arrive from a campaign link — a single sessionStorage entry recording which channel referred you (e.g. `utm_source`), so a visit can be attributed to a channel in aggregate. It holds no identifier, is never shared, is not a cookie, and is cleared when you close the tab.',
        ],
      },
      {
        heading: 'No cookie wall — by design',
        paragraphs: [
          'Because the analytics stores no personal data and sets no cookies, no consent banner is legally required, and we deliberately do not add one. A cookie wall would be friction without a privacy benefit.',
        ],
      },
      {
        heading: 'How to opt out',
        paragraphs: [
          'You can opt out at any time by sending a Do-Not-Track or Global Privacy Control signal from your browser — we detect it and never load analytics at all — or by blocking the analytics script with an extension. Analytics is also disabled entirely on any build without the analytics configuration. See the privacy policy for the full picture.',
        ],
      },
    ],
  },
  {
    id: 'accessibility',
    path: '/accessibility',
    title: 'Accessibility statement',
    metaTitle: 'Accessibility statement — mcpfold',
    metaDescription:
      'mcpfold aims to conform to WCAG 2.2 Level AA. How the site supports keyboard, screen-reader, contrast, and reduced-motion needs, the known limitations we are tracking, and how to report an accessibility barrier.',
    effectiveDate: EFFECTIVE_DATE,
    version: VERSION,
    intro:
      'We want mcpfold to be usable by everyone, including people who rely on assistive technology. This statement describes how the website supports accessibility, the standard we target, known limitations, and how to reach us if something is not working for you.',
    sections: [
      {
        heading: 'Our target standard',
        paragraphs: [
          'We aim to conform to the Web Content Accessibility Guidelines (WCAG) 2.2 Level AA, and we use that standard as the yardstick for the US Americans with Disabilities Act (ADA) and the EU/EN 301 549 expectations. Accessibility is treated as an ongoing commitment, not a one-time checkbox.',
        ],
      },
      {
        heading: 'What the site supports',
        paragraphs: [
          'The site is built to be operated by keyboard alone: a "Skip to content" link is the first thing you reach, every interactive control shows a visible focus ring, and the navigation exposes its state to assistive tech (current page, expanded/collapsed menus). Pages use proper landmarks (header, navigation, main, footer) and a single, ordered heading structure.',
          'Content is written to work with screen readers: images carry descriptive alternative text (or are marked decorative), forms have associated labels, and status messages are announced politely. The site works in both light and dark themes, respects your operating-system color-scheme preference, and honors "reduce motion" so animations are turned off when you ask for less movement.',
        ],
      },
      {
        heading: 'How we test',
        paragraphs: [
          'Every change is checked in continuous integration against an automated accessibility budget (a Lighthouse accessibility score gate), alongside end-to-end tests that exercise keyboard navigation, skip links, and ARIA state. Automated testing cannot catch everything, so we also rely on manual review and your feedback.',
        ],
      },
      {
        heading: 'Known limitations',
        paragraphs: [
          'We are actively tracking a few items: some accent-colored text and buttons sit close to the minimum contrast ratio and are being tuned to comfortably clear WCAG AA, and the mobile navigation menu closes on Escape but does not yet trap focus while open. Documentation pages rendered from Markdown are held to the same standard but receive less frequent manual review. If you hit a barrier not listed here, please tell us.',
        ],
      },
      {
        heading: 'Report a problem',
        paragraphs: [
          `If any part of this site is difficult to use with assistive technology, we want to fix it. Email ${CONTACT} or open an issue on ${GITHUB} describing the page, what you were trying to do, and the assistive technology or browser you were using. We aim to acknowledge accessibility reports within a few business days.`,
        ],
      },
    ],
  },
];

/** Look up a legal doc by slug. */
export function legalDocById(id: string): LegalDoc | undefined {
  return LEGAL_DOCS.find((d) => d.id === id);
}
