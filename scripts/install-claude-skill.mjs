#!/usr/bin/env node
import { cp, mkdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const usage = 'Usage: npm run install:claude-skill -- [--root <project> | --global]';
if (args.length === 1 && args[0] === '--help') {
  process.stdout.write(`${usage}\n`);
  process.exit(0);
}

let root;
if (args.length === 0) root = process.cwd();
else if (args.length === 1 && args[0] === '--global') root = os.homedir();
else if (args.length === 2 && args[0] === '--root') root = path.resolve(args[1]);
else throw new Error(usage);

if (!(await stat(root)).isDirectory()) throw new Error(`Not a directory: ${root}`);

const source = fileURLToPath(new URL('../integrations/claude/', import.meta.url));
const target = path.join(root, '.claude', 'skills');
await mkdir(target, { recursive: true });
for (const name of ['visus-change-story', 'visus-pr', 'visus-on-demand', 'visus-hook']) {
  await cp(path.join(source, name), path.join(target, name), { recursive: true, force: false });
}
process.stdout.write('Installed the visus skill family for Claude Code. Existing files were preserved.\n');
