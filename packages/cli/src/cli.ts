import { Command } from 'commander';
import { UsageError } from '@mcpfold/core';
import { diagnose } from './commands/diagnose.js';
import { runSync } from './commands/sync.js';
import { runDiff } from './commands/diff.js';
import { runInit } from './commands/init.js';
import { runDoctor } from './commands/doctor.js';
import { runImport } from './commands/import.js';
import { runCommand, type Writer } from './output/render.js';
import { EXIT, type ExitCode } from './output/exit-codes.js';
import { enableDebug } from './util/debug.js';
import { CLI_VERSION } from './version.js';

/**
 * CLI wiring (S3.1). Command framework + global flags for the spec §8 surface:
 * `init · import · add · sync · diff · doctor · secret · run` (+ stubbed `login/push/pull`).
 *
 * Global flags `--profile`, `--cwd`, `--dry-run`, `--json`, `--debug` are accepted before
 * OR after the subcommand and merged (commander attributes a globally-declared option to
 * the root even when it trails the subcommand). Commands delegate to {@link runCommand},
 * which owns the envelope + exit-code contract. `mcpf` is a bin alias for `mcpfold`.
 */

interface GlobalFlags {
  profile?: string;
  cwd?: string;
  dryRun?: boolean;
  json?: boolean;
  debug?: boolean;
  check?: boolean;
}

export interface CliContext {
  cwd: string;
  profile?: string;
  dryRun: boolean;
  json: boolean;
}

function addGlobalFlags(cmd: Command): Command {
  return cmd
    .option('-p, --profile <name>', 'operate on a single profile instead of all')
    .option('-C, --cwd <dir>', 'directory to look for mcp.config.jsonc in')
    .option('--dry-run', 'show what would change; write nothing', false)
    .option('--json', 'emit machine-readable JSON (stable, versioned envelope)', false)
    .option('--debug', 'verbose, still-redacted debug logging to stderr', false);
}

export function buildProgram(writer?: Writer): { program: Command; getExitCode: () => ExitCode } {
  let exitCode: ExitCode = EXIT.SUCCESS;
  const setExit = (code: ExitCode): void => {
    exitCode = code;
  };

  const program = new Command();
  // Route commander's own output (help, version, usage errors) through our writer so
  // tests can capture it and so it honors the same streams as command output.
  if (writer) program.configureOutput({ writeOut: writer.out, writeErr: writer.err });
  addGlobalFlags(
    program
      .name('mcpfold')
      .description(
        'One source of truth for your MCP servers — fold one config out to every client.',
      )
      .version(CLI_VERSION, '-v, --version'),
  );

  const resolve = (cmdOpts: GlobalFlags): CliContext => {
    const root = program.opts<GlobalFlags>();
    if (cmdOpts.debug || root.debug) enableDebug();
    return {
      cwd: cmdOpts.cwd ?? root.cwd ?? process.cwd(),
      profile: cmdOpts.profile ?? root.profile,
      dryRun: Boolean(cmdOpts.dryRun || root.dryRun),
      json: Boolean(cmdOpts.json || root.json),
    };
  };

  // ---- Implemented commands ---------------------------------------------------

  addGlobalFlags(
    program
      .command('diagnose')
      .description('print a redaction-safe diagnostic bundle for bug reports')
      .option('-c, --config <path>', 'include this canonical config (redacted) in the bundle'),
  ).action(async (opts: GlobalFlags & { config?: string }) => {
    const ctx = resolve(opts);
    setExit(
      await runCommand('diagnose', ctx.json, () => diagnose({ configPath: opts.config }), writer),
    );
  });

  addGlobalFlags(
    program
      .command('sync')
      .description('fold the canonical config out to client files, with backups')
      .option(
        '--check',
        'exit nonzero if client files differ from canonical; write nothing',
        false,
      ),
  ).action(async (opts: GlobalFlags) => {
    const ctx = resolve(opts);
    setExit(
      await runCommand(
        'sync',
        ctx.json,
        () =>
          runSync({ cwd: ctx.cwd, profile: ctx.profile, dryRun: ctx.dryRun, check: opts.check }),
        writer,
      ),
    );
  });

  addGlobalFlags(
    program
      .command('diff')
      .description('show drift between the canonical config and on-disk client files'),
  ).action(async (opts: GlobalFlags) => {
    const ctx = resolve(opts);
    setExit(
      await runCommand(
        'diff',
        ctx.json,
        () => runDiff({ cwd: ctx.cwd, profile: ctx.profile }),
        writer,
      ),
    );
  });

  addGlobalFlags(
    program
      .command('init')
      .description('scaffold mcp.config.jsonc and detect installed clients')
      .option('-f, --force', 'overwrite an existing config', false),
  ).action(async (opts: GlobalFlags & { force?: boolean }) => {
    const ctx = resolve(opts);
    setExit(
      await runCommand(
        'init',
        ctx.json,
        () => runInit({ cwd: ctx.cwd, force: opts.force, dryRun: ctx.dryRun }),
        writer,
      ),
    );
  });

  addGlobalFlags(
    program
      .command('import')
      .description('adopt existing client configs into the canonical file')
      .option('-f, --force', 'overwrite an existing canonical config', false),
  ).action(async (opts: GlobalFlags & { force?: boolean }) => {
    const ctx = resolve(opts);
    setExit(
      await runCommand(
        'import',
        ctx.json,
        () => runImport({ cwd: ctx.cwd, force: opts.force, dryRun: ctx.dryRun }),
        writer,
      ),
    );
  });

  addGlobalFlags(
    program.command('doctor').description('validate config and catch silent failures'),
  ).action(async (opts: GlobalFlags) => {
    const ctx = resolve(opts);
    setExit(await runCommand('doctor', ctx.json, () => runDoctor({ cwd: ctx.cwd }), writer));
  });

  // ---- Stubbed commands (implemented in later stories) ------------------------

  const stub = (name: string, description: string, story: string): void => {
    addGlobalFlags(program.command(name).description(description)).action(
      async (opts: GlobalFlags) => {
        const ctx = resolve(opts);
        setExit(
          await runCommand(
            name,
            ctx.json,
            () => {
              throw new UsageError(`\`mcpfold ${name}\` is not implemented yet (${story}).`, {
                hint: 'Track progress in prd.json / ralph/PROGRESS.md.',
              });
            },
            writer,
          ),
        );
      },
    );
  };

  stub('add', 'interactive: add a server by URL/package', 'S3.4');
  stub('secret', 'wire up and verify a secret provider', 'S4.8');
  stub('run', 'internal shim launcher (resolve secret, filter tools, exec server)', 'S4.7');
  stub('login', 'authenticate to the mcpfold cloud (device-code OAuth)', 'S6.6');
  stub('push', 'push the canonical config to the cloud', 'S6.6');
  stub('pull', 'pull the canonical config from the cloud', 'S6.6');

  return { program, getExitCode: () => exitCode };
}

export async function run(argv: string[], writer?: Writer): Promise<ExitCode> {
  const { program, getExitCode } = buildProgram(writer);
  program.exitOverride();
  try {
    await program.parseAsync(argv, { from: 'user' });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    // Help/version are normal terminations, not errors.
    if (
      code === 'commander.helpDisplayed' ||
      code === 'commander.version' ||
      code === 'commander.help'
    ) {
      return EXIT.SUCCESS;
    }
    // Unknown command / missing argument / bad option → commander already printed guidance.
    return EXIT.ERROR;
  }
  return getExitCode();
}
