import { useEffect, useRef } from 'react';
import { GUIDE_CLIENTS } from '../guides/guides.data';
import type { BenchResult } from '../benchmark/model';
import './fold.css';

/**
 * "The Fold" — the animated hero centerpiece (marketing-hero-animation).
 *
 * The literal product story, made visual: one canonical config at the top unfolds, on scroll,
 * into the MCP clients mcpfold targets — each panel showing that config under its *own* native
 * root key (`mcpServers`, `servers`, `context_servers`), pulled live from GUIDE_CLIENTS so the
 * demo can never drift from what `mcpfold sync` actually writes. An Apple-style pinned,
 * scroll-scrubbed timeline (GSAP ScrollTrigger, lazy-loaded, client-only) drives the unfold and
 * ticks the context-window-tax counter down from `tokensBefore` → `tokensAfter`.
 *
 * SSR/no-JS/reduced-motion render the fully unfolded grid as static, readable content, so SEO and
 * the home e2e assertions are unaffected and GSAP is pure enhancement.
 */

/** The six clients the hero showcases, in canonical adapter order. */
const FOLD_CLIENTS = GUIDE_CLIENTS.slice(0, 6).map((c) => ({
  id: c.id,
  label: c.label,
  root: c.configRoot,
}));

/** Deterministic per-client accent for the monogram chip (no third-party logos shipped). */
const DOT_COLORS: Record<string, string> = {
  'claude-code': '#d97757',
  'claude-desktop': '#d97757',
  cursor: '#111827',
  vscode: '#3b82f6',
  windsurf: '#22c55e',
  zed: '#6d28d9',
};

export function TheFold({ result }: { result: BenchResult }) {
  const foldRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const fold = foldRef.current;
    const stage = stageRef.current;
    if (!fold || !stage) return;

    // Honour the user's motion preference — no GSAP, keep the static unfolded layout.
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reduce.matches) return;

    let cleanup: (() => void) | undefined;
    let cancelled = false;

    // Lazy, client-only: GSAP + ScrollTrigger ship as their own chunk and never touch the SSR
    // bundle or block first paint.
    void (async () => {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([
        import('gsap'),
        import('gsap/ScrollTrigger'),
      ]);
      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger);

      fold.setAttribute('data-animated', 'true');
      const panels = gsap.utils.toArray<HTMLElement>('.fold__panel', stage);
      const source = stage.querySelector<HTMLElement>('.fold__source');
      const counterNum = counterRef.current?.querySelector<HTMLElement>('[data-fold-after]');

      const ctx = gsap.context(() => {
        // Folded start state: panels collapsed behind the source, faded and tipped back.
        gsap.set(panels, { yPercent: -8, scale: 0.9, opacity: 0, rotateX: -35, y: -40 });
        gsap.set(source, { scale: 1.02 });

        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: stage,
            start: 'center center',
            end: '+=900',
            scrub: 0.6,
            pin: true,
            pinSpacing: true,
            anticipatePin: 1,
          },
        });

        // The unfold: source settles, then each client panel swings down into its grid slot.
        tl.to(source, { scale: 1, duration: 0.4, ease: 'power2.out' }, 0).to(
          panels,
          {
            yPercent: 0,
            y: 0,
            scale: 1,
            opacity: 1,
            rotateX: 0,
            ease: 'power3.out',
            duration: 1,
            stagger: 0.12,
          },
          0.15,
        );

        // Scrub the context-window-tax counter down in lock-step with the unfold.
        if (counterNum) {
          const proxy = { v: result.tokensBefore };
          tl.to(
            proxy,
            {
              v: result.tokensAfter,
              duration: 1.2,
              ease: 'none',
              onUpdate: () => {
                counterNum.textContent = Math.round(proxy.v).toLocaleString();
              },
            },
            0.15,
          );
        }
      }, stage);

      cleanup = () => ctx.revert();
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [result.tokensBefore, result.tokensAfter]);

  return (
    <div className="fold" ref={foldRef} data-testid="the-fold">
      <div className="fold__stage" ref={stageRef}>
        <span className="fold__counter" ref={counterRef} aria-label="Context-window tax reduction">
          context-window tax
          <span>
            <s>{result.tokensBefore.toLocaleString()}</s>{' '}
            <b data-fold-after>{result.tokensAfter.toLocaleString()}</b> tokens
          </span>
          <span>~{result.reductionPct}% smaller</span>
        </span>

        <div className="fold__grid">
          <article className="fold__source" aria-label="Canonical mcpfold config">
            <div className="fold__label">
              <span className="fold__dot" style={{ background: 'var(--accent)' }}>
                ◆
              </span>
              mcpfold.yaml — one source of truth
            </div>
            <pre className="fold__code">
              <span className="k">servers</span>:{'\n'}
              {'  '}github: {'{'} tools: [create_issue, get_pr] {'}'}
              {'\n'}
              {'  '}supabase: {'{'} tools: [query, insert] {'}'}
            </pre>
          </article>

          {FOLD_CLIENTS.map((c) => (
            <article className="fold__panel" key={c.id} aria-label={`${c.label} config`}>
              <div className="fold__label">
                <span
                  className="fold__dot"
                  style={{ background: DOT_COLORS[c.id] ?? 'var(--fg-muted)' }}
                >
                  {c.label.slice(0, 1)}
                </span>
                {c.label}
              </div>
              <pre className="fold__code">
                <span className="k">{c.root}</span>: {'{'}
                {'\n'}
                {'  '}github: {'{…}'}
                {'\n'}
                {'  '}supabase: {'{…}'}
                {'\n'}
                {'}'}
              </pre>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
