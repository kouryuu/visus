import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { ReportSchema, PublishUpdateSchema, SourceSchema, type Report, type Source } from './schema.js';
import { captureReview } from './capture.js';

const digest = (value: string): string => createHash('sha256').update(value).digest('hex');
const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
const run = promisify(execFile);

export class ReviewStore {
  readonly root: string;
  readonly dir: string;
  constructor(root: string) { this.root = path.resolve(root); this.dir = path.join(this.root, '.diff-vis'); }

  async initialize(): Promise<void> {
    const { stdout } = await run('git', ['--no-optional-locks', 'rev-parse', '--show-toplevel'], { cwd: this.root, encoding: 'utf8' });
    if (path.resolve(stdout.trim()) !== this.root) throw new Error('Set --root to the Git worktree root before initializing diff-vis.');
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    await mkdir(path.join(this.dir, 'reviews'), { recursive: true, mode: 0o700 });
    await mkdir(path.join(this.dir, 'sources'), { recursive: true, mode: 0o700 });
    await mkdir(path.join(this.dir, 'blobs'), { recursive: true, mode: 0o700 });
    const { stdout: ignorePath } = await import('node:child_process').then(async ({ execFile }) => new Promise<{ stdout: string }>((resolve, reject) => execFile('git', ['rev-parse', '--git-path', 'info/exclude'], { cwd: this.root, encoding: 'utf8' }, (error, stdout) => error ? reject(error) : resolve({ stdout }))));
    const file = path.resolve(this.root, ignorePath.trim());
    const prior = await readFile(file, 'utf8').catch(() => '');
    if (!prior.split(/\r?\n/).includes('.diff-vis/')) await writeFile(file, `${prior}${prior.endsWith('\n') || !prior ? '' : '\n'}.diff-vis/\n`);
    await writeFile(path.join(this.dir, 'config.json'), json({ version: 1, base: null }), { flag: 'wx', mode: 0o600 }).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'EEXIST') throw error; });
  }

  async prepare(base?: string): Promise<{ source: Source; expectedRevision: string | null; affectedStories: string[] }> {
    await this.initialize();
    const configPath = path.join(this.dir, 'config.json');
    const config = JSON.parse(await readFile(configPath, 'utf8')) as { version: number; base?: string | null };
    const selectedBase = base ?? config.base ?? undefined;
    const source = await captureReview({ root: this.root, ...(selectedBase ? { base: selectedBase } : {}) });
    await atomicWrite(configPath, json({ version: 1, base: source.baseRef }));
    await this.saveSource(source);
    const latest = await this.readLatest(source.scope);
    const affectedStories = latest?.stories.filter((story) => story.groups.some((group) => group.refs.some((ref) => source.units.some((unit) => unit.id === ref)))) .map((story) => story.id) ?? [];
    return { source, expectedRevision: latest?.revision ?? null, affectedStories };
  }

  async saveSource(source: Source): Promise<void> {
    const sourcePath = path.join(this.dir, 'sources', `${source.id}.json`);
    const evidenceDir = path.join(this.dir, 'blobs');
    const evidenceManifest: Source['evidence'] = {};
    for (const [id, content] of Object.entries(source.evidence)) {
      for (const side of ['before', 'after'] as const) {
        const body = content[side]; if (body === undefined) continue;
        const blob = digest(body); await writeFile(path.join(evidenceDir, blob), body, { flag: 'wx', mode: 0o600 }).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'EEXIST') throw error; });
        (content as Record<string, unknown>)[`${side}Digest`] = blob;
      }
      evidenceManifest[id] = { ...(content.beforeDigest ? { beforeDigest: content.beforeDigest } : {}), ...(content.afterDigest ? { afterDigest: content.afterDigest } : {}), binary: content.binary };
    }
    await atomicWrite(sourcePath, json({ ...source, evidence: evidenceManifest }));
    await atomicWrite(path.join(this.dir, 'current-source.json'), json({ sourceId: source.id }));
  }

  async currentSource(): Promise<Source | null> {
    try { const value = JSON.parse(await readFile(path.join(this.dir, 'current-source.json'), 'utf8')) as { sourceId: string }; return await this.readSourceIndex(value.sourceId); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  }

  async readSource(sourceId: string): Promise<Source> {
    const stored = await this.readSourceIndex(sourceId);
    const evidence: Source['evidence'] = {};
    for (const [ref, value] of Object.entries(stored.evidence)) {
      const before = value.beforeDigest && !value.binary ? await readBlob(this.dir, value.beforeDigest) : undefined;
      const after = value.afterDigest && !value.binary ? await readBlob(this.dir, value.afterDigest) : undefined;
      evidence[ref] = { ...(before !== undefined ? { before } : {}), ...(after !== undefined ? { after } : {}), ...(value.beforeDigest ? { beforeDigest: value.beforeDigest } : {}), ...(value.afterDigest ? { afterDigest: value.afterDigest } : {}), binary: value.binary };
    }
    return { ...stored, evidence };
  }
  async readSourceIndex(sourceId: string): Promise<Source> { return SourceSchema.parse(JSON.parse(await readFile(path.join(this.dir, 'sources', `${safeId(sourceId)}.json`), 'utf8'))); }
  async readLatest(scope: string): Promise<Report | null> {
    try { const pointer = JSON.parse(await readFile(path.join(this.scopeDir(scope), 'latest.json'), 'utf8')) as { revision: string }; return this.readRevision(scope, pointer.revision); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  }
  async readRevision(scope: string, revision: string): Promise<Report> { return ReportSchema.parse(JSON.parse(await readFile(path.join(this.scopeDir(scope), 'revisions', `${safeId(revision)}.json`), 'utf8'))); }
  async history(scope: string): Promise<Array<{ revision: string; parent: string | null; publishedAt: string }>> {
    const dir = path.join(this.scopeDir(scope), 'revisions'); await mkdir(dir, { recursive: true, mode: 0o700 });
    const { readdir } = await import('node:fs/promises'); const names = await readdir(dir);
    const reports = await Promise.all(names.filter((name) => name.endsWith('.json')).map(async (name) => {
      const report = ReportSchema.parse(JSON.parse(await readFile(path.join(dir, name), 'utf8')));
      return { revision: report.revision, parent: report.parent, publishedAt: report.publishedAt };
    }));
    return reports.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  }

  async publish(input: unknown): Promise<{ report: Report; coverage: { accounted: number; pending: string[]; excluded: number }; duplicate: boolean }> {
    const update = PublishUpdateSchema.parse(input);
    const source = await this.readSourceIndex(update.sourceId);
    const scope = source.scope;
    const lock = path.join(this.scopeDir(scope), '.publish-lock'); await mkdir(path.dirname(lock), { recursive: true, mode: 0o700 });
    try { await mkdir(lock, { mode: 0o700 }); }
    catch {
      const lockMtime = await lstat(lock).then((info) => info.mtimeMs).catch(() => Date.now());
      const owner = await readFile(path.join(lock, 'owner.json'), 'utf8').then((text) => JSON.parse(text) as { pid: number; createdAt: number }).catch(() => ({ pid: -1, createdAt: lockMtime }));
      let alive = false; try { process.kill(owner.pid, 0); alive = true; } catch { /* owner process ended */ }
      if (alive || Date.now() - owner.createdAt < 30_000) throw new Error('A publication is already in progress for this review scope. Retry after it completes.');
      await rm(lock, { recursive: true, force: true }); await mkdir(lock, { mode: 0o700 });
    }
    try {
      await writeFile(path.join(lock, 'owner.json'), json({ pid: process.pid, createdAt: Date.now() }));
      const priorAckPath = path.join(this.scopeDir(scope), 'updates', `${safeId(update.updateId)}.json`);
      const priorAck = await readFile(priorAckPath, 'utf8').catch(() => undefined);
      if (priorAck) {
        const saved = JSON.parse(priorAck) as { inputHash: string; result: { report: Report; coverage: { accounted: number; pending: string[]; excluded: number } } };
        if (saved.inputHash !== digest(stableStringify(update))) throw new Error('This update ID was already used with different content.');
        return { ...saved.result, duplicate: true };
      }
      const latest = await this.readLatest(scope);
      if ((latest?.revision ?? null) !== update.expectedRevision) throw new Error(`Review revision changed. Expected ${update.expectedRevision ?? 'none'}; latest is ${latest?.revision ?? 'none'}.`);
      const current = await captureReview({ root: this.root, base: source.baseRef });
      if (current.fingerprint !== source.fingerprint) throw new Error(`Source changed since preparation (${source.units.map((unit) => unit.id).join(', ') || 'empty comparison'}). Prepare a fresh review before publishing.`);
      const validRef = (ref: string): boolean => source.units.some((unit) => unit.id === ref);
      const entities = new Map((latest?.entities ?? []).filter((entity) => entity.refs.every(validRef)).map((entity) => [entity.id, entity]));
      for (const id of update.removeEntities) entities.delete(id);
      for (const entity of update.entities ?? []) entities.set(entity.id, entity);
      const stories = new Map((latest?.stories ?? []).filter((story) => story.groups.every((group) => group.refs.every(validRef)) && story.decisions.every((entry) => entry.refs.every(validRef)) && story.impact.every((entry) => entry.refs.every(validRef) && entities.has(entry.from) && entities.has(entry.to))).map((story) => [story.id, story]));
      for (const id of update.removeStories) stories.delete(id);
      for (const story of update.stories) stories.set(story.id, story);
      const exclusions = update.exclusions ?? latest?.exclusions.filter((entry) => entry.refs.every(validRef)) ?? [];
      const revision = `r-${digest(`${update.updateId}:${Date.now()}`).slice(0, 12)}`;
      const report = ReportSchema.parse({ schemaVersion: 1, revision, parent: latest?.revision ?? null, scope, sourceId: source.id, publishedAt: new Date().toISOString(), author: { kind: 'agent', name: update.author }, entities: [...entities.values()], stories: [...stories.values()], exclusions });
      const validation = validateCoverage(report, source);
      validateReferences(report, source);
      const latestNow = await this.readLatest(scope);
      if ((latestNow?.revision ?? null) !== update.expectedRevision) throw new Error('Review changed during publication. The prior revision remains current; prepare and retry.');
      const revisions = path.join(this.scopeDir(scope), 'revisions'); await mkdir(revisions, { recursive: true, mode: 0o700 });
      const revisionPath = path.join(revisions, `${revision}.json`);
      await atomicWrite(revisionPath, json(report));
      await atomicWrite(path.join(this.scopeDir(scope), 'latest.json'), json({ revision }));
      const result = { report, coverage: validation };
      await mkdir(path.dirname(priorAckPath), { recursive: true, mode: 0o700 }); await atomicWrite(priorAckPath, json({ inputHash: digest(stableStringify(update)), result }));
      return { ...result, duplicate: false };
    } finally { await rm(lock, { recursive: true, force: true }); }
  }

  async check(scope?: string): Promise<{ status: 'missing' | 'fresh' | 'stale' | 'incomplete'; report: Report | null; pending: string[] }> {
    const config = await readFile(path.join(this.dir, 'config.json'), 'utf8').then((text) => JSON.parse(text) as { base?: string | null }).catch((): { base?: string | null } => ({}));
    let current: Source | undefined;
    let report: Report | null;
    if (scope) report = await this.readLatest(scope);
    else if (config.base) {
      try { current = await captureReview({ root: this.root, base: config.base }); report = await this.readLatest(current.scope); }
      catch { report = await this.latestForRoot(); }
    } else report = await this.latestForRoot();
    if (!report) return { status: 'missing', report: null, pending: [] };
    const source = await this.readSourceIndex(report.sourceId);
    try { current ??= await captureReview({ root: this.root, base: source.baseRef }); }
    catch { return { status: 'stale', report, pending: [] }; }
    if (current.scope !== report.scope) return { status: 'stale', report, pending: [] };
    if (current.fingerprint !== source.fingerprint) return { status: 'stale', report, pending: [] };
    const coverage = validateCoverage(report, source);
    return { status: coverage.pending.length ? 'incomplete' : 'fresh', report, pending: coverage.pending };
  }

  async latestForRoot(): Promise<Report | null> {
    const { readdir } = await import('node:fs/promises'); const dirs = await readdir(path.join(this.dir, 'reviews')).catch(() => []);
    for (const scope of dirs) { const report = await this.readLatest(scope); if (report) return report; }
    return null;
  }

  async evidence(sourceId: string, ref: string, side: 'before' | 'after'): Promise<{ text?: string; binary: boolean; unit: Source['units'][number] }> {
    const source = await this.readSourceIndex(sourceId); const unit = source.units.find((candidate) => candidate.id === ref);
    if (!unit) throw new Error(`Unknown change reference: ${ref}`);
    const data = source.evidence[ref]; if (!data) throw new Error(`Evidence is unavailable for ${ref}`);
    const blob = side === 'before' ? data.beforeDigest : data.afterDigest;
    const text = blob && !data.binary ? await readBlob(this.dir, blob) : undefined;
    return { ...(text !== undefined ? { text } : {}), binary: data.binary, unit };
  }

  async exportReport(scope: string, revision: string, destination: string): Promise<void> {
    const report = await this.readRevision(scope, revision); const source = await this.readSourceIndex(report.sourceId);
    const target = path.resolve(destination); await mkdir(path.join(target, 'blobs'), { recursive: true, mode: 0o700 });
    await writeFile(path.join(target, 'report.json'), json(report), { mode: 0o600 });
    const portable = { ...source, evidence: Object.fromEntries(Object.entries(source.evidence).map(([ref, value]) => [ref, { binary: value.binary, ...(value.beforeDigest ? { beforeDigest: value.beforeDigest } : {}), ...(value.afterDigest ? { afterDigest: value.afterDigest } : {}) }])) };
    await writeFile(path.join(target, 'source.json'), json(portable), { mode: 0o600 });
    for (const value of Object.values(source.evidence)) for (const blob of value.binary ? [] : [value.beforeDigest, value.afterDigest]) {
      if (blob) await writeFile(path.join(target, 'blobs', blob), await readBlob(this.dir, blob), { mode: 0o600 });
    }
  }

  private scopeDir(scope: string): string { return path.join(this.dir, 'reviews', safeId(scope)); }
}

export function validateCoverage(report: Report, source: Source): { accounted: number; pending: string[]; excluded: number } {
  const known = new Set(source.units.map((unit) => unit.id)); const accounted = new Set<string>();
  for (const story of report.stories) for (const group of story.groups) for (const ref of group.refs) accounted.add(ref);
  const excludedRefs = new Set(report.exclusions.flatMap((entry) => entry.refs));
  for (const ref of excludedRefs) accounted.add(ref);
  const pending = [...known].filter((id) => !accounted.has(id));
  return { accounted: [...known].filter((id) => accounted.has(id)).length, pending, excluded: [...known].filter((id) => excludedRefs.has(id)).length };
}

function validateReferences(report: Report, source: Source): void {
  const refs = new Set(source.units.map((unit) => unit.id)); const entityIds = new Set(report.entities.map((entity) => entity.id));
  const storyIds = new Set<string>();
  for (const story of report.stories) {
    if (storyIds.has(story.id)) throw new Error(`Duplicate story ID: ${story.id}`); storyIds.add(story.id);
    for (const group of story.groups) for (const ref of group.refs) if (!refs.has(ref)) throw new Error(`Story ${story.id} references unknown change ${ref}.`);
    for (const decision of story.decisions) for (const ref of decision.refs) if (!refs.has(ref)) throw new Error(`Decision in ${story.id} references unknown change ${ref}.`);
    for (const impact of story.impact) {
      if (!entityIds.has(impact.from) || !entityIds.has(impact.to)) throw new Error(`Impact in ${story.id} references an unknown entity.`);
      for (const ref of impact.refs) if (!refs.has(ref)) throw new Error(`Impact in ${story.id} references unknown change ${ref}.`);
    }
  }
  for (const entity of report.entities) for (const ref of entity.refs) if (!refs.has(ref)) throw new Error(`Entity ${entity.id} references unknown change ${ref}.`);
  for (const exclusion of report.exclusions) for (const ref of exclusion.refs) if (!refs.has(ref)) throw new Error(`Exclusion references unknown change ${ref}.`);
}

function safeId(value: string): string { if (!/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error('Invalid identifier.'); return value; }

async function atomicWrite(filename: string, content: string): Promise<void> {
  await mkdir(path.dirname(filename), { recursive: true }); const temp = `${filename}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, content, { mode: 0o600 }); await rename(temp, filename);
}

async function readBlob(directory: string, blob: string): Promise<string> {
  if (!/^[a-f0-9]{64}$/.test(blob)) throw new Error('Invalid evidence digest.');
  const content = await readFile(path.join(directory, 'blobs', blob), 'utf8');
  if (digest(content) !== blob) throw new Error(`Evidence integrity check failed for ${blob}.`);
  return content;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`).join(',')}}`;
  return JSON.stringify(value);
}
