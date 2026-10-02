import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ReviewStore } from '@visus/core';

const run = promisify(execFile);
const output = process.argv[2];
if (!output) throw new Error('Pass an output directory for the synthetic fixture.');
const root = path.resolve(output);
try { await access(root); throw new Error('Choose a new output directory; this script does not replace existing files.'); } catch (error) { if (error instanceof Error && error.message.startsWith('Choose')) throw error; }
await mkdir(root, { recursive: true });
const env = { ...process.env };
for (const name of ['GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL']) delete env[name];
const git = async (...args) => run('git', args, { cwd: root, env, maxBuffer: 8 * 1024 * 1024 });
await git('init', '--initial-branch=main');
await mkdir(path.join(root, 'src', 'services'), { recursive: true });
await mkdir(path.join(root, 'test', 'services'), { recursive: true });
const positions = [5, 14, 23, 32, 41, 50, 59, 68, 77, 86];
for (let index = 0; index < 100; index++) {
  const name = String(index).padStart(3, '0');
  for (const [folder, suffix] of [['src/services', '.ts'], ['test/services', '.test.ts']]) {
    const lines = Array.from({ length: 100 }, (_, line) => `// synthetic ${folder} module ${name}, line ${String(line + 1).padStart(3, '0')}`);
    await writeFile(path.join(root, folder, `unit-${name}${suffix}`), `${lines.join('\n')}\n`);
  }
}
await git('add', '.');
await git('-c', 'user.name=Fixture Author', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'Create synthetic base');
await git('switch', '-c', 'feature/synthetic-review');
for (let index = 0; index < 100; index++) {
  const name = String(index).padStart(3, '0');
  for (const [folder, suffix] of [['src/services', '.ts'], ['test/services', '.test.ts']]) {
    const file = path.join(root, folder, `unit-${name}${suffix}`);
    const lines = (await readFile(file, 'utf8')).trimEnd().split('\n');
    for (let change = 0; change < positions.length; change++) lines[positions[change] - 1] += ` · revised-${String(change + 1).padStart(2, '0')}`;
    await writeFile(file, `${lines.join('\n')}\n`);
  }
}
const store = new ReviewStore(root);
const prepared = await store.prepare('main');
if (prepared.source.units.length !== 2000) throw new Error(`Expected 2,000 synthetic change units, got ${prepared.source.units.length}.`);
const implementationUnits = prepared.source.units.filter((unit) => unit.newPath?.startsWith('src/'));
const testUnits = prepared.source.units.filter((unit) => unit.newPath?.startsWith('test/'));
const stories = Array.from({ length: 100 }, (_, index) => {
  const implementation = implementationUnits.slice(index * 10, (index + 1) * 10).map((unit) => unit.id);
  const tests = testUnits.slice(index * 10, (index + 1) * 10).map((unit) => unit.id);
  return {
    id: `synthetic-story-${String(index + 1).padStart(3, '0')}`,
    title: `Generated service batch ${String(index + 1).padStart(3, '0')}`,
    summary: 'Synthetic source and test files contain separated edits for large-review exploration.',
    groups: [{ kind: 'implementation', refs: implementation }, { kind: 'tests', refs: tests }]
  };
});
const published = await store.publish({ updateId: 'synthetic-large-fixture-v1', sourceId: prepared.source.id, expectedRevision: null, author: 'Synthetic fixture generator', stories });
if (published.coverage.pending.length) throw new Error('Synthetic fixture report did not account for every change unit.');
process.stdout.write(`Created a synthetic review with ${prepared.source.units.length} units and ${stories.length} stories.\n`);
