import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Button } from '@/components/motion/button/base';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/motion/tabs';
import { AnimatedBadge } from '@/components/motion/animated-badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/motion/select';
import { CenterMorphModal, CenterMorphModalContent, CenterMorphModalTrigger } from '@/components/motion/center-morph-modal';

const meta = {
  title: 'beUI/Review controls',
  parameters: { layout: 'centered' }
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Buttons: Story = {
  render: () => <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
    <Button className="beui-button">Open evidence</Button>
    <Button variant="secondary" className="beui-button">Try again</Button>
    <Button variant="outline" className="beui-button">Open snapshot diff</Button>
  </div>
};

export const EvidenceVersions: Story = {
  render: function EvidenceVersionsStory() {
    const [view, setView] = useState('compare');
    return <div className="evidence-modal" style={{ width: 'min(700px, 90vw)' }}>
      <span className="eyebrow">CHANGE EVIDENCE</span>
      <h2 style={{ margin: '10px 0', fontSize: 16 }}>src/routes/review.ts</h2>
      <Tabs value={view} onValueChange={setView} variant="segment" className="evidence-tabs">
        <TabsList className="evidence-tab-list" ariaLabel="Evidence version">
          <TabsTrigger value="before">Before</TabsTrigger>
          <TabsTrigger value="after">After</TabsTrigger>
          <TabsTrigger value="compare">Compare</TabsTrigger>
        </TabsList>
        <TabsContent value="before" className="evidence-panel"><pre tabIndex={0}>return '&lt;!doctype html&gt;';</pre></TabsContent>
        <TabsContent value="after" className="evidence-panel"><pre tabIndex={0}>return Response.json({`{ status: 'missing' }`});</pre></TabsContent>
        <TabsContent value="compare" className="evidence-panel"><div className="evidence-compare"><section className="before-snapshot"><h3>Before</h3><pre tabIndex={0}>return '&lt;!doctype html&gt;';</pre></section><section className="after-snapshot"><h3>After</h3><pre tabIndex={0}>return Response.json({`{ status: 'missing' }`});</pre></section></div></TabsContent>
      </Tabs>
    </div>;
  }
};

export const ReviewStatus: Story = {
  render: () => <div className="flex flex-wrap gap-3">
    <AnimatedBadge status="success">Fresh · fully covered</AnimatedBadge>
    <AnimatedBadge status="warning">Incomplete coverage</AnimatedBadge>
    <AnimatedBadge status="danger">Source has changed</AnimatedBadge>
    <AnimatedBadge status="loading">Loading review</AnimatedBadge>
  </div>
};

export const CategoryFilter: Story = {
  render: function CategoryFilterStory() {
    const [value, setValue] = useState('all');
    return <Select value={value} onValueChange={setValue} className="category-select">
      <SelectTrigger ariaLabel="Filter stories by category"><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="all">All categories</SelectItem><SelectItem value="implementation">Implementation</SelectItem><SelectItem value="tests">Tests</SelectItem><SelectItem value="docs">Docs</SelectItem></SelectContent>
    </Select>;
  }
};

export const EvidenceDialog: Story = {
  render: () => <CenterMorphModal>
    <CenterMorphModalTrigger><Button>Open evidence</Button></CenterMorphModalTrigger>
    <CenterMorphModalContent ariaLabel="Change evidence: src/example.ts" closeButtonLabel="Close evidence" className="evidence-modal" backdropClassName="evidence-backdrop">
      <div className="modal-head"><div><span className="eyebrow">CHANGE EVIDENCE</span><h2>src/example.ts</h2><p className="evidence-summary">Return a useful review response</p></div></div>
      <div className="evidence-panel"><pre tabIndex={0}>return Response.json({`{ status: 'missing' }`});</pre></div>
    </CenterMorphModalContent>
  </CenterMorphModal>
};
