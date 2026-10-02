import { z } from 'zod';

export const ChangeKindSchema = z.enum(['implementation', 'tests', 'config', 'docs', 'refactor', 'dependencies', 'generated', 'other']);
export const LocationSchema = z.object({ start: z.number().int().positive(), end: z.number().int().positive() });
export const ChangeUnitSchema = z.object({
  id: z.string().min(1), kind: z.enum(['text', 'binary', 'rename', 'mode', 'file']),
  oldPath: z.string().optional(), newPath: z.string().optional(), oldMode: z.string().optional(), newMode: z.string().optional(),
  before: LocationSchema.optional(), after: LocationSchema.optional(), summary: z.string().optional(),
  beforeDigest: z.string().optional(), afterDigest: z.string().optional()
});
export const EntitySchema = z.object({ id: z.string().min(1), label: z.string().min(1), refs: z.array(z.string()).default([]) });
export const GroupSchema = z.object({ kind: ChangeKindSchema, refs: z.array(z.string()).min(1) });
export const DecisionSchema = z.object({ summary: z.string(), rationale: z.string().optional(), inspect: z.string().optional(), refs: z.array(z.string()).default([]) });
export const ImpactSchema = z.object({ from: z.string(), to: z.string(), level: z.enum(['direct', 'inferred']), summary: z.string(), refs: z.array(z.string()).default([]) });
export const StorySchema = z.object({ id: z.string().min(1), title: z.string().min(1), summary: z.string().min(1), groups: z.array(GroupSchema).min(1), decisions: z.array(DecisionSchema).default([]), impact: z.array(ImpactSchema).default([]) });
export const ExclusionSchema = z.object({ refs: z.array(z.string()).min(1), reason: z.string().min(1) });
export const SourceSchema = z.object({
  id: z.string(), scope: z.string(), rootName: z.string(), branch: z.string().nullable(), baseRef: z.string(), baseCommit: z.string(), headCommit: z.string(), mergeBase: z.string(),
  capturedAt: z.string().datetime(), fingerprint: z.string(), units: z.array(ChangeUnitSchema),
  evidence: z.record(z.string(), z.object({ before: z.string().optional(), after: z.string().optional(), beforeDigest: z.string().optional(), afterDigest: z.string().optional(), binary: z.boolean().default(false) }))
});
export const ReportSchema = z.object({
  schemaVersion: z.literal(1), revision: z.string(), parent: z.string().nullable(), scope: z.string(), sourceId: z.string(), publishedAt: z.string().datetime(),
  author: z.object({ kind: z.literal('agent'), name: z.string().min(1) }), entities: z.array(EntitySchema).default([]), stories: z.array(StorySchema), exclusions: z.array(ExclusionSchema).default([])
});
export const PublishUpdateSchema = z.object({ updateId: z.string().min(1), sourceId: z.string(), expectedRevision: z.string().nullable(), author: z.string().default('agent'), entities: z.array(EntitySchema).optional(), stories: z.array(StorySchema).default([]), removeStories: z.array(z.string()).default([]), removeEntities: z.array(z.string()).default([]), exclusions: z.array(ExclusionSchema).optional() });

export type ChangeUnit = z.infer<typeof ChangeUnitSchema>;
export type Source = z.infer<typeof SourceSchema>;
export type Entity = z.infer<typeof EntitySchema>;
export type Story = z.infer<typeof StorySchema>;
export type Report = z.infer<typeof ReportSchema>;
export type PublishUpdate = z.infer<typeof PublishUpdateSchema>;

export function exportJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(ReportSchema, { target: 'draft-2020-12' }) as Record<string, unknown>;
}

export function exportUpdateJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(PublishUpdateSchema, { target: 'draft-2020-12', io: 'input' }) as Record<string, unknown>;
}
