#!/usr/bin/env bash
# mcpfold config gate (S12.2) — run by the packaged GitHub Action (action.yml). Runs the read-only
# doctor + sync --check gates over the --json envelope, turns findings into PR annotations and a job
# summary, and exits with the worst CLI exit code so the job status matches (0 clean, 1 drift, 2 error).
#
# Overridable for local testing: MCPFOLD_BIN (default `mcpfold`), MCPFOLD_CWD, MCPFOLD_PROFILE,
# MCPFOLD_CHECK (sync|doctor|both).
set -uo pipefail

BIN="${MCPFOLD_BIN:-mcpfold}"
CWD="${MCPFOLD_CWD:-.}"
CHECK="${MCPFOLD_CHECK:-both}"
SUMMARY="${GITHUB_STEP_SUMMARY:-/dev/null}"
profile=()
[ -n "${MCPFOLD_PROFILE:-}" ] && profile=(--profile "${MCPFOLD_PROFILE}")

# Run from the working directory so project-scope profiles (`path: "."`) resolve their client
# files there, not relative to the runner's checkout root.
cd "$CWD" 2>/dev/null || {
  echo "::error::mcpfold gate: working-directory '$CWD' not found"
  exit 2
}

status=0
worst() { [ "$1" -gt "$status" ] && status="$1"; return 0; }

echo "## mcpfold config gate" >>"$SUMMARY"

if [ "$CHECK" = "doctor" ] || [ "$CHECK" = "both" ]; then
  out="$("$BIN" doctor "${profile[@]}" --json 2>/dev/null)"
  code=$?
  # One annotation per finding, mapped to a GitHub annotation level.
  echo "$out" | jq -r '
    .data.findings[]? |
    "::" + (if .severity=="error" then "error" elif .severity=="warning" then "warning" else "notice" end)
    + " file=" + (.file // "mcp.config.jsonc") + "::" + .message + " — Fix: " + .fix' 2>/dev/null || true
  worst "$code"
  echo "- doctor: exit $code" >>"$SUMMARY"
fi

if [ "$CHECK" = "sync" ] || [ "$CHECK" = "both" ]; then
  out="$("$BIN" sync --check "${profile[@]}" --json 2>/dev/null)"
  code=$?
  # Annotate each client file that has drifted or is missing.
  echo "$out" | jq -r '
    .data.results[]? | select(.diff.hasDrift or .diff.fileMissing) |
    "::error file=" + .path + "::Client config drifted from mcp.config.jsonc — run `mcpfold sync` and commit."' 2>/dev/null || true
  worst "$code"
  echo "- sync --check: exit $code" >>"$SUMMARY"
fi

if [ "$status" -eq 0 ]; then
  echo "✓ Configs are in sync and doctor is clean." >>"$SUMMARY"
else
  echo "✗ Drift or problems found — see the annotations above." >>"$SUMMARY"
fi
exit "$status"
