import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { ChangeUnit, Report, Source, Story } from '@diff-vis/core';
import './style.css';

type State = { report: Report | null; source: Source | null; status: string; pending: string[] };
type Bridge = { getState: () => Promise<State>; evidence: (sourceId: string, ref: string, side: 'before' | 'after') => Promise<{ unit: ChangeUnit; text?: string; binary: boolean }>; subscribe: (callback: () => void) => () => void; openEvidence?: (sourceId: string, ref: string) => void };
declare global { interface Window { diffVisBridge?: Bridge; diffVisSnapshot?: { report: Report; source: Source } } }
const kindLabel: Record<string, string> = { implementation: 'Implementation', tests: 'Tests', config: 'Configuration', docs: 'Docs', refactor: 'Refactor', dependencies: 'Dependencies', generated: 'Generated', other: 'Other' };

async function getState(): Promise<State> {
  if (window.diffVisBridge) return window.diffVisBridge.getState();
  if (window.diffVisSnapshot) {
    const { report, source } = window.diffVisSnapshot;
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
  const [evidence, setEvidence] = useState<{ unit: ChangeUnit; text?: string; side: string } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    const refresh = (): void => { void getState().then((next) => { if (!alive) return; setData(next); setError(''); setSelected((current) => current && next.report?.stories.some((story) => story.id === current) ? current : next.report?.stories[0]?.id ?? null); }).catch((reason: unknown) => { if (alive) setError(reason instanceof Error ? reason.message : 'Unable to load the review.'); }); };
    refresh(); const unsubscribe = window.diffVisBridge?.subscribe(refresh); const events = window.diffVisBridge ? null : new EventSource('/api/events'); if (events) events.onmessage = refresh; const timer = window.setInterval(refresh, 10000);
    return () => { alive = false; unsubscribe?.(); events?.close(); window.clearInterval(timer); };
  }, []);

  const report = data.report; const source = data.source;
  const stories = useMemo(() => (report?.stories ?? []).filter((story) => filter === 'all' || story.groups.some((group) => group.kind === filter)), [report, filter]);
  const currentStory = stories.find((story) => story.id === selected) ?? stories[0];
  const lookup = useMemo(() => new Map(source?.units.map((unit) => [unit.id, unit]) ?? []), [source]);

  async function openEvidence(ref: string, side: 'before' | 'after'): Promise<void> {
    if (!report) return;
    let value: { unit: ChangeUnit; text?: string; binary: boolean };
    if (window.diffVisBridge) value = await window.diffVisBridge.evidence(report.sourceId, ref, side);
    else { const response = await fetch(`/api/evidence?source=${encodeURIComponent(report.sourceId)}&ref=${encodeURIComponent(ref)}&side=${side}`); if (!response.ok) { setError('Evidence could not be loaded for this change.'); return; } value = await response.json() as typeof value; }
    setEvidence({ unit: value.unit, ...(value.text !== undefined ? { text: value.text } : {}), side });
  }

  const allKinds = [...new Set(source?.units.map((unit) => categoryOf(unit.newPath ?? unit.oldPath ?? '')) ?? [])];
  const storyCards = grouping === 'story' ? stories.map((story) => <StoryCard key={story.id} story={story} units={lookup} selected={story.id === currentStory?.id} onSelect={() => setSelected(story.id)} onEvidence={openEvidence} />) : categoryGroups(stories).map(([kind, entries]) => <section className="category-group" key={kind}><h2>{kindLabel[kind] ?? kind}</h2>{entries.map((story) => <StoryCard key={story.id} story={story} units={lookup} selected={story.id === currentStory?.id} onSelect={() => setSelected(story.id)} onEvidence={openEvidence} />)}</section>);

  return <main className="shell">
    <header className="topbar"><div><span className="eyebrow">CHANGE REVIEW</span><h1>{source?.rootName ?? 'diff-vis'}</h1><p className="subhead">{source ? `${source.branch ?? 'Detached HEAD'} · compared with ${source.baseRef}` : 'Agent-authored guide to the changes'}</p></div><div className="status-block"><span className={`status ${data.status}`}>{statusLabel(data.status)}</span>{report ? <time className="published" dateTime={report.publishedAt} title={new Date(report.publishedAt).toLocaleString()}>Published {relativeTime(report.publishedAt)}</time> : <span className="published">No report published</span>}{source && <span className="scope">{source.units.length} change units</span>}</div></header>
    {error && <div className="notice error" role="alert">{error}</div>}
    {data.status === 'loading' && <div className="empty">Loading the current review…</div>}
    {!report && data.status !== 'loading' && <section className="empty-card"><h2>Your change inventory is ready</h2><p>{source ? `${source.units.length} captured units are waiting for an agent-authored story.` : 'Start the local review service in a Git worktree to capture changes.'}</p><p>Run <code>diff-vis prepare</code>, publish stories with the local MCP tools, then refresh this view.</p></section>}
    {report && <div className="layout">
      <section className="main-column"><div className="toolbar"><div className="segmented" aria-label="Story grouping"><button className={grouping === 'story' ? 'active' : ''} onClick={() => setGrouping('story')}>By story</button><button className={grouping === 'category' ? 'active' : ''} onClick={() => setGrouping('category')}>By category</button></div><label className="filter">Category <select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All changes</option>{[...new Set([...allKinds, ...report.stories.flatMap((story) => story.groups.map((group) => group.kind))])].map((kind) => <option key={kind} value={kind}>{kindLabel[kind] ?? kind}</option>)}</select></label></div>
        <div className="story-list">{storyCards}{stories.length === 0 && <p className="muted">No stories match this category.</p>}</div>
        {(data.pending.length > 0 || report.exclusions.length > 0) && <section className="unexplained"><h2>Unexplained changes</h2><p>{data.pending.length} units need a story or an explicit exclusion.</p>{data.pending.map((ref) => <button className="unit-row" key={ref} onClick={() => void openEvidence(ref, 'after')}>{ref} <span>{unitName(lookup.get(ref))}</span></button>)}{report.exclusions.map((entry) => <p className="exclusion" key={entry.refs.join(',')}><strong>Excluded:</strong> {entry.reason} <span>{entry.refs.join(', ')}</span></p>)}</section>}
      </section>
      <aside className="detail-column">{currentStory ? <><div className="detail-heading"><span className="eyebrow">STORY DETAILS</span><h2>{currentStory.title}</h2></div><p className="story-summary">{currentStory.summary}</p><section className="detail-section"><h3>Decisions</h3>{currentStory.decisions.length ? currentStory.decisions.map((item, index) => <article className="decision" key={`${item.summary}-${index}`}><strong>{item.summary}</strong>{item.rationale && <p>{item.rationale}</p>}{item.inspect && <p className="inspect"><span>Inspect</span>{item.inspect}</p>}</article>) : <p className="muted">No decision notes were added.</p>}</section><section className="detail-section"><h3>Change evidence</h3>{currentStory.groups.flatMap((group) => group.refs.map((ref) => ({ group, ref }))).map(({ group, ref }) => <EvidenceRow key={`${group.kind}:${ref}`} kind={group.kind} unit={lookup.get(ref)} onEvidence={openEvidence} />)}</section><section className="detail-section"><h3>Impact map</h3><ImpactMap story={currentStory} entities={report.entities} /></section></> : <p className="muted">Choose a story to see its detail.</p>}</aside>
    </div>}
    {evidence && <div className="modal-backdrop" role="presentation" onClick={() => setEvidence(null)}><section className="evidence-modal" role="dialog" aria-modal="true" aria-label="Captured evidence" onClick={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">{evidence.side.toUpperCase()} SNAPSHOT</span><h2>{evidence.unit.newPath ?? evidence.unit.oldPath ?? evidence.unit.id}</h2></div><div className="modal-actions">{window.diffVisBridge?.openEvidence && report && <button className="open-editor" onClick={() => window.diffVisBridge?.openEvidence?.(report.sourceId, evidence.unit.id)}>Open snapshot diff in editor</button>}<button className="icon-button" onClick={() => setEvidence(null)} aria-label="Close evidence">×</button></div></div><p className="muted">{evidence.unit.kind}{evidence.unit.before ? ` · lines ${evidence.unit.before.start}–${evidence.unit.before.end}` : ''}{evidence.unit.after ? ` · lines ${evidence.unit.after.start}–${evidence.unit.after.end}` : ''}</p><pre>{evidence.text ?? 'No text preview is available for this binary or missing endpoint.'}</pre></section></div>}
    <footer>Story explanations reflect the publishing agent’s account. Freshness and coverage do not verify behavior.</footer>
  </main>;
}

function StoryCard({ story, units, selected, onSelect, onEvidence }: { story: Story; units: Map<string, ChangeUnit>; selected: boolean; onSelect: () => void; onEvidence: (ref: string, side: 'before' | 'after') => Promise<void> }): React.JSX.Element {
  const groups = [...new Set(story.groups.map((group) => group.kind))];
  return <article className={`story-card ${selected ? 'selected' : ''}`}><button className="story-select" onClick={onSelect} aria-expanded={selected}><div className="card-title"><h2>{story.title}</h2><span className="chevron">{selected ? '−' : '+'}</span></div><p>{story.summary}</p><div className="badges">{groups.map((kind) => <span className={`badge ${kind}`} key={kind}><span aria-hidden="true">{kindGlyph(kind)}</span>{kindLabel[kind] ?? kind}</span>)}</div><div className="indicators">{story.decisions.length > 0 && <span>{story.decisions.length} decision{story.decisions.length === 1 ? '' : 's'}</span>}{story.impact.length > 0 && <span>{story.impact.length} impact links</span>}</div></button>{selected && <div className="card-evidence">{story.groups.map((group) => <div key={group.kind} className="group-line"><strong>{kindLabel[group.kind] ?? group.kind}</strong>{group.refs.map((ref) => <button key={ref} onClick={() => void onEvidence(ref, 'after')}>{ref} · {unitName(units.get(ref))}</button>)}</div>)}</div>}</article>;
}

function EvidenceRow({ kind, unit, onEvidence }: { kind: string; unit: ChangeUnit | undefined; onEvidence: (ref: string, side: 'before' | 'after') => Promise<void> }): React.JSX.Element {
  if (!unit) return <p className="error-text">Referenced evidence is unavailable.</p>;
  return <div className="evidence-row"><span className={`badge ${kind}`}>{kindGlyph(kind)} {kindLabel[kind] ?? kind}</span><span className="path-label">{unitName(unit)}</span><button onClick={() => void onEvidence(unit.id, unit.after ? 'after' : 'before')}>Open</button></div>;
}

function ImpactMap({ story, entities }: { story: Story; entities: Report['entities'] }): React.JSX.Element {
  const labels = new Map(entities.map((entity) => [entity.id, entity.label]));
  return <><svg className="impact-map" viewBox="0 0 360 126" role="img" aria-label="Impact links for this story"><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" /></marker></defs>{story.impact.slice(0, 5).map((edge, index) => { const y = 22 + index * 22; const inferred = edge.level === 'inferred'; return <g key={`${edge.from}-${edge.to}-${index}`}><line x1="108" y1={y} x2="244" y2={y} className={inferred ? 'inferred-edge' : 'direct-edge'} markerEnd="url(#arrow)"/><text x="10" y={y + 4}>{fit(labels.get(edge.from) ?? edge.from)}</text><text x="250" y={y + 4}>{fit(labels.get(edge.to) ?? edge.to)}</text><text x="171" y={y - 4} className="edge-label">{inferred ? 'inferred' : 'direct'}</text></g>; })}</svg>{story.impact.length ? <ul className="impact-list">{story.impact.map((edge, index) => <li key={`${edge.from}-${edge.to}-${index}`}><span className={edge.level}>{edge.level}</span>{edge.summary}</li>)}</ul> : <p className="muted">No impact links were added.</p>}</>;
}

function categoryGroups(stories: Story[]): Array<[string, Story[]]> { const groups = new Map<string, Story[]>(); for (const story of stories) for (const group of story.groups) { const entries = groups.get(group.kind) ?? []; if (!entries.some((entry) => entry.id === story.id)) entries.push(story); groups.set(group.kind, entries); } return [...groups.entries()]; }
function categoryOf(filename: string): string { if (/\.(test|spec)\.[^./]+$|__tests__/.test(filename)) return 'tests'; if (/\.(md|rst|txt)$/.test(filename)) return 'docs'; if (/lock|\.ya?ml$|\.toml$|\.json$|\.ini$/.test(filename)) return 'config'; return 'implementation'; }
function unitName(unit?: ChangeUnit): string { return unit?.newPath ?? unit?.oldPath ?? 'Change details'; }
function kindGlyph(kind: string): string { return ({ implementation: '◆', tests: '✓', config: '⚙', docs: '¶', refactor: '↻', dependencies: '⇄', generated: '▦', other: '•' } as Record<string, string>)[kind] ?? '•'; }
function statusLabel(status: string): string { return ({ fresh: 'Fresh · fully covered', stale: 'Source has changed', incomplete: 'Incomplete coverage', missing: 'Waiting for stories', loading: 'Loading', snapshot: 'Portable snapshot · freshness not checked' } as Record<string, string>)[status] ?? status; }
function fit(value: string): string { return value.length > 18 ? `${value.slice(0, 16)}…` : value; }
function relativeTime(value: string): string { const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000); const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [['year', 31_536_000], ['month', 2_592_000], ['week', 604_800], ['day', 86_400], ['hour', 3_600], ['minute', 60]]; const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto', style: 'short' }); for (const [unit, size] of units) if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit); return formatter.format(seconds, 'second'); }

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
