# mcpfold terminal demo (S11.4) — render with:  vhs demo/mcpfold.tape
# Produces docs/assets/demo.gif for the README + marketing site. Drives the real CLI against the
# committed fixture (demo/fixtures/cursor-mcp.json), so it can never drift from actual output.
# The demo LEADS with the context-window number; server names are examples (no endorsement).

Output docs/assets/demo.gif

Set Shell "bash"
Set FontSize 20
Set Width 1200
Set Height 760
Set Theme "Dracula"
Set Padding 24
Set TypingSpeed 45ms
Set PlaybackSpeed 1.0

# --- Set up an isolated demo project (hidden) ----------------------------------------------
Hidden
Type "export HOME=$(mktemp -d) && cd $(mktemp -d) && mkdir -p $HOME/.cursor" Enter
Type "cp $OLDPWD/demo/fixtures/cursor-mcp.json $HOME/.cursor/mcp.json 2>/dev/null || cp demo/fixtures/cursor-mcp.json $HOME/.cursor/mcp.json" Enter
Type "clear" Enter
Show

# --- Lead with the value -------------------------------------------------------------------
Type "# MCP tool-schemas cost context. mcpfold cuts them ~80% (7476 -> 1497 tokens)."
Enter
Sleep 2500ms
Type "# (server names below are examples — no endorsement implied)"
Enter
Sleep 1500ms

# --- Golden path: init -> import -> sync -> diff(clean) -------------------------------------
Type "mcpfold init" Enter
Sleep 2200ms
Type "mcpfold import" Enter
Sleep 2600ms
Type "mcpfold sync" Enter
Sleep 2400ms
Type "mcpfold diff" Enter
Sleep 2800ms
Type "# one source of truth, folded out to every client ✨" Enter
Sleep 2500ms
