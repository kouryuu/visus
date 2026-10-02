#!/usr/bin/env node
import path from 'node:path';
import { cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ReviewStore } from '@diff-vis/core';
import { startServer } from './server.js';
import { startMcp } from './mcp.js';

const [command = 'help', ...args] = process.argv.slice(2);
const option = (name: string): string | undefined => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const root = path.resolve(option('--root') ?? process.cwd());
const store = new ReviewStore(root);

try {
  switch (command) {
    case 'init': await store.initialize(); process.stdout.write(`Initialized local review storage for ${path.basename(root)}.\n`); break;
    case 'prepare': {
      const prepared = await store.prepare(option('--base'));
      const offset = Number(option('--offset') ?? 0); const limit = Math.min(500, Math.max(1, Number(option('--limit') ?? 100)));
      const units = prepared.source.units.slice(offset, offset + limit);
      process.stdout.write(`${JSON.stringify({ sourceId: prepared.source.id, scope: prepared.source.scope, base: prepared.source.baseRef, totalUnits: prepared.source.units.length, offset, hasMore: offset + units.length < prepared.source.units.length, units, expectedRevision: prepared.expectedRevision, affectedStories: prepared.affectedStories }, null, 2)}\n`); break;
    }
    case 'check': {
      const result = await store.check(option('--scope'));
      process.stdout.write(`${JSON.stringify({ status: result.status, revision: result.report?.revision ?? null, sourceId: result.report?.sourceId ?? null, pending: result.pending }, null, 2)}\n`);
      if (result.status === 'stale' || result.status === 'incomplete') process.exitCode = 1;
      break;
    }
    case 'hook': await runHook(store, option('--event') ?? 'stop'); break;
    case 'setup-claude': await setupClaude(root); break;
    case 'serve': await startServer(store, Number(option('--port') ?? process.env.DIFF_VIS_PORT ?? 4317), option('--export') ? path.resolve(option('--export')!) : undefined); break;
    case 'mcp': await startMcp(store); break;
    case 'export': {
      const scope = option('--scope'); const revision = option('--revision'); const destination = option('--out');
      if (!scope || !revision || !destination) throw new Error('Usage: diff-vis export --scope <scope> --revision <revision> --out <directory>');
      const target = path.resolve(destination); await store.exportReport(scope, revision, target);
      const viewer = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../packages/explorer/dist');
      await cp(viewer, target, { recursive: true, force: true });
      process.stdout.write(`Exported revision ${revision}. Start it with: diff-vis serve --export ${path.basename(target)}\n`); break;
    }
    default: process.stdout.write('diff-vis <init|prepare|check|hook|setup-claude|serve|mcp|export> [--root path] [options]\n');
  }
} catch (error) {
  console.error(JSON.stringify({ event: 'diff_vis.command_failed', command, message: error instanceof Error ? error.message : 'Unknown error' })); process.exitCode = 1;
}

