# Shell completions

Tab-complete `mcpfold` commands, flags, and your own profile and server names.

```bash
mcpfold completions <bash|zsh|fish|pwsh>
```

Dynamic values (`--profile <name>`, and the server argument to `test` / `restore`) complete from
the `mcp.config.jsonc` in your current directory.

## Install

### bash

```bash
# one-off (current shell)
eval "$(mcpfold completions bash)"
# persistent
mcpfold completions bash > ~/.local/share/bash-completion/completions/mcpfold
```

### zsh

```bash
mkdir -p ~/.zsh/completions
mcpfold completions zsh > ~/.zsh/completions/_mcpfold
# ensure the dir is on your fpath (in ~/.zshrc, before `compinit`):
#   fpath=(~/.zsh/completions $fpath)
```

### fish

```bash
mcpfold completions fish > ~/.config/fish/completions/mcpfold.fish
```

### PowerShell

```powershell
# add to your $PROFILE
mcpfold completions pwsh | Out-String | Invoke-Expression
```

## How it works

The script is generated from the live command tree, so it never drifts from the actual CLI.
For dynamic values it calls the hidden `mcpfold __complete profiles|servers`, which reads the
canonical config in your working directory (and prints nothing if there isn't one — completion
never errors). The `mcpf` alias is completed too.
