import { Command } from 'commander';
import { UsageError } from '@mcpfold/core';
import { diagnose } from './commands/diagnose.js';
import { runSync, runSyncWatch } from './commands/sync.js';
import { runDiff } from './commands/diff.js';
import { runInit } from './commands/init.js';
import { autoPrompter, runGuided, ttyPrompter } from './onboarding/guided.js';
import { runDoctor } from './commands/doctor.js';
import { runScan } from './commands/scan.js';
import { runStatus } from './commands/status.js';
import {
  runCurate,
  runCurateApply,
  runCuratePick,
  runCurateRefresh,
  type CurateData,
  type CuratePickData,
} from './commands/curate.js';
import { runInfo } from './commands/info.js';
import { runUpdate } from './commands/update.js';
import { runTest } from './commands/test.js';
import { discoverAndCacheServer, runInspect } from './commands/inspect.js';
import { runRestore } from './commands/restore.js';
import {
  buildSpec,
  completionScript,
  completionValues,
  SHELLS,
  type Shell,
} from './commands/completions.js';
import {
  defaultCachePath,
  detectChannel,
  getUpdateNotice,
  isNotifierEnabled,
  isRefreshDue,
  refreshSpawnTarget,
  refreshUpdateCache,
} from './update-notifier.js';
import { spawn } from 'node:child_process';
import { runImport } from './commands/import.js';
import { runExport } from './commands/export.js';
import { runAdd } from './commands/add.js';
import { runSearch } from './commands/search.js';
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
import { processWriter, runCommand, type Writer } from './output/render.js';
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

/**
 * Parse a numeric CLI flag, rejecting garbage instead of forwarding NaN/negatives to the
 * registry/cloud client (S22.21). `Number('abc')` is NaN and `Number('1.5')` is non-integer; both
 * used to pass through silently. Exported for unit testing.
 * @internal
 */
