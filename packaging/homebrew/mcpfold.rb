# Homebrew formula for mcpfold (S11.1). The release pipeline rewrites `version` and each `sha256`
# on publish and pushes this to the `dj-pearson/homebrew-tap` repo, so `brew upgrade` tracks every
# release. Installs the standalone binary — no Node required.
#
#   brew install dj-pearson/tap/mcpfold
class Mcpfold < Formula
  desc "One source of truth for your MCP servers — write once, fold out to every client"
  homepage "https://mcpfold.com"
  version "1.1.0"
  license "MIT"

  on_macos do
    on_arm do
      url "https://github.com/dj-pearson/MCPFold/releases/download/v0.0.0/mcpfold-macos-arm64"
      sha256 "0000000000000000000000000000000000000000000000000000000000000000"
    end
    on_intel do
      url "https://github.com/dj-pearson/MCPFold/releases/download/v0.0.0/mcpfold-macos-x64"
      sha256 "0000000000000000000000000000000000000000000000000000000000000000"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/dj-pearson/MCPFold/releases/download/v0.0.0/mcpfold-linux-arm64"
      sha256 "0000000000000000000000000000000000000000000000000000000000000000"
    end
    on_intel do
      url "https://github.com/dj-pearson/MCPFold/releases/download/v0.0.0/mcpfold-linux-x64"
      sha256 "0000000000000000000000000000000000000000000000000000000000000000"
    end
  end

  def install
    bin.install Dir["mcpfold-*"].first => "mcpfold"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/mcpfold --version")
  end
end
