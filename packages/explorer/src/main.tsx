import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '@/components/motion/button/base';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/motion/tabs';
import { AnimatedBadge, type AnimatedBadgeStatus } from '@/components/motion/animated-badge';
import { CenterMorphModal, CenterMorphModalClose, CenterMorphModalContent } from '@/components/motion/center-morph-modal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/motion/select';
import { StoryExplanation } from '@/components/story-explanation';
import { demoEvidenceText, demoState } from '@/lib/demo';
import { ArrowUpRight, ChevronRight, FileCode2, GitBranch, X } from 'lucide-react';
import type { ChangeUnit, Report, Source, Story } from '@visus/core';
import './style.css';

declare global {
  interface ImportMetaEnv { readonly DEMO_MODE?: string }
  interface ImportMeta { readonly env: ImportMetaEnv }
}

type State = { report: Report | null; source: Source | null; status: string; pending: string[] };
type EvidenceView = 'before' | 'after' | 'compare';
type EvidencePreview = { unit: ChangeUnit; beforeText?: string; afterText?: string; binary: boolean; view: EvidenceView };
type Bridge = { getState: () => Promise<State>; evidence: (sourceId: string, ref: string, side: 'before' | 'after') => Promise<{ unit: ChangeUnit; text?: string; binary: boolean }>; subscribe: (callback: () => void) => () => void; openEvidence?: (sourceId: string, ref: string) => void };
declare global { interface Window { visusBridge?: Bridge; visusSnapshot?: { report: Report; source: Source } } }
const kindLabel: Record<string, string> = { implementation: 'Implementation', tests: 'Tests', config: 'Configuration', docs: 'Docs', refactor: 'Refactor', dependencies: 'Dependencies', generated: 'Generated', other: 'Other', multiple: 'Multiple categories' };
const kindEmoji: Record<string, string> = { implementation: '🛠️', tests: '👨‍🔬', config: '⚙️', docs: '📖', refactor: '🧹', dependencies: '📦', generated: '🤖', other: '🧩', multiple: '🗂️' };
const demoMode = import.meta.env.DEMO_MODE === '1';
const visusIcon = new URL('./assets/visus-icon.svg', import.meta.url).href;

async function getState(): Promise<State> {
  if (demoMode) return demoState;
  if (window.visusBridge) return window.visusBridge.getState();
  if (window.visusSnapshot) {
    const { report, source } = window.visusSnapshot;
    const accounted = new Set([...report.stories.flatMap((story) => story.groups.flatMap((group) => group.refs)), ...report.exclusions.flatMap((entry) => entry.refs)]);
    const pending = source.units.filter((unit) => !accounted.has(unit.id)).map((unit) => unit.id);
    return { report, source, pending, status: pending.length ? 'incomplete' : 'snapshot' };
  }
  const response = await fetch('/api/review');
  if (!response.ok) throw new Error('The local review service could not load this report.');
  return response.json() as Promise<State>;
}

