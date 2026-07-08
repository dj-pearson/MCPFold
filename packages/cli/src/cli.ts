import { Command } from 'commander';
import { diagnose } from './commands/diagnose.js';
import { runSync } from './commands/sync.js';
import { runDiff } from './commands/diff.js';
import { runInit } from './commands/init.js';
import { runDoctor } from './commands/doctor.js';
import { runImport } from './commands/import.js';
import { runAdd } from './commands/add.js';
import { runRun } from './commands/run.js';
import { runMigrate } from './commands/migrate.js';
import { scaffoldAdapter } from './commands/scaffold-adapter.js';
import { runSecretSet, runSecretTest } from './commands/secret.js';
import { runLogin } from './commands/login.js';
import { runPush } from './commands/push.js';
import { runPull } from './commands/pull.js';
import { runTrust } from './commands/trust.js';
import { httpCloudApi } from './cloud/api.js';
import { osKeychainBackend } from './cloud/token-store.js';
import { resolveEndpoint } from './cloud/session.js';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { toEnvelopeError } from './output/envelope.js';
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

  addGlobalFlags(
    program
      .command('migrate')
      .description('upgrade an outdated mcp.config.jsonc to the current schema version'),
  ).action(async (opts: GlobalFlags) => {
    const ctx = resolve(opts);
    setExit(
      await runCommand(
        'migrate',
        ctx.json,
        () => runMigrate({ cwd: ctx.cwd, dryRun: ctx.dryRun }),
        writer,
      ),
    );
  });

  // run <name> — the shim launcher. Its exit code is the child server's, so it bypasses the
  // envelope and writes only coded errors (never a secret) to stderr.
  const errWrite = (text: string): void =>
    (writer?.err ?? ((t: string) => process.stderr.write(t)))(text);
  addGlobalFlags(
    program
      .command('run')
      .description('internal shim launcher (resolve secrets, inject, exec the server)')
      .argument('<name>', 'server name from the canonical config'),
  ).action(async (name: string, opts: GlobalFlags) => {
    const ctx = resolve(opts);
    try {
      setExit((await runRun({ cwd: ctx.cwd, name })) as ExitCode);
    } catch (error) {
      const enorm = toEnvelopeError(error);
      errWrite(`error: ${enorm.message}\n`);
      if (enorm.hint) errWrite(`  → ${enorm.hint}\n`);
      setExit(EXIT.ERROR);
    }
  });

  // secret set|test
  const secretCmd = program.command('secret').description('wire up and verify secret providers');
  addGlobalFlags(
    secretCmd
      .command('test')
      .description('resolve a ${scheme:path} reference and report success (value hidden)')
      .argument('<ref>', 'a ${scheme:path} secret reference'),
  ).action(async (ref: string, opts: GlobalFlags) => {
    const ctx = resolve(opts);
    setExit(
      await runCommand('secret test', ctx.json, () => runSecretTest({ cwd: ctx.cwd, ref }), writer),
    );
  });
  addGlobalFlags(
    secretCmd
      .command('set')
      .description('store a secret value for a backend that supports it (dotenv)')
      .argument('<ref>', 'a ${scheme:path} secret reference')
      .requiredOption('--value <value>', 'the value to store (never echoed)'),
  ).action(async (ref: string, opts: GlobalFlags & { value: string }) => {
    const ctx = resolve(opts);
    setExit(
      await runCommand(
        'secret set',
        ctx.json,
        () => runSecretSet({ cwd: ctx.cwd, ref, value: opts.value }),
        writer,
      ),
    );
  });

  addGlobalFlags(
    program
      .command('scaffold-adapter')
      .description('generate a new client adapter module + test (contributor on-ramp)')
      .argument('<name>', 'lowercase client id, e.g. continue'),
  ).action(async (name: string, opts: GlobalFlags) => {
    const ctx = resolve(opts);
    setExit(
      await runCommand(
        'scaffold-adapter',
        ctx.json,
        () => scaffoldAdapter({ name, adaptersRoot: join(ctx.cwd, 'packages', 'adapters') }),
        writer,
      ),
    );
  });

  addGlobalFlags(
    program
      .command('add')
      .description('add a server by URL or npm package (guided or scripted)')
      .argument('<name>', 'server name')
      .option('--url <url>', 'remote server URL (creates an http server)')
      .option('--package <spec>', 'npm package spec (creates a stdio npx server)')
      .option('--transport <t>', 'http | sse | stdio')
      .option('--pin <version>', 'pin a stdio package to a fixed version')
      .option('--tag <tag...>', 'tag(s) to attach')
      .option('--token-ref <ref>', 'auth token as a ${scheme:path} reference (never a raw token)')
      .option('--auth-type <t>', 'bearer | header | none', 'bearer'),
  ).action(
    async (
      name: string,
      opts: GlobalFlags & {
        url?: string;
        package?: string;
        transport?: 'http' | 'sse' | 'stdio';
        pin?: string;
        tag?: string[];
        tokenRef?: string;
        authType?: 'bearer' | 'header' | 'none';
      },
    ) => {
      const ctx = resolve(opts);
      setExit(
        await runCommand(
          'add',
          ctx.json,
          () =>
            runAdd({
              cwd: ctx.cwd,
              name,
              url: opts.url,
              package: opts.package,
              transport: opts.transport,
              pin: opts.pin,
              tags: opts.tag,
              tokenRef: opts.tokenRef,
              authType: opts.authType,
              dryRun: ctx.dryRun,
            }),
          writer,
        ),
      );
    },
  );

  // ---- Config-as-code trust (S9.2) --------------------------------------------
  addGlobalFlags(
    program
      .command('trust')
      .description('approve new or changed server launch commands (config-as-code TOFU)')
      .argument('[name]', 'a single server to trust; omit to trust all untrusted'),
  ).action(async (name: string | undefined, opts: GlobalFlags) => {
    const ctx = resolve(opts);
    setExit(await runCommand('trust', ctx.json, () => runTrust({ cwd: ctx.cwd, name }), writer));
  });

  // ---- Cloud sync: login / push / pull (S6.6) ---------------------------------
  const outWrite = (text: string): void =>
    (writer?.out ?? ((t: string) => process.stdout.write(t)))(text);

  addGlobalFlags(
    program.command('login').description('authenticate to the mcpfold cloud (device-code OAuth)'),
  ).action(async (opts: GlobalFlags) => {
    const ctx = resolve(opts);
    const endpoint = resolveEndpoint();
    setExit(
      await runCommand(
        'login',
        ctx.json,
        () =>
          runLogin({
            api: httpCloudApi(endpoint),
            backend: osKeychainBackend(),
            endpoint,
            machineName: hostname(),
            print: (m) => outWrite(`${m}\n`),
          }),
        writer,
      ),
    );
  });

  addGlobalFlags(
    program
      .command('push')
      .description('push the canonical config to the cloud (refs only, new version)')
      .option('--team <id>', 'push to a team config instead of your personal one'),
  ).action(async (opts: GlobalFlags & { team?: string }) => {
    const ctx = resolve(opts);
    setExit(
      await runCommand(
        'push',
        ctx.json,
        () =>
          runPush({
            cwd: ctx.cwd,
            api: httpCloudApi(resolveEndpoint()),
            backend: osKeychainBackend(),
            machineName: hostname(),
            teamId: opts.team,
          }),
        writer,
      ),
    );
  });

  addGlobalFlags(
    program
      .command('pull')
      .description('pull the canonical config from the cloud and diff/apply it')
      .option('--yes', 'apply the pulled config without confirmation', false)
      .option('--team <id>', 'pull a team config instead of your personal one')
      .option('--config-version <n>', 'pull a specific version instead of the latest'),
  ).action(async (opts: GlobalFlags & { yes?: boolean; team?: string; configVersion?: string }) => {
    const ctx = resolve(opts);
    setExit(
      await runCommand(
        'pull',
        ctx.json,
        () =>
          runPull({
            cwd: ctx.cwd,
            api: httpCloudApi(resolveEndpoint()),
            backend: osKeychainBackend(),
            yes: opts.yes,
            teamId: opts.team,
            version: opts.configVersion !== undefined ? Number(opts.configVersion) : undefined,
          }),
        writer,
      ),
    );
  });

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
