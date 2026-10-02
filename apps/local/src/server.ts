import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ReviewStore } from '@visus/core';

const explorerDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../packages/explorer/dist');

export async function startServer(store: ReviewStore, port: number, exportDir?: string): Promise<void> {
  const clients = new Set<ServerResponse>();
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
      if (url.pathname === '/api/events') { response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' }); response.write('event: ready\ndata: {}\n\n'); clients.add(response); request.on('close', () => clients.delete(response)); return; }
      if (url.pathname === '/api/review') {
        if (exportDir) {
          const [reportText, sourceText] = await Promise.all([readFile(path.join(exportDir, 'report.json'), 'utf8'), readFile(path.join(exportDir, 'source.json'), 'utf8')]);
          const report = JSON.parse(reportText); const source = JSON.parse(sourceText);
          const covered = new Set([...(report.stories as Array<{ groups: Array<{ refs: string[] }> }>).flatMap((story) => story.groups.flatMap((group) => group.refs)), ...(report.exclusions as Array<{ refs: string[] }>).flatMap((entry) => entry.refs)]);
          const pending = (source.units as Array<{ id: string }>).filter((unit) => !covered.has(unit.id)).map((unit) => unit.id);
          response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify({ report, source, status: pending.length ? 'incomplete' : 'snapshot', pending })); return;
        }
        const check = await store.check(); const source = check.report ? await store.readSourceIndex(check.report.sourceId) : await latestSource(store);
        const body = JSON.stringify({ report: check.report, source, status: check.status, pending: check.pending });
        response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(body); return;
      }
      if (url.pathname === '/api/evidence') {
        const source = url.searchParams.get('source'); const ref = url.searchParams.get('ref'); const side = url.searchParams.get('side');
        if (!source || !ref || (side !== 'before' && side !== 'after')) { response.writeHead(400).end('Invalid evidence request'); return; }
        const result = exportDir ? await exportEvidence(exportDir, source, ref, side) : await store.evidence(source, ref, side); response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(result)); return;
      }
      if (url.pathname.startsWith('/api/')) { response.writeHead(404).end('Not found'); return; }
      const file = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
      const target = path.resolve(explorerDir, file);
      if (!target.startsWith(`${explorerDir}${path.sep}`) && target !== path.join(explorerDir, 'index.html')) { response.writeHead(400).end('Invalid path'); return; }
      const info = await stat(target); if (!info.isFile()) { response.writeHead(404).end('Not found'); return; }
      const content = await readFile(target); response.writeHead(200, { 'Content-Type': mime(target), 'Content-Length': content.length }); response.end(content);
    } catch { response.writeHead(404).end('Not found'); }
  });
  const timer = setInterval(() => { for (const client of clients) client.write('data: {"refresh":true}\n\n'); }, 5000);
  server.on('close', () => clearInterval(timer));
  server.listen(port, '127.0.0.1', () => console.error(JSON.stringify({ event: 'visus.server_started', address: `http://127.0.0.1:${port}` })));
}

async function latestSource(store: ReviewStore) { const report = await store.latestForRoot(); return report ? store.readSourceIndex(report.sourceId) : store.currentSource(); }
async function exportEvidence(directory: string, sourceId: string, ref: string, side: 'before' | 'after') {
  const source = JSON.parse(await readFile(path.join(directory, 'source.json'), 'utf8')) as { id: string; evidence: Record<string, { beforeDigest?: string; afterDigest?: string; binary: boolean }>; units: Array<{ id: string; kind: string; oldPath?: string; newPath?: string }> };
  if (source.id !== sourceId) throw new Error('Evidence source does not match the exported snapshot.');
  const unit = source.units.find((entry) => entry.id === ref); if (!unit) throw new Error(`Unknown change unit ${ref}.`);
  const evidence = source.evidence[ref]; if (!evidence) throw new Error(`Evidence is unavailable for ${ref}.`);
  const digest = evidence.binary ? undefined : evidence[`${side}Digest` as 'beforeDigest' | 'afterDigest'];
  if (digest && !/^[a-f0-9]{64}$/.test(digest)) throw new Error('Invalid evidence digest.');
  const text = digest ? await readFile(path.join(directory, 'blobs', digest), 'utf8') : undefined;
  if (digest && createHash('sha256').update(text ?? '').digest('hex') !== digest) throw new Error('Exported evidence failed its integrity check.');
  return { ...(text !== undefined ? { text } : {}), binary: evidence.binary, unit };
}
function mime(filename: string): string { if (filename.endsWith('.js')) return 'text/javascript'; if (filename.endsWith('.css')) return 'text/css'; if (filename.endsWith('.svg')) return 'image/svg+xml'; if (filename.endsWith('.html')) return 'text/html; charset=utf-8'; return 'application/octet-stream'; }