async function runHook(reviewStore: ReviewStore, event: string): Promise<void> {
  const input = await new Promise<string>((resolve) => { let value = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', (chunk) => { value += chunk; }); process.stdin.on('end', () => resolve(value)); process.stdin.resume(); });
  const hookInput = input ? JSON.parse(input) as { stop_hook_active?: boolean; tool_input?: { file_path?: string } } : {};
  if (event === 'post-edit') {
    if ((hookInput.tool_input?.file_path ?? '').replaceAll('\\', '/').split('/').includes('.diff-vis')) { process.stdout.write('{}\n'); return; }
    await reviewStore.initialize();
    await import('node:fs/promises').then(({ writeFile }) => writeFile(path.join(reviewStore.dir, 'stale-signal.json'), JSON.stringify({ signaledAt: new Date().toISOString() })));
    process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { additionalContext: 'A repository edit may have changed the review source. Recheck change references before publishing.' } })}\n`); return;
  }
  const result = await reviewStore.check();
  if (result.status === 'fresh') {
    const retriesFile = path.join(reviewStore.dir, 'stop-retries.json');
    const retries = JSON.parse(await import('node:fs/promises').then(({ readFile }) => readFile(retriesFile, 'utf8').catch(() => '{}'))) as Record<string, number>;
    delete retries[result.report?.sourceId ?? 'missing'];
    await import('node:fs/promises').then(({ writeFile, rm }) => Promise.all([writeFile(retriesFile, `${JSON.stringify(retries, null, 2)}\n`), rm(path.join(reviewStore.dir, 'stale-signal.json'), { force: true })]));
    process.stdout.write('{}\n'); return;
  }
  if (hookInput.stop_hook_active) { process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { additionalContext: `Review remains ${result.status}; stop-hook retry limit was reached. Report the unresolved state and keep the prior revision visible.` } })}\n`); return; }
  await reviewStore.initialize();
  const key = result.report?.sourceId ?? 'missing'; const retryFile = path.join(reviewStore.dir, 'stop-retries.json');
  const retries = JSON.parse(await import('node:fs/promises').then(({ readFile }) => readFile(retryFile, 'utf8').catch(() => '{}'))) as Record<string, number>;
  const count = retries[key] ?? 0;
  if (count < 2) {
    retries[key] = count + 1;
    await import('node:fs/promises').then(({ writeFile }) => writeFile(retryFile, `${JSON.stringify(retries, null, 2)}\n`));
    const reason = result.status === 'incomplete' ? `Account for remaining change units: ${result.pending.join(', ')}.` : result.status === 'stale' ? 'Refresh the report against the current source before handoff.' : 'Prepare the comparison and publish stories before handoff.';
    process.stdout.write(`${JSON.stringify({ decision: 'block', reason: `diff-vis review is ${result.status}. ${reason}` })}\n`); return;
  }
  process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { additionalContext: `The review remains ${result.status} after two repair continuations. State the unresolved condition and leave the previous valid revision in place.` } })}\n`);
}

async function setupClaude(targetRoot: string): Promise<void> {
  const { mkdir, readFile, writeFile, copyFile } = await import('node:fs/promises');
  const projectSkill = path.join(targetRoot, '.claude', 'skills', 'change-story', 'SKILL.md');
  const bundledSkill = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../integrations/claude/change-story/SKILL.md');
  await mkdir(path.dirname(projectSkill), { recursive: true });
  try { await readFile(projectSkill); process.stdout.write('Existing change-story skill preserved.\n'); }
  catch { await copyFile(bundledSkill, projectSkill); }
  const settingsPath = path.join(targetRoot, '.claude', 'settings.local.json');
  const settings = JSON.parse(await readFile(settingsPath, 'utf8').catch(() => '{}')) as Record<string, unknown>;
  const hooks = (settings.hooks && typeof settings.hooks === 'object' ? settings.hooks : {}) as Record<string, Array<Record<string, unknown>>>;
  const addHook = (event: string, matcher: string, commandText: string): void => {
    const entries = hooks[event] ?? [];
    const match = entries.find((entry) => entry.matcher === matcher);
    const inner = match && Array.isArray(match.hooks) ? match.hooks as Array<Record<string, unknown>> : [];
    if (!inner.some((entry) => entry.command === commandText)) inner.push({ type: 'command', command: commandText });
    if (match) match.hooks = inner; else entries.push({ matcher, hooks: inner });
    hooks[event] = entries;
  };
  addHook('PostToolUse', 'Edit|Write|MultiEdit', 'diff-vis hook --event post-edit --root "$CLAUDE_PROJECT_DIR"');
  addHook('Stop', '', 'diff-vis hook --event stop --root "$CLAUDE_PROJECT_DIR"');
  settings.hooks = hooks;
  await mkdir(path.dirname(settingsPath), { recursive: true }); await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  const mcpPath = path.join(targetRoot, '.mcp.json'); const mcp = JSON.parse(await readFile(mcpPath, 'utf8').catch(() => '{}')) as Record<string, unknown>;
  const servers = (mcp.mcpServers && typeof mcp.mcpServers === 'object' ? mcp.mcpServers : {}) as Record<string, unknown>;
  if (!servers['diff-vis']) servers['diff-vis'] = { command: 'diff-vis', args: ['mcp'] };
  mcp.mcpServers = servers; await writeFile(mcpPath, `${JSON.stringify(mcp, null, 2)}\n`);
  process.stdout.write('Installed the change-story skill and merged local Claude hooks/MCP settings. Existing entries were preserved.\n');
}
