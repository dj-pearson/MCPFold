# Install

Pick your channel — every one resolves to the **same version** for a given release (a CI check
enforces parity), so you can mix them across machines.

## npm / npx

No install needed to try it:

```bash
npx mcpfold init
```

Or install it globally:

```bash
npm install -g mcpfold      # `mcpfold` and the `mcpf` alias
```

## curl \| sh (macOS / Linux)

Installs a standalone binary — no Node required. The download is **checksum-verified and fails
closed** on any mismatch.

```bash
curl -fsSL https://mcpfold.com/install.sh | sh
```

Pin a version, or change the install directory:

```bash
curl -fsSL https://mcpfold.com/install.sh | MCPFOLD_VERSION=0.1.0 sh
curl -fsSL https://mcpfold.com/install.sh | MCPFOLD_BIN_DIR="$HOME/bin" sh
```

## Homebrew (macOS / Linux)

```bash
brew install dj-pearson/tap/mcpfold
brew upgrade mcpfold
```

## Scoop / winget (Windows)

```powershell
scoop bucket add mcpfold https://github.com/dj-pearson/scoop-bucket
scoop install mcpfold
# or, once listed:
winget install mcpfold
```

## Standalone binary (manual)

Download the binary for your platform from the
[latest release](https://github.com/dj-pearson/MCPFold/releases/latest), verify its checksum, and
put it on your `PATH`:

```bash
# macOS arm64 example
curl -fsSLO https://github.com/dj-pearson/MCPFold/releases/latest/download/mcpfold-macos-arm64
curl -fsSLO https://github.com/dj-pearson/MCPFold/releases/latest/download/mcpfold-macos-arm64.sha256
shasum -a 256 -c mcpfold-macos-arm64.sha256
chmod +x mcpfold-macos-arm64 && mv mcpfold-macos-arm64 /usr/local/bin/mcpfold
```

Binaries are published for macOS (arm64/x64), Linux (x64/arm64), and Windows (x64).

## Verify

```bash
mcpfold --version
mcpfold status      # is my setup OK? (see the Quickstart)
```
