import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import { PublishUpdateSchema } from '@diff-vis/core';
import type { ReviewStore } from '@diff-vis/core';

const result = (value: Record<string, unknown>) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }], structuredContent: value });

export async function startMcp(store: ReviewStore): Promise<void> {
  await store.initialize();
  serveStdio(() => {
    const server = new McpServer({ name: 'diff-vis', version: '0.1.0' });
    server.registerTool('prepare_review', {
      description: 'Capture the current local comparison and return a page of compact change-unit IDs for story publication.',
      inputSchema: z.object({ base: z.string().optional(), offset: z.number().int().nonnegative().default(0), limit: z.number().int().min(1).max(500).default(100) })
    }, async ({ base, offset, limit }) => {
      const prepared = await store.prepare(base); const units = prepared.source.units.slice(offset, offset + limit);
      return result({ sourceId: prepared.source.id, scope: prepared.source.scope, expectedRevision: prepared.expectedRevision, affectedStories: prepared.affectedStories, totalUnits: prepared.source.units.length, offset, hasMore: offset + units.length < prepared.source.units.length, units });
    });
    server.registerTool('publish_update', {
      description: 'Publish story updates against a prepared source and expected report revision.', inputSchema: z.object({ update: PublishUpdateSchema })
    }, async ({ update }) => {
      const published = await store.publish(update);
      return result({ revision: published.report.revision, publishedAt: published.report.publishedAt, coverage: published.coverage, duplicate: published.duplicate });
    });
    server.registerTool('check_review', { description: 'Check current report freshness and change accounting.', inputSchema: z.object({ scope: z.string().optional() }) }, async ({ scope }) => {
      const check = await store.check(scope); return result({ status: check.status, revision: check.report?.revision ?? null, sourceId: check.report?.sourceId ?? null, pending: check.pending });
    });
    server.registerTool('read_latest', { description: 'Read the compact current report index for a review scope.', inputSchema: z.object({ scope: z.string() }) }, async ({ scope }) => {
      const check = await store.check(scope); const report = check.report;
      return result(report ? { revision: report.revision, sourceId: report.sourceId, publishedAt: report.publishedAt, status: check.status, pending: check.pending, stories: report.stories.map(({ id, title, summary, groups }) => ({ id, title, summary, groups })) } : { report: null, status: check.status });
    });
    server.registerTool('read_story', { description: 'Read one story and its referenced entity labels from the selected revision.', inputSchema: z.object({ scope: z.string(), revision: z.string(), storyId: z.string() }) }, async ({ scope, revision, storyId }) => {
      const report = await store.readRevision(scope, revision); const story = report.stories.find((entry) => entry.id === storyId); if (!story) throw new Error(`Unknown story: ${storyId}`);
      const refs = new Set(story.impact.flatMap((edge) => [edge.from, edge.to]));
      return result({ revision, story, entities: report.entities.filter((entity) => refs.has(entity.id)) });
    });
    server.registerTool('read_evidence', { description: 'Read a bounded line range from one immutable source snapshot. Defaults to the referenced changed lines with brief context.', inputSchema: z.object({ sourceId: z.string(), ref: z.string(), side: z.enum(['before', 'after']), startLine: z.number().int().positive().optional(), endLine: z.number().int().positive().optional() }) }, async ({ sourceId, ref, side, startLine, endLine }) => {
      if ((startLine === undefined) !== (endLine === undefined)) throw new Error('Provide both startLine and endLine.');
      if (startLine !== undefined && endLine !== undefined && (endLine < startLine || endLine - startLine >= 500)) throw new Error('Evidence ranges must be ordered and no larger than 500 lines.');
      const evidence = await store.evidence(sourceId, ref, side);
      if (evidence.text === undefined) return result({ ...evidence, startLine: null });
      const range = side === 'before' ? evidence.unit.before : evidence.unit.after;
      const start = startLine ?? Math.max(1, (range?.start ?? 1) - 20); const end = endLine ?? Math.min(evidence.text.split('\n').length, (range?.end ?? 1) + 20);
      const excerpt = evidence.text.split('\n').slice(start - 1, end).join('\n');
      const truncated = excerpt.length > 200_000; const text = truncated ? excerpt.slice(0, 200_000) : excerpt;
      return result({ unit: evidence.unit, text, binary: evidence.binary, startLine: start, endLine: end, truncated });
    });
    server.registerTool('list_history', { description: 'List immutable report revisions newest first.', inputSchema: z.object({ scope: z.string(), offset: z.number().int().nonnegative().default(0), limit: z.number().int().min(1).max(100).default(20) }) }, async ({ scope, offset, limit }) => {
      const history = await store.history(scope); const items = history.slice(offset, offset + limit);
      return result({ items, offset, hasMore: offset + items.length < history.length });
    });
    server.registerTool('read_revision', { description: 'Read a historical revision pinned to its original source.', inputSchema: z.object({ scope: z.string(), revision: z.string() }) }, async ({ scope, revision }) => result({ report: await store.readRevision(scope, revision) }));
    return server;
  });
}
