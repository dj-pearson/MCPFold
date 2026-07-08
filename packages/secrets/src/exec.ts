import { spawn } from 'node:child_process';

/**
 * A minimal command runner shared by the keychain and 1Password providers. Injectable so
 * provider logic is testable without invoking the real OS backend or CLI. Never logs args
 * or output (they may contain secrets).
 */

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type CommandExec = (command: string, args: string[]) => Promise<ExecResult>;

export const defaultExec: CommandExec = (command, args) =>
  new Promise<ExecResult>((resolve, reject) => {
    let child;
    try {
      child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      reject(error);
      return;
    }
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d: string) => (stdout += d));
    child.stderr.on('data', (d: string) => (stderr += d));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
