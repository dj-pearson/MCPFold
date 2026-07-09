import { spawn } from 'node:child_process';

/**
 * A minimal command runner shared by the keychain and 1Password providers. Injectable so
 * provider logic is testable without invoking the real OS backend or CLI. Never logs args
 * or output (they may contain secrets).
 *
 * S20.4: honors an AbortSignal so a hung provider child (a stuck `op`/`security`/`secret-tool`)
 * is terminated when the resolver times out, instead of being orphaned with its stdio pipes and
 * any keychain locks still held. On abort the child gets SIGTERM, then SIGKILL after a short grace
 * if it hasn't exited.
 */

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface ExecOptions {
  /** When aborted, the spawned child is terminated (SIGTERM → SIGKILL after `killGraceMs`). */
  signal?: AbortSignal;
  /** Grace period after SIGTERM before escalating to SIGKILL. Default 2000ms. */
  killGraceMs?: number;
}

export type CommandExec = (
  command: string,
  args: string[],
  options?: ExecOptions,
) => Promise<ExecResult>;

export const defaultExec: CommandExec = (command, args, options = {}) =>
  new Promise<ExecResult>((resolve, reject) => {
    const { signal, killGraceMs = 2000 } = options;
    if (signal?.aborted) {
      reject(new Error('aborted before start'));
      return;
    }
    let child;
    try {
      child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      reject(error);
      return;
    }

    let stdout = '';
    let stderr = '';
    let killTimer: ReturnType<typeof setTimeout> | undefined;

    // Terminate the child on abort so a hung provider can't outlive the resolver's timeout. The
    // SIGKILL escalation stays armed until the child actually exits (`close`), so a process that
    // ignores SIGTERM is still force-killed.
    const onAbort = (): void => {
      child.kill('SIGTERM');
      killTimer = setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL');
      }, killGraceMs);
      killTimer.unref?.();
    };
    if (signal) signal.addEventListener('abort', onAbort, { once: true });

    const cleanup = (): void => {
      if (killTimer) clearTimeout(killTimer);
      if (signal) signal.removeEventListener('abort', onAbort);
    };

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d: string) => (stdout += d));
    child.stderr.on('data', (d: string) => (stderr += d));
    child.on('error', (error) => {
      cleanup();
      reject(error);
    });
    child.on('close', (code) => {
      cleanup();
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
