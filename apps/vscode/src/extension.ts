import * as vscode from 'vscode';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ReviewStore, type Source } from '@diff-vis/core';

let activeStore: ReviewStore | undefined;
const scheme = 'diff-vis-snapshot';

export function activate(context: vscode.ExtensionContext): void {
  const workspace = vscode.workspace.workspaceFolders?.[0];
  if (!workspace) return;
  const root = workspace.uri.fsPath;
  activeStore = new ReviewStore(root);
  const store = activeStore;
  const provider = new SnapshotProvider(store);
  context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(scheme, provider));
  context.subscriptions.push(vscode.commands.registerCommand('diffVis.prepareReview', async () => {
    try { const result = await store.prepare(); vscode.window.showInformationMessage(`Prepared ${result.source.units.length} change units for review.`); }
    catch (error) { void vscode.window.showErrorMessage(message(error)); }
  }));
  context.subscriptions.push(vscode.commands.registerCommand('diffVis.openExplorer', () => openPanel(context, store, workspace.uri)));
  const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(workspace, '**/*'));
  const signal = (): void => { for (const panel of panels) panel.webview.postMessage({ type: 'refresh' }); };
  watcher.onDidChange(signal, undefined, context.subscriptions); watcher.onDidCreate(signal, undefined, context.subscriptions); watcher.onDidDelete(signal, undefined, context.subscriptions);
  context.subscriptions.push(watcher);
}

const panels = new Set<vscode.WebviewPanel>();
function openPanel(context: vscode.ExtensionContext, store: ReviewStore, workspace: vscode.Uri): void {
  const panel = vscode.window.createWebviewPanel('diffVis.explorer', 'Change Explorer', vscode.ViewColumn.Active, { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')], retainContextWhenHidden: true });
  panels.add(panel); panel.onDidDispose(() => panels.delete(panel));
  const media = vscode.Uri.joinPath(context.extensionUri, 'media');
  void readFile(path.join(context.extensionPath, 'media', 'index.html'), 'utf8').then((html) => {
    const nonce = randomNonce();
    let content = html.replace(/(src|href)="(\.\/assets\/[^\"]+)"/g, (_match, attribute: string, asset: string) => `${attribute}="${panel.webview.asWebviewUri(vscode.Uri.joinPath(media, asset.replace('./', '')))}"`);
    content = content.replace(/<script([^>]*)src="([^"]+)"([^>]*)><\/script>/g, `<script$1src="$2"$3 nonce="${nonce}"><\/script>`);
    const bridge = `<script nonce="${nonce}">const vscode=acquireVsCodeApi();let seq=0;const pending=new Map();const listeners=new Set();window.diffVisBridge={getState:()=>request('state'),evidence:(sourceId,ref,side)=>request('evidence',{sourceId,ref,side}),subscribe:(fn)=>{listeners.add(fn);return()=>listeners.delete(fn)},openEvidence:(sourceId,ref)=>vscode.postMessage({type:'openEvidence',sourceId,ref})};function request(op,args={}){const id=++seq;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});vscode.postMessage({type:'request',id,op,...args})})}window.addEventListener('message',e=>{const m=e.data;if(m.type==='response'){const p=pending.get(m.id);if(!p)return;pending.delete(m.id);m.error?p.reject(new Error(m.error)):p.resolve(m.value)}if(m.type==='refresh')for(const fn of listeners)fn()});</script>`;
    content = content.replace('</head>', `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${panel.webview.cspSource} data:; style-src ${panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${panel.webview.cspSource}; font-src ${panel.webview.cspSource};"></head>`).replace('<body>', `<body>${bridge}`);
    panel.webview.html = content;
  }).catch((error: unknown) => { panel.webview.html = `<html><body>Could not load the explorer: ${escapeHtml(message(error))}</body></html>`; });
  panel.webview.onDidReceiveMessage(async (incoming: Record<string, unknown>) => {
    try {
      if (incoming.type === 'openEvidence') { await openSnapshotDiff(store, String(incoming.sourceId), String(incoming.ref)); return; }
      if (incoming.type !== 'request') return;
      const op = String(incoming.op); let value: unknown;
      if (op === 'state') {
        const result = await store.check(); const report = result.report; const source = report ? await store.readSourceIndex(report.sourceId) : await latestSource(store);
        value = { report, source, status: result.status, pending: result.pending };
      } else if (op === 'evidence') value = await store.evidence(String(incoming.sourceId), String(incoming.ref), incoming.side === 'before' ? 'before' : 'after');
      else throw new Error('Unsupported explorer request.');
      panel.webview.postMessage({ type: 'response', id: incoming.id, value });
    } catch (error) { panel.webview.postMessage({ type: 'response', id: incoming.id, error: message(error) }); }
  });
  void workspace;
}

async function openSnapshotDiff(store: ReviewStore, sourceId: string, ref: string): Promise<void> {
  const source = await store.readSourceIndex(sourceId); const unit = source.units.find((entry) => entry.id === ref); if (!unit) throw new Error(`Unknown change unit ${ref}.`);
  if (source.evidence[ref]?.binary) { void vscode.window.showInformationMessage('Binary evidence is available as metadata in the explorer.'); return; }
  const left = vscode.Uri.parse(`${scheme}:/${encodeURIComponent(sourceId)}/${encodeURIComponent(ref)}/before`);
  const right = vscode.Uri.parse(`${scheme}:/${encodeURIComponent(sourceId)}/${encodeURIComponent(ref)}/after`);
  await vscode.commands.executeCommand('vscode.diff', left, right, `${unit.oldPath ?? '∅'} ↔ ${unit.newPath ?? '∅'}`);
}

class SnapshotProvider implements vscode.TextDocumentContentProvider {
  constructor(private readonly store: ReviewStore) {}
  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const [sourceId, ref, side] = uri.path.split('/').filter(Boolean).map(decodeURIComponent);
    if (!sourceId || !ref || (side !== 'before' && side !== 'after')) return '';
    const evidence = await this.store.evidence(sourceId, ref, side); return evidence.text ?? '';
  }
}

async function latestSource(store: ReviewStore): Promise<Source | null> { const latest = await store.latestForRoot(); return latest ? store.readSourceIndex(latest.sourceId) : store.currentSource(); }
function randomNonce(): string { const values = new Uint8Array(24); globalThis.crypto.getRandomValues(values); return [...values].map((value) => value.toString(16).padStart(2, '0')).join(''); }
function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char)); }
function message(error: unknown): string { return error instanceof Error ? error.message : 'Unknown error'; }

export function deactivate(): void { activeStore = undefined; }
