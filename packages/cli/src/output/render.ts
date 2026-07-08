import { EXIT, exitCodeForError, type ExitCode } from './exit-codes.js';
import { errorEnvelope, successEnvelope, toEnvelopeError } from './envelope.js';

/**
 * The single output path shared by every command (S0.10). A command handler returns a
 * {@link CommandOutput}; this runner turns it into either a JSON envelope (machine path)
 * or human text (human path) and resolves the exit code. The two paths are fully
 * separated: changing `human` can never alter the JSON envelope, and vice-versa.
 */

export interface CommandOutput<TData> {
  /** Machine-readable payload for the `--json` envelope's `data` field. */
  data: TData;
  /** Human-readable text (no trailing newline required). */
  human: string;
  warnings?: string[];
  /** Overrides the success exit code (e.g. EXIT.DIFF for drift). Defaults to SUCCESS. */
  exit?: ExitCode;
}

export interface Writer {
  out: (text: string) => void;
  err: (text: string) => void;
}

export const processWriter: Writer = {
  out: (t) => process.stdout.write(t),
  err: (t) => process.stderr.write(t),
};

/**
 * Execute a command handler and emit its result. Returns the process exit code; the
 * caller (bin) applies it. `writer` is injectable so tests capture output without spawning.
 */
export async function runCommand<TData>(
  command: string,
  json: boolean,
  handler: () => Promise<CommandOutput<TData>> | CommandOutput<TData>,
  writer: Writer = processWriter,
): Promise<ExitCode> {
  try {
    const output = await handler();
    if (json) {
      const envelope = successEnvelope(command, output.data, output.warnings ?? []);
      writer.out(`${JSON.stringify(envelope)}\n`);
    } else {
      writer.out(output.human.endsWith('\n') ? output.human : `${output.human}\n`);
      for (const w of output.warnings ?? []) writer.err(`warning: ${w}\n`);
    }
    return output.exit ?? EXIT.SUCCESS;
  } catch (error) {
    const enorm = toEnvelopeError(error);
    if (json) {
      writer.out(`${JSON.stringify(errorEnvelope(command, [enorm]))}\n`);
    } else {
      writer.err(`error: ${enorm.message}\n`);
      if (enorm.hint) writer.err(`  → ${enorm.hint}\n`);
    }
    return exitCodeForError(error);
  }
}
