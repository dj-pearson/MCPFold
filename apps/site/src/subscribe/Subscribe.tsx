import { useState, type FormEvent } from 'react';

/**
 * Reusable, privacy-friendly email capture / cloud-waitlist form (S13.18). Drop it on any surface
 * (homepage slot, pricing waitlist, a blog post) with a `source` for basic attribution. It:
 *   - collects no PII beyond the email,
 *   - carries consent copy consistent with how mcpfold handles data (unsubscribe anytime),
 *   - has a honeypot (`website`) for bot mitigation — if filled, we skip the network entirely,
 *   - shows accessible success / error states via an aria-live region, and
 *   - degrades gracefully: if the sink is unavailable, it shows a retry-able error, never throws.
 *
 * Posts to the public edge sink (services/edge/functions/subscribe), overridable via
 * VITE_SUBSCRIBE_URL for previews/tests.
 */
const SINK_URL =
  (import.meta.env.VITE_SUBSCRIBE_URL as string | undefined) ?? 'https://api.mcpfold.com/subscribe';

type Status = 'idle' | 'submitting' | 'success' | 'error';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function Subscribe({
  source = 'site',
  heading = 'Get the occasional update',
  blurb = 'New adapters, releases, and the cloud waitlist. No spam, unsubscribe anytime.',
}: {
  source?: string;
  heading?: string;
  blurb?: string;
}) {
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState(''); // honeypot — real users never see or fill this
  const [status, setStatus] = useState<Status>('idle');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    // Honeypot tripped: silently pretend it worked, send nothing.
    if (website.trim() !== '') {
      setStatus('success');
      return;
    }
    if (!EMAIL_RE.test(email.trim())) {
      setStatus('error');
      return;
    }
    setStatus('submitting');
    try {
      const res = await fetch(SINK_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), website, source }),
      });
      setStatus(res.ok ? 'success' : 'error');
    } catch {
      // Sink unavailable — degrade gracefully to a retry-able error, never throw.
      setStatus('error');
    }
  }

  return (
    <section
      data-testid="subscribe"
      aria-labelledby="subscribe-heading"
      style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        background: 'var(--bg-elevated)',
        padding: 'var(--space-6)',
        maxWidth: 560,
      }}
    >
      <h2 id="subscribe-heading" style={{ marginTop: 0 }}>
        {heading}
      </h2>
      <p style={{ color: 'var(--fg-muted)', marginTop: 0 }}>{blurb}</p>

      {status === 'success' ? (
        <p data-testid="subscribe-success" role="status">
          Thanks! Check your inbox to confirm your subscription.
        </p>
      ) : (
        <form onSubmit={onSubmit} data-testid="subscribe-form" noValidate>
          {/* Honeypot: off-screen + hidden from assistive tech; only bots fill it. */}
          <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', top: 'auto' }}>
            <label htmlFor="subscribe-website">Leave this field empty</label>
            <input
              id="subscribe-website"
              name="website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <label htmlFor="subscribe-email" style={{ position: 'absolute', left: '-9999px' }}>
              Email address
            </label>
            <input
              id="subscribe-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={status === 'error'}
              style={{
                flex: '1 1 220px',
                padding: 'var(--space-3)',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--fg)',
              }}
            />
            <button
              type="submit"
              data-testid="subscribe-submit"
              disabled={status === 'submitting'}
              style={{
                padding: 'var(--space-3) var(--space-5)',
                borderRadius: 'var(--radius)',
                border: '1px solid transparent',
                background: 'var(--accent)',
                color: 'var(--accent-fg)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {status === 'submitting' ? 'Subscribing…' : 'Subscribe'}
            </button>
          </div>

          <p aria-live="polite" style={{ minHeight: '1.2em', margin: 'var(--space-2) 0 0' }}>
            {status === 'error' && (
              <span data-testid="subscribe-error" style={{ color: 'var(--danger, #e5484d)' }}>
                Please enter a valid email — and if it still fails, try again in a moment.
              </span>
            )}
          </p>

          <p style={{ color: 'var(--fg-muted)', fontSize: '0.8rem', margin: 'var(--space-2) 0 0' }}>
            We store only your email to send these updates, and you can unsubscribe anytime. See how
            we handle data on the <a href="/security">security page</a>.
          </p>
        </form>
      )}
    </section>
  );
}
