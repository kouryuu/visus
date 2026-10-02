import { mkdir, writeFile } from 'node:fs/promises';
import { exportJsonSchema } from '../dist/schema.js';

const target = new URL('../schema/report.schema.json', import.meta.url);
await mkdir(new URL('../schema/', import.meta.url), { recursive: true });
await writeFile(target, `${JSON.stringify(exportJsonSchema(), null, 2)}\n`);
