#!/usr/bin/env node
import { run } from './cli.js';

/**
 * The `mcpfold` (and `mcpf`) binary entry point. Delegates to {@link run} and applies the
 * returned exit code — the exit-code contract (S0.10) lives entirely in library code so it
 * stays testable without spawning a process.
 */
run(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    process.stderr.write(`error: ${(error as Error)?.message ?? String(error)}\n`);
    process.exitCode = 2;
  });
