import * as vscode from 'vscode';
import { computeConfigBudget } from './tokenBudget';
import { buildCurationLenses, type CurateServerReport, type ServerAnchor } from './curation';

/**
 * "Curate to usage" CodeLens for mcp.config.jsonc (E23 surface). Complements the token-budget lens
 * (S21.2): where that estimates a server's tool-schema cost, this shows — from REAL recorded proxy
 * usage (`mcpfold curate --json`) — how many tools a server actually uses and offers a one-click
 * `mcpfold curate <server> --write` to trim it. Anchoring reuses the token lens's JSONC scan
 * (computeConfigBudget), so the two never disagree about where a server sits. Gated by
 * `mcpfold.showCurateLens`; renders nothing until a report is loaded (see extension.ts refresh).
 */
export class CurationLensProvider implements vscode.CodeLensProvider {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.changed.event;

  /** The latest parsed report from `mcpfold curate --json`, or null when unavailable. */
  private report: Map<string, CurateServerReport> | null = null;

  /** Replace the cached report and ask VS Code to re-request lenses. */
  setReport(report: Map<string, CurateServerReport> | null): void {
    this.report = report;
    this.changed.fire();
  }

  /** Ask VS Code to re-request lenses (e.g. after the toggle setting changes). */
  refresh(): void {
    this.changed.fire();
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (!vscode.workspace.getConfiguration('mcpfold').get<boolean>('showCurateLens', true)) {
      return [];
    }
    if (!/mcp\.config\.jsonc?$/.test(document.fileName)) return [];

    const anchors: ServerAnchor[] = computeConfigBudget(document.getText()).servers.map((s) => ({
      name: s.name,
      line: s.line,
    }));

    return buildCurationLenses(anchors, this.report).map((lens) => {
      const range = this.lineRange(document, lens.line);
      const command: vscode.Command = {
        title: lens.title,
        tooltip: lens.tooltip,
        // An informational lens (no command) still needs a command id; a no-op keeps it inert.
        command: lens.command ?? '',
        arguments: lens.args,
      };
      return new vscode.CodeLens(range, command);
    });
  }

  private lineRange(document: vscode.TextDocument, line: number): vscode.Range {
    const clamped = Math.max(0, Math.min(line, document.lineCount - 1));
    return document.lineAt(clamped).range;
  }
}