function App(): React.JSX.Element {
  const [data, setData] = useState<State>({ report: null, source: null, status: 'loading', pending: [] });
  const [selected, setSelected] = useState<string | null>(null);
  const [grouping, setGrouping] = useState<'story' | 'category'>('story');
  const [filter, setFilter] = useState('all');
  const [evidence, setEvidence] = useState<EvidencePreview | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [error, setError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const detailRef = useRef<HTMLElement | null>(null);
  const closeEvidence = useCallback((open: boolean) => { if (!open) setEvidence(null); }, []);

  useEffect(() => {
    let alive = true;
    const refresh = (): void => { void getState().then((next) => {
      if (!alive) return;
      setData(next); setError('');
      setSelected((current) => current && next.report?.stories.some((story) => story.id === current) ? current : null);
    }).catch((reason: unknown) => {
      if (!alive) return;
      setData((current) => ({ ...current, status: 'error' }));
      setError(reason instanceof Error ? reason.message : 'Unable to load the review.');
    }); };
    refresh(); const unsubscribe = demoMode ? undefined : window.visusBridge?.subscribe(refresh); const events = demoMode || window.visusBridge ? null : new EventSource('/api/events'); if (events) events.onmessage = refresh; const timer = demoMode ? undefined : window.setInterval(refresh, 10000);
    return () => { alive = false; unsubscribe?.(); events?.close(); if (timer !== undefined) window.clearInterval(timer); };
  }, [retryKey]);

  const report = data.report; const source = data.source;
  const stories = useMemo(() => (report?.stories ?? []).filter((story) => filter === 'all' || story.groups.some((group) => group.kind === filter)), [report, filter]);
  const currentStory = (selected ? stories.find((story) => story.id === selected) : undefined) ?? stories[0];
  const lookup = useMemo(() => new Map(source?.units.map((unit) => [unit.id, unit]) ?? []), [source]);

  useEffect(() => { detailRef.current?.scrollTo({ top: 0 }); }, [currentStory?.id]);

  async function openEvidence(ref: string): Promise<void> {
    if (!report) return;
    if (window.visusBridge?.openEvidence) { window.visusBridge.openEvidence(report.sourceId, ref); return; }
    const unit = source?.units.find((entry) => entry.id === ref);
    if (!unit) { setError('Evidence could not be loaded for this change.'); return; }
    setError(''); setEvidenceLoading(true);
    setEvidence({ unit, binary: unit.kind === 'binary', view: unit.before && unit.after ? 'compare' : unit.before ? 'before' : 'after' });
    try {
      const loadSide = async (side: 'before' | 'after'): Promise<{ text?: string; binary: boolean }> => {
        if (window.visusBridge) {
          const result = await window.visusBridge.evidence(report.sourceId, ref, side);
          return { ...(result.text !== undefined ? { text: result.text } : {}), binary: result.binary };
        }
        if (demoMode) {
          const text = demoEvidenceText[ref]?.[side];
          return { ...(text !== undefined ? { text } : {}), binary: false };
        }
        const response = await fetch(`/api/evidence?source=${encodeURIComponent(report.sourceId)}&ref=${encodeURIComponent(ref)}&side=${side}`);
        if (!response.ok) throw new Error('Evidence could not be loaded for this change.');
        const result = await response.json() as { text?: string; binary: boolean };
        return { ...(result.text !== undefined ? { text: result.text } : {}), binary: result.binary };
      };
      const [before, after] = await Promise.all([
        unit.before ? loadSide('before') : Promise.resolve(undefined),
        unit.after ? loadSide('after') : Promise.resolve(undefined)
      ]);
      setEvidence((current) => current?.unit.id === ref ? { ...current, ...(before?.text !== undefined ? { beforeText: before.text } : {}), ...(after?.text !== undefined ? { afterText: after.text } : {}), binary: Boolean(before?.binary || after?.binary) } : current);
    } catch (reason) {
      setEvidence(null);
      setError(reason instanceof Error ? reason.message : 'Evidence could not be loaded for this change.');
    } finally { setEvidenceLoading(false); }
  }

  function selectStory(id: string): void {
    setSelected(id);
    if (window.matchMedia('(max-width: 680px)').matches) requestAnimationFrame(() => {
      detailRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
      detailRef.current?.focus();
    });
  }

  function changeStoryFilter(next: string): void {
    setFilter(next);
    const matching = (report?.stories ?? []).filter((story) => next === 'all' || story.groups.some((group) => group.kind === next));
    const currentId = currentStory?.id;
    const nextStory = (currentId && matching.some((story) => story.id === currentId) ? currentId : matching[0]?.id) ?? null;
    setSelected(nextStory);
  }
  const allKinds = [...new Set(report?.stories.flatMap((story) => story.groups.map((group) => group.kind)) ?? [])];
  const storyCards = grouping === 'story' ? stories.map((story) => <StoryCard key={story.id} story={story} selected={story.id === currentStory?.id} onSelect={() => selectStory(story.id)} />) : categoryGroups(stories).map(([kind, entries]) => <section className="category-group" data-kind={kind} key={kind}><h2><span aria-hidden="true">{kindEmoji[kind]} </span>{kindLabel[kind] ?? kind}</h2>{entries.map((story) => <StoryCard key={story.id} story={story} selected={story.id === currentStory?.id} onSelect={() => selectStory(story.id)} />)}</section>);

  return <><main className="shell" inert={evidence !== null}>
    <header className="topbar"><div><span className="eyebrow brand"><img className="brand-icon" src={visusIcon} alt="" aria-hidden="true" /> VISUS / CHANGE REVIEW</span><h1>{source?.rootName ?? 'visus'}</h1><p className="subhead">{source ? <><GitBranch size={14} aria-hidden="true" /><span>{source.branch ?? 'Detached HEAD'}</span><span className="comparison">compared with <strong>{source.baseRef}</strong></span></> : 'Agent-authored guide to the changes'}</p></div><div className="status-block"><AnimatedBadge status={reviewBadgeStatus(data.status)} className={`status ${data.status}`} role="status">{statusLabel(data.status)}</AnimatedBadge>{report ? <time className="published" dateTime={report.publishedAt} title={new Date(report.publishedAt).toLocaleString()}>{demoMode ? 'Synthetic sample' : `Published ${relativeTime(report.publishedAt)}`}</time> : <span className="published">No report published</span>}</div></header>
    {error && <div className="notice error" role="alert">{error}</div>}
    {data.status === 'loading' && <div className="empty">Loading the current review…</div>}
    {data.status === 'error' && <div className="empty-card"><h2>Review unavailable</h2><p>Check that the local review service is running, then try again.</p><Button variant="secondary" className="beui-button" onClick={() => setRetryKey((value) => value + 1)}>Try again</Button></div>}
    {!report && data.status !== 'loading' && data.status !== 'error' && <section className="empty-card"><h2>{source ? 'Your change inventory is ready' : 'Start a local review'}</h2><p>{source ? `${source.units.length} captured units are waiting for an agent-authored story.` : 'Start the local review service in a Git worktree to capture changes.'}</p><p>Create a draft with <code>visus prepare --draft .visus/review.json</code>, add your stories, then run <code>visus publish --file .visus/review.json</code>.</p></section>}
    {report && <Tabs value={grouping} variant="segment" className="review-content" onValueChange={(value) => setGrouping(value as 'story' | 'category')}>
      <TabsContent value={grouping} className="review-panel"><div className="layout">
      <section className="main-column" aria-label="Change stories"><div className="list-heading"><h2>Change stories</h2><span className="filter-count" role="status">{stories.length}{filter !== 'all' && ` of ${report.stories.length}`} {stories.length === 1 ? 'story' : 'stories'}</span></div>
        <details className="story-options"><summary><ChevronRight size={16} className="disclosure-chevron" aria-hidden="true" /><span>Filter &amp; group</span>{(filter !== 'all' || grouping !== 'story') && <span className="disclosure-meta">{[filter !== 'all' ? kindLabel[filter] ?? filter : '', grouping !== 'story' ? 'By category' : ''].filter(Boolean).join(' · ')}</span>}</summary><div className="toolbar"><TabsList ariaLabel="Story grouping" className="grouping-tabs" wrapperClassName="grouping-control"><TabsTrigger value="story">By story</TabsTrigger><TabsTrigger value="category">By category</TabsTrigger></TabsList><div className="filter"><span className="filter-label">Category</span><Select value={filter} onValueChange={changeStoryFilter} className="category-select"><SelectTrigger ariaLabel="Filter stories by category"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All categories</SelectItem>{allKinds.map((kind) => <SelectItem key={kind} value={kind}>{kindLabel[kind] ?? kind}</SelectItem>)}</SelectContent></Select></div></div></details>
        <div className="story-list">{storyCards}{stories.length === 0 && <div className="filter-empty"><p>No stories match {kindLabel[filter] ?? filter}. Unexplained changes below are outside this story filter.</p><Button variant="secondary" className="beui-button" onClick={() => changeStoryFilter('all')}>Show all stories</Button></div>}</div>
        {(data.pending.length > 0 || report.exclusions.length > 0) && <details className={`unexplained ${data.pending.length ? 'has-pending' : ''}`}><summary><ChevronRight size={16} className="disclosure-chevron" aria-hidden="true" /><span>{data.pending.length ? `${data.pending.length} ${data.pending.length === 1 ? 'change needs' : 'changes need'} explanation` : `${report.exclusions.length} excluded ${report.exclusions.length === 1 ? 'entry' : 'entries'}`}</span>{data.pending.length > 0 && report.exclusions.length > 0 && <span className="disclosure-meta">{report.exclusions.length} excluded</span>}</summary>{data.pending.length > 0 && <p>These changes need a story or an explicit exclusion.</p>}{data.pending.map((ref) => <button className="unit-row" key={ref} onClick={() => void openEvidence(ref)}><FileCode2 size={16} aria-hidden="true" /><span>{unitName(lookup.get(ref))}</span><ArrowUpRight size={15} aria-hidden="true" /></button>)}{report.exclusions.map((entry) => <p className="exclusion" key={entry.refs.join(',')}><strong>Excluded:</strong> {entry.reason} <span>{entry.refs.join(', ')}</span></p>)}</details>}
      </section>
      <aside className="detail-column" ref={detailRef} tabIndex={-1} aria-label="Change explanation">{currentStory ? <StoryExplanation key={currentStory.id} story={currentStory} entities={report.entities} units={lookup} editorAvailable={Boolean(window.visusBridge?.openEvidence)} onInspect={(ref) => void openEvidence(ref)} /> : <p className="muted">Choose a story to understand the change.</p>}</aside>
    </div></TabsContent></Tabs>}
  </main><CenterMorphModal open={evidence !== null} onOpenChange={closeEvidence}><CenterMorphModalContent ariaLabel={evidence ? `Change evidence: ${unitName(evidence.unit)}` : 'Change evidence'} showCloseButton={false} className="evidence-modal" backdropClassName="evidence-backdrop">
    {evidence && <><div className="modal-head"><div><span className="eyebrow">CHANGE EVIDENCE</span><h2>{unitName(evidence.unit)}</h2><p className="evidence-summary">{evidence.unit.summary}</p></div><div className="modal-actions">{window.visusBridge?.openEvidence && report && <Button variant="outline" className="beui-button open-editor" onClick={() => window.visusBridge?.openEvidence?.(report.sourceId, evidence.unit.id)}>Open snapshot diff in editor</Button>}<CenterMorphModalClose><Button variant="ghost" size="icon" className="close-evidence" aria-label="Close evidence"><X size={18} aria-hidden="true" /></Button></CenterMorphModalClose></div></div>
      <Tabs value={evidence.view} variant="segment" className="evidence-tabs" onValueChange={(view) => setEvidence((current) => current ? { ...current, view: view as EvidenceView } : current)}>
        <TabsList className="evidence-tab-list" ariaLabel="Evidence version">
          {evidence.unit.before && <TabsTrigger value="before">Before</TabsTrigger>}
          {evidence.unit.after && <TabsTrigger value="after">After</TabsTrigger>}
          {evidence.unit.before && evidence.unit.after && <TabsTrigger value="compare">Compare</TabsTrigger>}
        </TabsList>
      <TabsContent value={evidence.view} className="evidence-panel">
      <p className="muted">{evidence.view === 'compare' ? 'Before and after snapshots' : `${evidence.view === 'before' ? 'Before' : 'After'} snapshot`}{evidence.view === 'before' && evidence.unit.before ? ` · lines ${evidence.unit.before.start}–${evidence.unit.before.end}` : ''}{evidence.view === 'after' && evidence.unit.after ? ` · lines ${evidence.unit.after.start}–${evidence.unit.after.end}` : ''}</p>
      {evidenceLoading ? <div className="evidence-loading" role="status"><AnimatedBadge status="loading">Loading captured evidence…</AnimatedBadge></div> : evidence.binary ? <p className="muted">Text preview is unavailable for this binary change.</p> : evidence.view === 'compare' ? <div className="evidence-compare"><section className="before-snapshot"><h3>Before <span>{lineRange(evidence.unit.before)}</span></h3><pre tabIndex={0} aria-label="Before snapshot">{evidence.beforeText ?? 'No before text snapshot is available.'}</pre></section><section className="after-snapshot"><h3>After <span>{lineRange(evidence.unit.after)}</span></h3><pre tabIndex={0} aria-label="After snapshot">{evidence.afterText ?? 'No after text snapshot is available.'}</pre></section></div> : <pre tabIndex={0} aria-label={`${evidence.view === 'before' ? 'Before' : 'After'} snapshot`}>{evidence.view === 'before' ? evidence.beforeText ?? 'No before text snapshot is available.' : evidence.afterText ?? 'No after text snapshot is available.'}</pre>}
      </TabsContent></Tabs></>}
    </CenterMorphModalContent></CenterMorphModal></>;
}

function StoryCard({ story, selected, onSelect }: { story: Story; selected: boolean; onSelect: () => void }): React.JSX.Element {
  const groups = [...new Set(story.groups.map((group) => group.kind))];
  return <article className={`story-card ${selected ? 'selected' : ''}`}><button className="story-select" onClick={onSelect} aria-pressed={selected}><div className="card-title"><h2>{story.title}</h2><ChevronRight size={16} aria-hidden="true" /></div>{groups.length > 0 && <p className="story-category">{groups.map((kind, index) => <React.Fragment key={kind}>{index > 0 && ' · '}<span className="category-kind" data-kind={kind}><span aria-hidden="true">{kindEmoji[kind]} </span>{kindLabel[kind] ?? kind}</span></React.Fragment>)}</p>}</button></article>;
}

function categoryGroups(stories: Story[]): Array<[string, Story[]]> { const groups = new Map<string, Story[]>(); for (const story of stories) { const kinds = [...new Set(story.groups.map((group) => group.kind))]; const category = kinds.length > 1 ? 'multiple' : kinds[0] ?? 'other'; const entries = groups.get(category) ?? []; entries.push(story); groups.set(category, entries); } return [...groups.entries()]; }
function reviewBadgeStatus(status: string): AnimatedBadgeStatus { return ({ fresh: 'success', stale: 'danger', incomplete: 'warning', error: 'danger', loading: 'loading', demo: 'info' } as Record<string, AnimatedBadgeStatus>)[status] ?? 'neutral'; }
function lineRange(range?: { start: number; end: number }): string { return range ? `Lines ${range.start}–${range.end}` : ''; }
function unitName(unit?: ChangeUnit): string { return unit?.newPath ?? unit?.oldPath ?? 'Change details'; }
function statusLabel(status: string): string { return ({ fresh: 'Fresh · fully covered', stale: 'Source has changed', incomplete: 'Incomplete coverage', missing: 'Waiting for stories', loading: 'Loading', error: 'Review unavailable', snapshot: 'Portable snapshot · freshness not checked', demo: 'Demo preview' } as Record<string, string>)[status] ?? status; }
function relativeTime(value: string): string { const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000); const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [['year', 31_536_000], ['month', 2_592_000], ['week', 604_800], ['day', 86_400], ['hour', 3_600], ['minute', 60]]; const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto', style: 'short' }); for (const [unit, size] of units) if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit); return formatter.format(seconds, 'second'); }

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
