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
  runSyncWatch,
  type SyncCheckData,
  type SyncCheckDeps,
  type SyncData,
  type SyncFileResult,
  type SyncOptions,
  type WatchIo,
} from './commands/sync.js';
export { type FsWatcher, nodeFsWatcher, watchWithDebounce, type WatchHandle } from './io/watch.js';
export { runDiff, type ClientDiff, type DiffData, type DiffOptions } from './commands/diff.js';
export { runInit, starterConfig, type InitData, type InitOptions } from './commands/init.js';
export {
  runInspect,
  type InspectData,
  type InspectOptions,
  type InspectServerResult,
} from './commands/inspect.js';
export {
  cachedToolNames,
  discoveryCacheDir,
  readSnapshot,
  writeSnapshot,
  type CacheLocation,
  type SurfaceSnapshot,
  type ToolTokenEstimate,
} from './discover/cache.js';
export { discoverSurface, type DiscoverOptions } from './discover/surface.js';
export {
  applySafeFixes,
  autoPrompter,
  type GuidedOptions,
  type GuidedResult,
  type Prompter,
  runGuided,
  scriptedPrompter,
  ttyPrompter,
} from './onboarding/guided.js';
export { runDoctor, type DoctorData, type DoctorOptions } from './commands/doctor.js';
export {
  buildSpec,
  completionScript,
  completionValues,
  SHELLS,
  type CompletionSpec,
  type Shell,
} from './commands/completions.js';
export {
  runTest,
  type TestData,
  type TestOptions,
  type TestServerResult,
  type TransportFactory,
} from './commands/test.js';
export {
  runStatus,
  type StatusClient,
  type StatusCloud,
  type StatusData,
  type StatusOptions,
} from './commands/status.js';
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
export {
  runExport,
  type ExportData,
  type ExportOptions,
  type UnresolvedRef,
} from './commands/export.js';
export {
  runAdd,
  deriveLocalName,
  type AddData,
  type AddOptions,
  type Prompt,
} from './commands/add.js';
export { runSearch, type SearchData, type SearchOptions } from './commands/search.js';
export {
  httpRegistryClient,
  registryBaseUrl,
  DEFAULT_REGISTRY_URL,
  type RegistryClient,
  type RegistrySearchResult,
} from './registry/client.js';
export {
  mapRegistryServer,
  toSri,
  type RegistryServer,
  type RegistryPackage,
  type RegistryRemote,
  type SecretScheme,
} from './registry/map.js';
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
  planRemoteRun,
  shouldUseProxy,
  type ProxySpawner,
  type RemoteRunPlan,
  type RunOptions,
  type Spawner,
} from './commands/run.js';
export {
  runSecretSet,
  runSecretTest,
  type SecretSetData,
  type SecretTestData,
} from './commands/secret.js';

// Config-as-code trust + version signing (S9.2)
export {
  defaultTrustPath,
  executableSignature,
  fileTrustGate,
  isExecutable,
  memoryTrustGate,
  untrustedServers,
  type ExecutableEntry,
  type TrustGate,
  type TrustStatus,
  type UntrustedServer,
} from './trust/tofu.js';
export {
  getOrCreateSigningKey,
  loadSigningKey,
  signConfig,
  verifyConfig,
} from './trust/signing.js';
export { runLogin, type LoginData, type LoginOptions } from './commands/login.js';
export { runPush, type PushData, type PushOptions } from './commands/push.js';
export { runPull, type PullData, type PullOptions } from './commands/pull.js';
export { runTrust, type TrustData, type TrustOptions } from './commands/trust.js';

// IO helpers (S3.5)
export {
  detectChannel,
  getUpdateNotice,
  isNewer,
  isNotifierEnabled,
  refreshUpdateCache,
  upgradeCommand,
  type UpdateChannel,
} from './update-notifier.js';
export { atomicWrite } from './io/atomic-write.js';
export { backupIfExists, listBackups, restoreBackup, type BackupInfo } from './io/backup.js';
export {
  runRestore,
  type RestoreData,
  type RestoreOptions,
  type RestoreTarget,
} from './commands/restore.js';
export {
  CONFIG_FILENAMES,
  MCP_JSON_FILENAME,
  findConfigPath,
  loadConfigFromDisk,
} from './util/config.js';
