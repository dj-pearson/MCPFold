/**
 * `mcpfold` CLI package — public (testable) surface. The binary entry point is bin.ts.
 */

export { run, buildProgram } from './cli.js';
export { CLI_VERSION } from './version.js';

// Output contract (S0.10)
export {
  ENVELOPE_VERSION,
  errorEnvelope,
  successEnvelope,
  toEnvelopeError,
  type EnvelopeError,
  type JsonEnvelope,
} from './output/envelope.js';
export { EXIT, exitCodeForError, type ExitCode } from './output/exit-codes.js';
export { runCommand, type CommandOutput, type Writer } from './output/render.js';

// Redaction (S0.6, shared with S9.3)
export {
  defaultRedactor,
  maskTokens,
  redactConfig,
  redactRefPaths,
  Redactor,
} from './util/redact.js';
export { debug, enableDebug, isDebugEnabled } from './util/debug.js';

// Commands
export { buildDiagnoseBundle, diagnose, type DiagnoseBundle } from './commands/diagnose.js';
export {
  runSync,
  runSyncCheck,
  type SyncCheckData,
  type SyncCheckDeps,
  type SyncData,
  type SyncFileResult,
  type SyncOptions,
} from './commands/sync.js';
export { runDiff, type ClientDiff, type DiffData, type DiffOptions } from './commands/diff.js';
export { runInit, starterConfig, type InitData, type InitOptions } from './commands/init.js';
export { runDoctor, type DoctorData, type DoctorOptions } from './commands/doctor.js';
export { runMigrate, type MigrateData, type MigrateOptions } from './commands/migrate.js';
export {
  scaffoldAdapter,
  type ScaffoldAdapterOptions,
  type ScaffoldData,
} from './commands/scaffold-adapter.js';
export {
  runImport,
  type ImportConflict,
  type ImportData,
  type ImportOptions,
} from './commands/import.js';
export { detectClients, type DetectedClient } from './util/detect-clients.js';
export type { Finding, Severity } from './checks/types.js';

// Secret strategies + shim launcher + secret command (E4)
export {
  renderWithStrategy,
  InlineNotIgnoredError,
  type StrategyOptions,
} from './sync/strategy.js';
export {
  runRun,
  shouldUseProxy,
  type ProxySpawner,
  type RunOptions,
  type Spawner,
} from './commands/run.js';
export {
  runSecretSet,
  runSecretTest,
  type SecretSetData,
  type SecretTestData,
} from './commands/secret.js';

// IO helpers (S3.5)
export { atomicWrite } from './io/atomic-write.js';
export { backupIfExists } from './io/backup.js';
export { CONFIG_FILENAMES, findConfigPath, loadConfigFromDisk } from './util/config.js';
