import * as vscode from 'vscode';
import { computeConfigBudget } from './tokenBudget';

/**
 * Inline tool-token-budget CodeLens for mcp.config.jsonc (S21.2). Above the `servers` block it shows
 * the file total; above each server key it shows that server's estimated tool-schema token cost. The
 * estimates reuse the committed benchmark method (see tokenBudget.ts) and are labeled approximate
 * until S21.4 collects real `tools/list` data. Every lens opens the web token calculator, tying the
 * editor to the calculator narrative. Provider is registered only for MCP config paths, so no other
 * file ever shows a lens; the whole feature is togglable via `mcpfold.showTokenBudget`.
 */

/** Matches mcp.config.jsonc / mcp.config.json by path, regardless of the editor's language id. */
export const MCP_CONFIG_SELECTOR: vscode.DocumentSelector = [
  { pattern: '**/mcp.config.jsonc' },
  { pattern: '**/mcp.config.json' },
];

const fmt = (n: number): string => n.toLocaleString('en-US');

export class TokenBudgetLensProvider implements vscode.CodeLensProvider {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.changed.event;

  /** Ask VS Code to re-request lenses (e.g. after the toggle setting changes). */
  refresh(): void {
    this.changed.fire();
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (!vscode.workspace.getConfiguration('mcpfold').get<boolean>('showTokenBudget', true)) {
      return [];
    }
    // Belt-and-suspenders alongside the selector: never annotate a non-MCP file.
    if (!/mcp\.config\.jsonc?$/.test(document.fileName)) return [];

    const budget = computeConfigBudget(document.getText());
    if (budget.servers.length === 0) return [];

    const lenses: vscode.CodeLens[] = [];

    if (budget.serversLine >= 0) {
      const plural = budget.servers.length === 1 ? '' : 's';
      lenses.push(
        new vscode.CodeLens(this.lineRange(document, budget.serversLine), {
          title: `$(dashboard) ~${fmt(budget.totalTokens)} tool-schema tokens across ${budget.servers.length} server${plural} (approx) — open calculator`,
          tooltip:
            'Estimated tokens these servers’ tool schemas add to every model request. Approximate until mcpfold collects each server’s real tools/list (S21.4). Click to open the full token calculator.',
          command: 'mcpfold.openCalculator',
        }),
      );
    }

    for (const server of budget.servers) {
      lenses.push(
        new vscode.CodeLens(this.lineRange(document, server.line), {
          title: `~${fmt(server.tokens)} tokens · ~${server.toolCount} tools (approx)`,
          tooltip: `Estimated tool-schema tokens “${server.name}” adds to the model context window, assuming ~${server.toolCount} tools. Approximate until mcpfold collects this server’s real tools/list. Click to open the token calculator.`,
          command: 'mcpfold.openCalculator',
        }),
      );
    }

    return lenses;
  }

  /** The range covering the given 0-based line, clamped to the document. */
  private lineRange(document: vscode.TextDocument, line: number): vscode.Range {
    const clamped = Math.max(0, Math.min(line, document.lineCount - 1));
    return document.lineAt(clamped).range;
  }
}
