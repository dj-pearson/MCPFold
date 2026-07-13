import type { Command } from 'commander';
import { loadConfigFromDisk } from '../util/config.js';

/**
 * Shell completions (S11.2). `mcpfold completions <shell>` prints a completion script generated
 * from the live command tree (so it never drifts), and the scripts call back into the hidden
 * `mcpfold __complete <kind>` for dynamic `--profile` / server-name values from the local config.
 */

export const SHELLS = ['bash', 'zsh', 'fish', 'pwsh'] as const;
export type Shell = (typeof SHELLS)[number];

export interface CompletionSpec {
  bin: string;
  commands: { name: string; description: string }[];
  flags: string[]; // union of global + per-command long flags
}

function longFlags(options: readonly { flags: string }[]): string[] {
  return options.flatMap((o) =>
    o.flags
      .split(',')
      .map((part) => part.trim().split(/\s+/)[0] ?? '')
      .filter((token) => token.startsWith('--')),
  );
}

/** Derive the completion spec from the commander program — no hardcoded, drift-prone lists. */
export function buildSpec(program: Command): CompletionSpec {
  const commands = program.commands
    .map((c) => ({ name: c.name(), description: c.description() }))
    .filter((c) => !c.name.startsWith('__') && c.name !== 'help');
  const flags = new Set<string>(['--help', ...longFlags(program.options)]);
  for (const c of program.commands) longFlags(c.options).forEach((f) => flags.add(f));
  return { bin: program.name(), commands, flags: [...flags].sort() };
}

/** Dynamic completion candidates read from the local config (never throws — empty on any error). */
export function completionValues(kind: 'profiles' | 'servers', cwd: string): string[] {
  try {
    const { config } = loadConfigFromDisk(cwd);
    return Object.keys(kind === 'profiles' ? config.profiles : config.servers).sort();
  } catch {
    return [];
  }
}

export function completionScript(shell: Shell, spec: CompletionSpec): string {
  const names = spec.commands.map((c) => c.name);
  switch (shell) {
    case 'bash':
      return bash(spec, names);
    case 'zsh':
      return zsh(spec, names);
    case 'fish':
      return fish(spec, names);
    case 'pwsh':
      return pwsh(spec, names);
  }
}

function bash(spec: CompletionSpec, names: string[]): string {
  return `# bash completion for ${spec.bin} — eval "$(${spec.bin} completions bash)"
_${spec.bin}_complete() {
  local cur prev
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  local commands="${names.join(' ')}"
  local flags="${spec.flags.join(' ')}"
  case "$prev" in
    -p|--profile) COMPREPLY=( $(compgen -W "$(${spec.bin} __complete profiles 2>/dev/null)" -- "$cur") ); return;;
    test|inspect|restore) COMPREPLY=( $(compgen -W "$(${spec.bin} __complete servers 2>/dev/null)" -- "$cur") ); return;;
  esac
  if [[ "$cur" == -* ]]; then
    COMPREPLY=( $(compgen -W "$flags" -- "$cur") )
  else
    COMPREPLY=( $(compgen -W "$commands" -- "$cur") )
  fi
}
complete -F _${spec.bin}_complete ${spec.bin} mcpf
`;
}

function zsh(spec: CompletionSpec, _names: string[]): string {
  const described = spec.commands
    .map((c) => `    '${c.name}:${c.description.replace(/'/g, '')}'`)
    .join('\n');
  return `#compdef ${spec.bin} mcpf
# zsh completion for ${spec.bin} — add to your fpath, or: ${spec.bin} completions zsh > ~/.zsh/_${spec.bin}
_${spec.bin}() {
  local -a commands
  commands=(
${described}
  )
  _arguments -C '1:command:->cmds' '*::options:->opts'
  case $state in
    cmds) _describe 'command' commands ;;
    opts)
      case $words[1] in
        test|inspect|restore) compadd $(${spec.bin} __complete servers 2>/dev/null) ;;
        *) compadd ${spec.flags.join(' ')} ;;
      esac ;;
  esac
}
compdef _${spec.bin} ${spec.bin} mcpf
`;
}

function fish(spec: CompletionSpec, _names: string[]): string {
  const lines = [
    `# fish completion for ${spec.bin} — ${spec.bin} completions fish > ~/.config/fish/completions/${spec.bin}.fish`,
    `function __${spec.bin}_no_subcommand`,
    `  set -l cmd (commandline -opc)`,
    `  test (count $cmd) -eq 1`,
    `end`,
  ];
  for (const c of spec.commands) {
    lines.push(
      `complete -c ${spec.bin} -n '__${spec.bin}_no_subcommand' -a '${c.name}' -d '${c.description.replace(/'/g, '')}'`,
    );
  }
  lines.push(
    `complete -c ${spec.bin} -l profile -x -a '(${spec.bin} __complete profiles)'`,
    `complete -c ${spec.bin} -n '__fish_seen_subcommand_from test restore' -x -a '(${spec.bin} __complete servers)'`,
  );
  return lines.join('\n') + '\n';
}

function pwsh(spec: CompletionSpec, names: string[]): string {
  return `# PowerShell completion for ${spec.bin} — ${spec.bin} completions pwsh | Out-String | Invoke-Expression
Register-ArgumentCompleter -Native -CommandName ${spec.bin},mcpf -ScriptBlock {
  param($wordToComplete, $commandAst, $cursorPosition)
  $commands = @(${names.map((n) => `'${n}'`).join(',')})
  $flags = @(${spec.flags.map((f) => `'${f}'`).join(',')})
  $candidates = if ($wordToComplete -like '-*') { $flags } else { $commands }
  $candidates | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
    [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
  }
}
`;
}
