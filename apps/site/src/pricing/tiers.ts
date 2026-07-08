/**
 * Pricing model (S14.3) — the single machine-readable source the pricing page (S13.6) renders and
 * the doc (docs/pricing-model.md) documents. Decisions + scaffolding only; billing is stubbed until
 * later. The CLI and all local features are MIT and free forever; the hosted cloud is the paid
 * surface.
 */

export type TierId = 'oss' | 'cloud-free' | 'team' | 'enterprise';

export interface PricingTier {
  id: TierId;
  name: string;
  /** Short price label; null renders as "Free" / "Contact us". */
  price: string;
  tagline: string;
  /** Bulleted, user-facing capability + limit list. */
  features: string[];
  cta: { label: string; href: string };
  featured?: boolean;
}

export const TIERS: PricingTier[] = [
  {
    id: 'oss',
    name: 'Open source',
    price: 'Free forever',
    tagline: 'The whole CLI, MIT-licensed. No account, no limits, runs entirely on your machine.',
    features: [
      'Every adapter + the canonical config',
      'Secret references (env, dotenv, op, keychain, infisical)',
      'sync / diff / doctor / status / test / restore, watch mode, completions',
      'Config-as-code drift gate + the GitHub Action',
      'Self-host the cloud (Supabase + edge) yourself',
    ],
    cta: { label: 'Install', href: '/install' },
  },
  {
    id: 'cloud-free',
    name: 'Cloud Free',
    price: '$0',
    tagline: 'Hosted sync for one person, so your config follows you across machines.',
    features: [
      '1 user, up to 3 machines',
      'Push / pull sync with 30-day version history',
      'Per-machine device login + revocation',
    ],
    cta: { label: 'Sign up', href: 'https://app.mcpfold.com' },
  },
  {
    id: 'team',
    name: 'Team',
    price: '$6 / user / mo',
    tagline: 'Shared team configs with roles and an audit trail — standardize MCP across the team.',
    features: [
      'Everything in Cloud Free',
      'Teams, member roles, shared team config',
      'Full change-audit trail (who changed what, when)',
      '1-year version history + priority support',
    ],
    cta: { label: 'Start a team', href: 'https://app.mcpfold.com' },
    featured: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Contact us',
    tagline: 'SSO, self-host support, and an SLA for larger orgs.',
    features: [
      'Everything in Team',
      'SSO / SAML, audit export',
      'Self-hosting support + SLA',
      'Security review + invoicing',
    ],
    cta: { label: 'Contact sales', href: 'mailto:sales@mcpfold.com' },
  },
];
