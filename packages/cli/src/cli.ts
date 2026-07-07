import { Command } from 'commander';
import { diagnose } from './commands/diagnose.js';
import { runSyncCheck } from './commands/sync.js';
import { runCommand, type Writer } from './output/render.js';
import { EXIT, type ExitCode } from './output/exit-codes.js';
import { enableDebug } from './util/debug.js';
import { CLI_VERSION } from './version.js';

/**
 * CLI wiring (S0.10 contract host; expanded into the full command surface at S3.1).
 *
 * `--json` and `--debug` are accepted both before the subcommand (`mcpfold --json diag`)
 * and after it (`mcpfold diag --json`) — commander does not inherit root options to
 * subcommands, so each subcommand declares them and we merge with the root's values.
 * Commands delegate to {@link runCommand}, which owns the envelope + exit-code contract.
 */

interface GlobalFlags {
  json?: boolean;
  debug?: boolean;
}

function addCommonFlags(cmd: Command): Command {
  return cmd
    .option('--json', 'emit machine-readable JSON (stable, versioned envelope)', false)
    .option('--debug', 'verbose, still-redacted debug logging to stderr', false);
}

export function buildProgram(writer?: Writer): { program: Command; getExitCode: () => ExitCode } {
  let exitCode: ExitCode = EXIT.SUCCESS;
  const setExit = (code: ExitCode): void => {
    exitCode = code;
  };

  const program = new Command();
  addCommonFlags(
    program
      .name('mcpfold')
      .description(
        'One source of truth for your MCP servers — fold one config out to every client.',
      )
      .version(CLI_VERSION, '-v, --version'),
  );

  /**
   * Effective flags = this subcommand's options OR the root's. Commander attributes a
   * globally-declared option (e.g. `--json`) to the ROOT even when it appears after the
   * subcommand, so we must OR the two (not `??`): the subcommand value is `false` by
   * default, and `false ?? true` would wrongly win.
   */
  const resolveFlags = (cmdOpts: GlobalFlags): { json: boolean } => {
    const root = program.opts<GlobalFlags>();
    const json = Boolean(cmdOpts.json || root.json);
    if (cmdOpts.debug || root.debug) enableDebug();
    return { json };
  };

  addCommonFlags(
    program
      .command('diagnose')
      .description('print a redaction-safe diagnostic bundle for bug reports')
      .option('-c, --config <path>', 'include this canonical config (redacted) in the bundle'),
  ).action(async (opts: GlobalFlags & { config?: string }) => {
    const { json } = resolveFlags(opts);
    setExit(
      await runCommand('diagnose', json, () => diagnose({ configPath: opts.config }), writer),
    );
  });

  addCommonFlags(
    program
      .command('sync')
      .description('fold the canonical config out to client files (use --check to gate CI)')
      .option(
        '--check',
        'exit nonzero if client files differ from canonical; write nothing',
        false,
      ),
  ).action(async (opts: GlobalFlags & { check?: boolean }) => {
    const { json } = resolveFlags(opts);
    // Real rendering via adapters arrives at S3.5; until then there is nothing to render.
    setExit(await runCommand('sync', json, () => runSyncCheck({ rendered: [] }), writer));
  });

  return { program, getExitCode: () => exitCode };
}

export async function run(argv: string[], writer?: Writer): Promise<ExitCode> {
  const { program, getExitCode } = buildProgram(writer);
  try {
    await program.parseAsync(argv, { from: 'user' });
  } catch {
    return EXIT.ERROR;
  }
  return getExitCode();
}
