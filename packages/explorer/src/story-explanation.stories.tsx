import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ChangeUnit, Report, Story } from '@visus/core';
import { useState } from 'react';
import { StoryExplanation } from '@/components/story-explanation';
import { demoState } from '@/lib/demo';

const story: Story = {
  id: 'first-visit',
  title: 'Make the first review useful, even before stories arrive',
  summary: 'Opening a new review shows a waiting screen instead of an error. When stories are published, the same screen can display them.',
  groups: [{ kind: 'implementation', refs: ['response', 'waiting'] }],
  decisions: [
    { summary: 'Treat an empty review as a normal first visit', rationale: 'A reader should be able to tell that stories are still waiting.', refs: ['waiting'] },
    { summary: 'Keep one loading flow as stories arrive', rationale: 'Both empty and populated reviews give the screen the same response shape.', refs: ['response'] }
  ],
  impact: [{ from: 'request', to: 'screen', level: 'direct', summary: 'The review request gives the first screen enough information to explain what happens next.', refs: ['response', 'waiting'] }]
};
const entities: Report['entities'] = [
  { id: 'request', label: 'Review request', refs: ['response'] },
  { id: 'screen', label: 'First review screen', refs: ['waiting'] }
];
const units = new Map<string, ChangeUnit>([
  ['response', { id: 'response', kind: 'text', newPath: 'src/routes/review.ts', before: { start: 12, end: 18 }, after: { start: 12, end: 25 } }],
  ['waiting', { id: 'waiting', kind: 'text', newPath: 'src/routes/review.ts', before: { start: 21, end: 24 }, after: { start: 28, end: 36 } }]
]);

const meta = {
  title: 'Explorer/Change explanation',
  component: StoryExplanation,
  parameters: { layout: 'centered' },
  args: { story, entities, units, editorAvailable: true, onInspect: () => undefined },
  render: function ExplanationPreview(args) {
    const [inspected, setInspected] = useState('');
    return <div className="detail-column" style={{ width: 'min(740px, 90vw)', position: 'static', maxHeight: 'none' }}>
      <StoryExplanation key={args.story.id} {...args} onInspect={setInspected} />
      {inspected && <p className="muted" role="status">Preview: VS Code would open the referenced diff.</p>}
    </div>;
  }
} satisfies Meta<typeof StoryExplanation>;

export default meta;
type ExplanationStory = StoryObj<typeof meta>;

export const ConnectedChange: ExplanationStory = {};
export const SummaryOnly: ExplanationStory = {
  args: { story: { ...story, decisions: [], impact: [] }, entities: [] }
};
export const InferredConnection: ExplanationStory = {
  args: { story: { ...story, impact: story.impact.map((edge) => ({ ...edge, level: 'inferred' })) } }
};
export const UnavailableCodeReference: ExplanationStory = {
  args: { units: new Map() }
};
export const CheckoutRecoveryReview: ExplanationStory = {
  args: {
    story: demoState.report.stories[0]!,
    entities: demoState.report.entities,
    units: new Map(demoState.source.units.map((unit) => [unit.id, unit]))
  }
};
