import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { lstat, readFile, readlink } from 'node:fs/promises';
import path from 'node:path';
import { SourceSchema, type ChangeUnit, type Source } from './schema.js';

const run = promisify(execFile);
const git = async (cwd: string, args: string[]): Promise<string> => {
  const { stdout } = await run('git', ['--no-optional-locks', ...args], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return stdout;
};
const hash = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
const asText = (value: Buffer | undefined): string | undefined => {
  if (!value || value.includes(0)) return undefined;
  const text = value.toString('utf8'); return Buffer.from(text).equals(value) ? text : undefined;
};

async function gitBytes(cwd: string, ref: string, file: string): Promise<Buffer | undefined> {
  try { const { stdout } = await run('git', ['--no-optional-locks', 'show', `${ref}:${file}`], { cwd, encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 }); return stdout; } catch { return undefined; }
}

function parseHunks(patch: string): Array<{ before?: { start: number; end: number }; after?: { start: number; end: number } }> {
  const result: Array<{ before?: { start: number; end: number }; after?: { start: number; end: number } }> = [];
  for (const match of patch.matchAll(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm)) {
    const oldStart = Number(match[1]); const oldCount = Number(match[2] ?? 1);
    const newStart = Number(match[3]); const newCount = Number(match[4] ?? 1);
    result.push({ ...(oldCount ? { before: { start: oldStart, end: oldStart + oldCount - 1 } } : {}), ...(newCount ? { after: { start: newStart, end: newStart + newCount - 1 } } : {}) });
  }
  return result;
}

function parseNameStatus(raw: string): Array<{ status: string; oldPath?: string; newPath: string }> {
  const fields = raw.split('\0').filter(Boolean); const files: Array<{ status: string; oldPath?: string; newPath: string }> = [];
  for (let index = 0; index < fields.length;) {
    const status = fields[index++]!;
    if (status.startsWith('R') || status.startsWith('C')) files.push({ status, oldPath: fields[index++]!, newPath: fields[index++]! });
    else files.push({ status, newPath: fields[index++]! });
  }
  return files;
}

export interface CaptureOptions { root?: string; base?: string; retries?: number }

export async function captureReview(options: CaptureOptions = {}): Promise<Source> {
  const root = path.resolve(options.root ?? process.cwd());
  const top = (await git(root, ['rev-parse', '--show-toplevel'])).trim();
  const branch = (await git(top, ['branch', '--show-current'])).trim() || null;
  const headCommit = (await git(top, ['rev-parse', 'HEAD'])).trim();
  const defaultBase = await suggestedBase(top);
  const baseRef = options.base ?? defaultBase;
  if (!baseRef) throw new Error('No unambiguous local base branch was found. Pass --base <ref> to select one.');
  const baseCommit = (await git(top, ['rev-parse', '--verify', `${baseRef}^{commit}`])).trim();
  const mergeBase = (await git(top, ['merge-base', baseCommit, headCommit])).trim();
  if (!mergeBase) throw new Error('The selected base and HEAD have no merge base.');

  const tries = Math.max(0, Math.min(options.retries ?? 2, 2));
  for (let attempt = 0; attempt <= tries; attempt++) {
    const beforeState = await stateFingerprint(top);
    const tracked = parseNameStatus(await git(top, ['diff', '--name-status', '-z', '--find-renames', mergeBase, '--']));
    const untrackedRaw = await git(top, ['ls-files', '--others', '--exclude-standard', '-z']);
    const untracked = untrackedRaw.split('\0').filter((file) => file && !file.startsWith('.diff-vis/')).map((newPath) => ({ status: 'A', newPath }));
    const byPath = new Map<string, { status: string; oldPath?: string; newPath: string }>();
    for (const file of tracked) byPath.set(file.newPath, file);
    for (const file of untracked) byPath.set(file.newPath, file);
    const files = [...byPath.values()].sort((a, b) => a.newPath.localeCompare(b.newPath));
    const units: ChangeUnit[] = [];
    const evidence: Source['evidence'] = {};
    const records: string[] = [];
    for (const file of files) {
      const currentPath = path.join(top, file.newPath);
      let after: string | undefined;
      let afterBytes: Buffer | undefined;
      try {
        const info = await lstat(currentPath);
        afterBytes = info.isSymbolicLink() ? Buffer.from(await readlink(currentPath)) : await readFile(currentPath);
        after = asText(afterBytes);
      } catch { /* deleted endpoint */ }
      const oldPath = file.oldPath ?? file.newPath;
      const beforeBytes = await gitBytes(top, mergeBase, oldPath);
      const before = asText(beforeBytes);
      const isBinary = Boolean((afterBytes && after === undefined) || (beforeBytes && before === undefined));
      const modes = await modePair(top, mergeBase, oldPath, currentPath);
      const fileIdentity = hash(`${oldPath}\0${file.newPath}\0${modes.oldMode ?? ''}\0${modes.newMode ?? ''}\0${beforeBytes ? hash(beforeBytes) : ''}\0${afterBytes ? hash(afterBytes) : ''}`);
      let hunks: ReturnType<typeof parseHunks> = [];
      if (!isBinary && after !== undefined && !file.oldPath && file.status !== 'A') {
        hunks = parseHunks(await git(top, ['diff', '--no-ext-diff', '--no-textconv', '--unified=0', mergeBase, '--', file.newPath]));
      } else if (!isBinary && after !== undefined && (file.status === 'A' || untracked.some((entry) => entry.newPath === file.newPath))) {
        const count = after.split('\n').length - (after.endsWith('\n') ? 1 : 0);
        if (count > 0) hunks = [{ after: { start: 1, end: count } }];
      }
      if (hunks.length && !isBinary) {
        hunks.forEach((hunk, index) => {
          const id = `u-${hash(`${fileIdentity}:${index}:${JSON.stringify(hunk)}`).slice(0, 10)}`;
          units.push({ id, kind: 'text', ...(file.oldPath ? { oldPath: file.oldPath } : before !== undefined ? { oldPath } : {}), ...(after !== undefined ? { newPath: file.newPath } : {}), ...(modes.oldMode ? { oldMode: modes.oldMode } : {}), ...(modes.newMode ? { newMode: modes.newMode } : {}), ...hunk });
          evidence[id] = { ...(before !== undefined ? { before } : {}), ...(after !== undefined ? { after } : {}), binary: false };
        });
      } else {
        const kind = isBinary ? 'binary' : file.oldPath ? 'rename' : modes.oldMode !== modes.newMode ? 'mode' : 'file';
        const id = `u-${hash(`${fileIdentity}:${kind}`).slice(0, 10)}`;
        units.push({ id, kind, ...(file.oldPath ? { oldPath: file.oldPath } : before !== undefined ? { oldPath } : {}), ...(after !== undefined ? { newPath: file.newPath } : {}), ...(modes.oldMode ? { oldMode: modes.oldMode } : {}), ...(modes.newMode ? { newMode: modes.newMode } : {}), ...(isBinary ? { summary: 'Binary content; metadata evidence only.' } : {}) });
        evidence[id] = { ...(isBinary ? beforeBytes ? { beforeDigest: hash(beforeBytes) } : {} : before !== undefined ? { before } : {}), ...(isBinary ? afterBytes ? { afterDigest: hash(afterBytes) } : {} : after !== undefined ? { after } : {}), binary: isBinary };
      }
      if (hunks.length && modes.oldMode !== modes.newMode) {
        const id = `u-${hash(`${fileIdentity}:mode:${modes.oldMode}:${modes.newMode}`).slice(0, 10)}`;
        units.push({ id, kind: 'mode', ...(file.oldPath ? { oldPath: file.oldPath } : {}), ...(after !== undefined ? { newPath: file.newPath } : {}), ...(modes.oldMode ? { oldMode: modes.oldMode } : {}), ...(modes.newMode ? { newMode: modes.newMode } : {}), summary: 'File mode changed.' });
        evidence[id] = { ...(before !== undefined ? { before } : {}), ...(after !== undefined ? { after } : {}), binary: false };
      }
      records.push(`${file.status}\0${file.oldPath ?? ''}\0${file.newPath}\0${modes.oldMode ?? ''}\0${modes.newMode ?? ''}\0${beforeBytes ? hash(beforeBytes) : ''}\0${afterBytes ? hash(afterBytes) : ''}`);
    }
    const afterState = await stateFingerprint(top);
    if (beforeState !== afterState) {
      if (attempt < tries) continue;
      throw new Error('Source changed while it was being captured. Retry after edits settle.');
    }
    const fingerprint = hash(`${mergeBase}\0${headCommit}\0${records.join('\0')}`);
    const scope = hash(`${top}\0${branch ?? 'detached'}\0${baseRef}`).slice(0, 20);
    return SourceSchema.parse({ id: `s-${fingerprint.slice(0, 16)}`, scope, rootName: path.basename(top), branch, baseRef, baseCommit, headCommit, mergeBase, capturedAt: new Date().toISOString(), fingerprint, units, evidence });
  }
  throw new Error('Source changed while it was being captured.');
}

async function suggestedBase(root: string): Promise<string | undefined> {
  try {
    const value = (await git(root, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'])).trim();
    if (value) { await git(root, ['rev-parse', '--verify', `${value}^{commit}`]); return value; }
  } catch { /* missing or stale symbolic ref */ }
  const candidates: string[] = [];
  for (const candidate of ['main', 'master']) try { await git(root, ['rev-parse', '--verify', `${candidate}^{commit}`]); candidates.push(candidate); } catch { /* not a local default candidate */ }
  return candidates.length === 1 ? candidates[0] : undefined;
}

async function stateFingerprint(root: string): Promise<string> {
  const status = await git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  const head = await git(root, ['rev-parse', 'HEAD']);
  const diff = await git(root, ['diff', '--no-ext-diff', '--no-textconv', '--binary', 'HEAD', '--']);
  const untracked = (await git(root, ['ls-files', '--others', '--exclude-standard', '-z'])).split('\0').filter((file) => file && !file.startsWith('.diff-vis/'));
  const contents = await Promise.all(untracked.map(async (file) => {
    const full = path.join(root, file); const info = await lstat(full);
    const bytes = info.isSymbolicLink() ? Buffer.from(await readlink(full)) : await readFile(full);
    return `${file}\0${hash(bytes)}`;
  }));
  return hash(`${head}\0${status}\0${diff}\0${contents.join('\0')}`);
}

async function modePair(root: string, base: string, file: string, fullPath: string): Promise<{ oldMode?: string; newMode?: string }> {
  let oldMode: string | undefined; let newMode: string | undefined;
  try { const line = await git(root, ['ls-tree', base, '--', file]); oldMode = line.slice(0, 6).trim() || undefined; } catch { /* added file */ }
  try { const info = await lstat(fullPath); newMode = info.isSymbolicLink() ? '120000' : (info.mode & 0o111) ? '100755' : '100644'; } catch { /* deleted file */ }
  return { ...(oldMode ? { oldMode } : {}), ...(newMode ? { newMode } : {}) };
}
