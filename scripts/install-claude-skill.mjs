#!/usr/bin/env node
import { constants } from 'node:fs';
import { copyFile, mkdir, stat } from 'node:fs/promises';
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

const source = fileURLToPath(new URL('../integrations/claude/change-story/SKILL.md', import.meta.url));
const target = path.join(root, '.claude', 'skills', 'change-story', 'SKILL.md');
await mkdir(path.dirname(target), { recursive: true });
try {
  await copyFile(source, target, constants.COPYFILE_EXCL);
  process.stdout.write('Installed the change-story skill for Claude Code.\n');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  process.stdout.write('Existing change-story skill preserved.\n');
}
