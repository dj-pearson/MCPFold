import { useState } from 'react';

/** A copy-paste command block with a one-click copy button and accessible feedback (S13.3). */
export function CopyBlock({ command, label }: { command: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
    } catch {
      // Clipboard may be unavailable (e.g. insecure context) — still show feedback so the user
      // knows to copy manually; the command text is selectable.
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        background: 'var(--code-bg)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: 'var(--space-3) var(--space-4)',
      }}
    >
      <code
        style={{ background: 'none', padding: 0, flex: 1, overflowX: 'auto', whiteSpace: 'pre' }}
      >
        {command}
      </code>
      <button
        type="button"
        onClick={copy}
        aria-label={label ? `Copy: ${label}` : `Copy command: ${command}`}
        data-testid="copy-button"
        style={{
          background: 'var(--accent)',
          color: 'var(--accent-fg)',
          border: 'none',
          borderRadius: 'var(--radius)',
          padding: 'var(--space-2) var(--space-3)',
          fontWeight: 600,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  );
}
