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

const EFFECTIVE_DATE = '2026-07-10';
const VERSION = '1.0';
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
        heading: 'Data sharing and processors',
        paragraphs: [
          'We do not sell personal data or share it with advertisers. Where the hosted service relies on infrastructure providers (for example, hosting and the database), they process data solely to run the service on our behalf.',
        ],
      },
      {
        heading: 'Your choices and rights',
        paragraphs: [
          'The CLI and everything local require no account and collect nothing by default. For the hosted cloud, you can request access to or deletion of your account data by contacting us. You can opt out of CLI telemetry at any time as described above, and out of website analytics by blocking the analytics script or sending a Do-Not-Track signal.',
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
          'We set no cookies and use no local storage for tracking. We collect no personally identifying information, do not build user profiles, and do not track you across other websites. There are no advertising or third-party marketing trackers.',
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
          'You can opt out at any time by blocking the analytics script in your browser or an extension, or by sending a Do-Not-Track signal. Analytics is also disabled entirely on any build without the analytics configuration. See the privacy policy for the full picture.',
        ],
      },
    ],
  },
];

/** Look up a legal doc by slug. */
export function legalDocById(id: string): LegalDoc | undefined {
  return LEGAL_DOCS.find((d) => d.id === id);
}
