#!/bin/sh
# install.sh (S11.1) — install a standalone mcpfold binary via `curl … | sh`.
#
#   curl -fsSL https://mcpfold.com/install.sh | sh                 # latest
#   curl -fsSL https://mcpfold.com/install.sh | MCPFOLD_VERSION=0.1.0 sh   # pinned
#
# The download is checksum-verified before install and FAILS CLOSED on any mismatch, so a
# tampered binary is never run. POSIX sh; works on macOS and Linux.
set -eu

REPO="${MCPFOLD_REPO:-dj-pearson/MCPFold}"
VERSION="${MCPFOLD_VERSION:-latest}"
BIN_DIR="${MCPFOLD_BIN_DIR:-$HOME/.local/bin}"

# --- Detect OS / arch → the release asset name ---------------------------------------------
os="$(uname -s | tr '[:upper:]' '[:lower:]')"
case "$os" in
  linux) os="linux" ;;
  darwin) os="macos" ;;
  *) echo "mcpfold: unsupported OS '$os'" >&2; exit 1 ;;
esac
arch="$(uname -m)"
case "$arch" in
  x86_64 | amd64) arch="x64" ;;
  aarch64 | arm64) arch="arm64" ;;
  *) echo "mcpfold: unsupported architecture '$arch'" >&2; exit 1 ;;
esac
asset="mcpfold-${os}-${arch}"

# --- Resolve the download base (overridable for testing) -----------------------------------
if [ -n "${MCPFOLD_BASE_URL:-}" ]; then
  base="$MCPFOLD_BASE_URL"
elif [ "$VERSION" = "latest" ]; then
  base="https://github.com/${REPO}/releases/latest/download"
else
  base="https://github.com/${REPO}/releases/download/v${VERSION}"
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "mcpfold: downloading ${asset} (${VERSION})…"
curl -fsSL "${base}/${asset}" -o "$tmp/mcpfold"
curl -fsSL "${base}/${asset}.sha256" -o "$tmp/mcpfold.sha256"

# --- Verify the checksum — fail closed -----------------------------------------------------
expected="$(cut -d' ' -f1 "$tmp/mcpfold.sha256")"
if command -v sha256sum >/dev/null 2>&1; then
  actual="$(sha256sum "$tmp/mcpfold" | cut -d' ' -f1)"
else
  actual="$(shasum -a 256 "$tmp/mcpfold" | cut -d' ' -f1)"
fi
if [ -z "$expected" ] || [ "$expected" != "$actual" ]; then
  echo "mcpfold: CHECKSUM MISMATCH — refusing to install (expected $expected, got $actual)" >&2
  exit 1
fi

# --- Install -------------------------------------------------------------------------------
mkdir -p "$BIN_DIR"
chmod +x "$tmp/mcpfold"
mv "$tmp/mcpfold" "$BIN_DIR/mcpfold"
echo "mcpfold: installed to $BIN_DIR/mcpfold"
case ":$PATH:" in
  *":$BIN_DIR:"*) : ;;
  *) echo "mcpfold: add $BIN_DIR to your PATH to run 'mcpfold'." ;;
esac
