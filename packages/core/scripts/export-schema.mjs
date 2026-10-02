import { mkdir, writeFile } from 'node:fs/promises';
import { exportJsonSchema, exportUpdateJsonSchema } from '../dist/schema.js';

const target = new URL('../schema/report.schema.json', import.meta.url);
await mkdir(new URL('../schema/', import.meta.url), { recursive: true });
await writeFile(target, `${JSON.stringify(exportJsonSchema(), null, 2)}\n`);
await writeFile(new URL('../schema/update.schema.json', import.meta.url), `${JSON.stringify(exportUpdateJsonSchema(), null, 2)}\n`);