export function parseIntFlag(
  name: string,
  raw: string | undefined,
  opts: { min?: number } = {},
): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  const min = opts.min ?? 1;
  if (!Number.isInteger(n) || n < min) {
    throw new UsageError(`${name} must be an integer ${min > 0 ? `≥ ${min}` : ''}(got "${raw}").`, {
      hint: `Pass a whole number for ${name}.`,
    });
  }
  return n;
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
      .option('--check', 'exit nonzero if client files differ from canonical; write nothing', false)
      .option('--watch', 're-fold automatically when the config changes (Ctrl-C to stop)', false),
  ).action(async (opts: GlobalFlags & { check?: boolean; watch?: boolean }) => {
    const ctx = resolve(opts);
    if (opts.watch) {
      // Long-running: fold on change until a signal, then stop cleanly. (Not a --json command.)
      const w = writer ?? processWriter;
      await new Promise<void>((res) => {
        const handle = runSyncWatch(
          { cwd: ctx.cwd, profile: ctx.profile, dryRun: ctx.dryRun },
          { write: (line) => w.out(`${line}\n`) },
        );
        const shutdown = () => {
          handle.stop();
          w.out('\nStopped watching.\n');
          res();
        };
        process.once('SIGINT', shutdown);
        process.once('SIGTERM', shutdown);
      });
      return;
    }
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
      .option('-f, --force', 'overwrite an existing config', false)
      .option('--guided', 'walk through detect → import → fix → sync → savings', false)
      .option('--yes', 'accept all guided prompts (non-interactive / CI)', false),
  ).action(async (opts: GlobalFlags & { force?: boolean; guided?: boolean; yes?: boolean }) => {
    const ctx = resolve(opts);
    if (opts.guided) {
      // Interactive golden path (not a --json command). Non-interactive with --yes or no TTY.
      const w = writer ?? processWriter;
      const prompt =
        opts.yes || !process.stdin.isTTY
          ? autoPrompter(opts.yes ? true : undefined)
          : ttyPrompter();
      await runGuided(
        { cwd: ctx.cwd, dryRun: ctx.dryRun },
        { prompt, write: (line) => w.out(`${line}\n`) },
      );
      return;
    }
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
    program
      .command('export')
      .description('emit the flat ecosystem-standard .mcp.json from the canonical config')
      .option('--mcp-json', 'emit the flat .mcp.json format (the only format today)', false)
      .option('-o, --output <path>', 'output path (default: .mcp.json in the current directory)')
      .option('-f, --force', 'overwrite an existing output file', false),
  ).action(async (opts: GlobalFlags & { mcpJson?: boolean; output?: string; force?: boolean }) => {
    const ctx = resolve(opts);
    setExit(
      await runCommand(
        'export',
        ctx.json,
        () => {
          if (!opts.mcpJson) {
            throw new UsageError('`mcpfold export` needs a format flag.', {
              hint: 'Pass --mcp-json to emit a flat .mcp.json.',
            });
          }
          return runExport({
            cwd: ctx.cwd,
            profile: ctx.profile,
            output: opts.output,
            force: opts.force,
            dryRun: ctx.dryRun,
          });
        },
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
      .command('scan')
      .description('security preflight: audit every client config for known incident root causes'),
  ).action(async (opts: GlobalFlags) => {
    const ctx = resolve(opts);
    setExit(await runCommand('scan', ctx.json, () => runScan({ cwd: ctx.cwd }), writer));
  });

  addGlobalFlags(
    program
      .command('status')
      .description('at-a-glance health: detected clients, drift, config health, cloud state'),
  ).action(async (opts: GlobalFlags) => {
    const ctx = resolve(opts);
    setExit(await runCommand('status', ctx.json, () => runStatus({ cwd: ctx.cwd }), writer));
  });

  addGlobalFlags(
    program
      .command('curate')
      .description('recommend a per-server allow-list from recorded proxy tool usage (S23)')
      .argument('[server]', 'a single server to report on; omit for all')
      .option('--audit-log <path>', 'audit log to read (overrides MCPFOLD_AUDIT_LOG)')
      .option('--since <days>', 'only count calls within the last N days')
      .option('--min-calls <n>', 'ignore tools called fewer than N times')
      .option('--write', 'apply the recommended allow-lists to the canonical config')
      .option('--apply', 'alias for --write')
      .option(
        '--tools <list>',
        'day-zero: allow exactly these tools (comma-separated) for <server>',
      )
      .option(
        '--refresh',
        'surface tools <server> ships that its allow-list predates, and add them with consent',
      )
      .option('-y, --yes', 'skip the confirmation prompt when writing'),
  ).action(
    async (
      server: string | undefined,
      opts: GlobalFlags & {
        auditLog?: string;
        since?: string;
        minCalls?: string;
        write?: boolean;
        apply?: boolean;
        tools?: string;
        refresh?: boolean;
        yes?: boolean;
      },
    ) => {
      const ctx = resolve(opts);
      const curateOpts = {
        cwd: ctx.cwd,
        server,
        auditLogPath: opts.auditLog,
        sinceDays: parseIntFlag('--since', opts.since),
        minCalls: parseIntFlag('--min-calls', opts.minCalls),
      };
      const write = Boolean(opts.write || opts.apply);
      const toolsList = opts.tools
        ? opts.tools
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;
      setExit(
        await runCommand<CurateData | CuratePickData>(
          'curate',
          ctx.json,
          () => {
            // Allow-list staleness refresh (S24.11): surface + (with consent) add new upstream tools.
            if (server && opts.refresh) {
              return runCurateRefresh({
                cwd: ctx.cwd,
                server,
                yes: opts.yes,
                dryRun: ctx.dryRun,
                discover: (name) => discoverAndCacheServer({ cwd: ctx.cwd, server: name }),
              });
            }
            // Day-zero picker (S24.7): a specific server with --tools, or bare (no --write) so a fresh
            // user without audit history still reaches an allow-list. Usage precedence lives inside.
            if (server && (toolsList || !write)) {
              return runCuratePick({
                ...curateOpts,
                server,
                tools: toolsList,
                yes: opts.yes,
                dryRun: ctx.dryRun,
                // Live discovery fallback: introspect on the spot when no snapshot is cached, so a
                // fresh user needs no prior `mcpfold inspect`.
                discover: (name) => discoverAndCacheServer({ cwd: ctx.cwd, server: name }),
              });
            }
            return write || ctx.dryRun
              ? runCurateApply({ ...curateOpts, write: true, dryRun: ctx.dryRun, yes: opts.yes })
              : runCurate(curateOpts);
          },
          writer,
        ),
      );
    },
  );

  addGlobalFlags(
    program
      .command('info')
      .description('environment snapshot: version, install channel, config, and diagnostic state'),
  ).action(async (opts: GlobalFlags) => {
    const ctx = resolve(opts);
    setExit(await runCommand('info', ctx.json, () => runInfo({ cwd: ctx.cwd }), writer));
  });

  addGlobalFlags(
    program
      .command('update')
      .description('check now for a newer mcpfold and print the upgrade command for your install'),
  ).action(async (opts: GlobalFlags) => {
    const ctx = resolve(opts);
    setExit(await runCommand('update', ctx.json, () => runUpdate(), writer));
  });

  addGlobalFlags(
    program
      .command('test [server]')
      .description('connect to a server and confirm it initializes + lists tools')
      .option('--timeout <ms>', 'per-server connect timeout in milliseconds (default: 10000)'),
  ).action(async (server: string | undefined, opts: GlobalFlags & { timeout?: string }) => {
    const ctx = resolve(opts);
    setExit(
      await runCommand(
        'test',
        ctx.json,
        () =>
          runTest({
            cwd: ctx.cwd,
            server,
            profile: ctx.profile,
            timeoutMs: parseIntFlag('--timeout', opts.timeout),
          }),
        writer,
      ),
    );
  });

  addGlobalFlags(
    program
      .command('inspect [server]')
      .description(
        "introspect a server's live tool surface and cache tool counts + token estimates",
      )
      .option('--timeout <ms>', 'per-server connect timeout in milliseconds (default: 10000)'),
  ).action(async (server: string | undefined, opts: GlobalFlags & { timeout?: string }) => {
    const ctx = resolve(opts);
    setExit(
      await runCommand(
        'inspect',
        ctx.json,
        () =>
          runInspect({
            cwd: ctx.cwd,
            server,
            profile: ctx.profile,
            timeoutMs: parseIntFlag('--timeout', opts.timeout),
          }),
        writer,
      ),
    );
  });

  program
    .command('completions <shell>')
    .description(`print a shell completion script (${SHELLS.join(' | ')})`)
    .action((shell: string) => {
      const w = writer ?? processWriter;
      if (!(SHELLS as readonly string[]).includes(shell)) {
        w.err(`Unknown shell "${shell}". Supported: ${SHELLS.join(', ')}.\n`);
        setExit(EXIT.ERROR);
        return;
      }
      w.out(completionScript(shell as Shell, buildSpec(program)));
    });

  // Hidden: emit dynamic completion candidates from the shell's current directory (the user's
  // project) for the generated scripts to consume.
  program.command('__complete <kind>', { hidden: true }).action((kind: string) => {
    const w = writer ?? processWriter;
    if (kind !== 'profiles' && kind !== 'servers') return;
    for (const v of completionValues(kind, process.cwd())) w.out(`${v}\n`);
  });

  // Hidden: refresh the cached "latest version" in a detached background process (S11.3).
  program.command('__refresh-update', { hidden: true }).action(async () => {
    await refreshUpdateCache();
  });

  addGlobalFlags(
    program
      .command('restore [profile]')
      .description('roll a client file back to a mcpfold backup')
      .option('--list', 'list available backups without restoring', false)
      .option('--at <timestamp>', 'restore a specific backup (default: the latest)'),
  ).action(
    async (profile: string | undefined, opts: GlobalFlags & { list?: boolean; at?: string }) => {
      const ctx = resolve(opts);
      setExit(
        await runCommand(
          'restore',
          ctx.json,
          () =>
            runRestore({ cwd: ctx.cwd, profile, list: opts.list, at: opts.at, dryRun: ctx.dryRun }),
          writer,
        ),
      );
    },
  );

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
      .argument('<name>', 'server name from the canonical config')
      .option(
        '--audit-log <path>',
        'append a redacted JSONL tool-call audit log here (overrides MCPFOLD_AUDIT_LOG)',
      ),
  ).action(async (name: string, opts: GlobalFlags & { auditLog?: string }) => {
    const ctx = resolve(opts);
    try {
      setExit(
        (await runRun({
          cwd: ctx.cwd,
          name,
          auditLogPath: opts.auditLog,
          defaultAudit: true, // S24.8: record tool-call names by default (opt out via config/env)
        })) as ExitCode,
      );
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
      .description(
        'add a server by URL, npm package, or the official registry (guided or scripted)',
      )
      .argument('<name>', 'server name (a reverse-DNS registry name with --from-registry)')
      .option('--url <url>', 'remote server URL (creates an http server)')
      .option('--package <spec>', 'npm package spec (creates a stdio npx server)')
      .option('--from-registry', 'resolve <name> from the official MCP registry (pinned, ref-only)')
      .option('--from-mcpb', 'install from an .mcpb bundle (<name> is a file path or https URL)')
      .option(
        '--integrity <sha256>',
        'expected .mcpb SHA-256 (hex or SRI) to verify before install',
      )
      .option(
        '--secret-scheme <s>',
        'scheme for registry/mcpb secret refs: env|dotenv|infisical|keychain|op',
      )
      .option(
        '--as <name>',
        'local config key for a registry server (default: name’s last segment)',
      )
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
        fromRegistry?: boolean;
        fromMcpb?: boolean;
        integrity?: string;
        secretScheme?: 'env' | 'dotenv' | 'infisical' | 'keychain' | 'op';
        as?: string;
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
              fromRegistry: opts.fromRegistry,
              fromMcpb: opts.fromMcpb,
              mcpbIntegrity: opts.integrity,
              secretScheme: opts.secretScheme,
              as: opts.as,
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

  addGlobalFlags(
    program
      .command('search')
      .description('search the official MCP registry for servers (feed into `add --from-registry`)')
      .argument('<query>', 'search terms')
      .option('--limit <n>', 'max results (default 20)'),
  ).action(async (query: string, opts: GlobalFlags & { limit?: string }) => {
    const ctx = resolve(opts);
    setExit(
      await runCommand(
        'search',
        ctx.json,
        () => runSearch({ query, limit: parseIntFlag('--limit', opts.limit) }),
        writer,
      ),
    );
  });

  // ---- Config-as-code trust (S9.2) --------------------------------------------
  addGlobalFlags(
    program
      .command('trust')
      .description('approve new or changed server launch commands (config-as-code TOFU)')
      .argument('[name]', 'a single server to trust; omit to trust all untrusted')
      .option('--tools', 'also probe and pin the server’s tool definitions (rug-pull defense)'),
  ).action(async (name: string | undefined, opts: GlobalFlags & { tools?: boolean }) => {
    const ctx = resolve(opts);
    setExit(
      await runCommand(
        'trust',
        ctx.json,
        () => runTrust({ cwd: ctx.cwd, name, tools: opts.tools }),
        writer,
      ),
    );
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
      .option(
        '--allow-unsigned',
        'apply even when the config integrity cannot be verified (signed-but-keyless or unsigned)',
        false,
      )
      .option('--team <id>', 'pull a team config instead of your personal one')
      .option('--config-version <n>', 'pull a specific version instead of the latest'),
  ).action(
    async (
      opts: GlobalFlags & {
        yes?: boolean;
        allowUnsigned?: boolean;
        team?: string;
        configVersion?: string;
      },
    ) => {
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
              allowUnsigned: opts.allowUnsigned,
              teamId: opts.team,
              version: parseIntFlag('--config-version', opts.configVersion),
            }),
          writer,
        ),
      );
    },
  );

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
  } finally {
    maybeNotifyUpdate(argv[0], writer ?? processWriter);
  }
  return getExitCode();
}

/**
 * Non-blocking update notice (S11.3): print the cached notice to stderr, then kick off a detached
 * background refresh so the check never delays the command. Best-effort — never throws, never runs
 * for machine-facing commands, and (via isNotifierEnabled) never runs in CI / non-TTY.
 */
function maybeNotifyUpdate(command: string | undefined, w: Writer): void {
  try {
    // `update`/`info` already surface version state; a trailing cached notice would duplicate it.
    if (!command || command.startsWith('__') || command === 'completions') return;
    if (command === 'update' || command === 'info') return;
    const notice = getUpdateNotice({ currentVersion: CLI_VERSION });
    if (notice) w.err(`${notice}\n`);

    if (!isNotifierEnabled(process.env, Boolean(process.stdout.isTTY))) return;
    if (!isRefreshDue(defaultCachePath(), new Date())) return;
    // Channel-aware background refresh (S16.8): a standalone binary re-invokes its own
    // `__refresh-update` subcommand (process.argv[1] is unreliable under pkg/yao-pkg), while
    // node-based installs re-run the JS entry script as before.
    const channel = detectChannel(process.execPath);
    const target = refreshSpawnTarget(channel, process.execPath, process.argv[1]);
    if (!target) return;
    const child = spawn(target.command, target.args, {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
  } catch {
    // an update check must never affect the command
  }
}
