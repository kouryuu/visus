import { ArrowRight, ArrowUpRight, Box, ChevronRight, FileCode2 } from 'lucide-react';
import type { ChangeUnit, Report, Story } from '@diff-vis/core';
import { Button } from '@/components/motion/button/base';

export function StoryExplanation({ story, entities, units, onInspect, editorAvailable }: {
  story: Story;
  entities: Report['entities'];
  units: ReadonlyMap<string, ChangeUnit>;
  onInspect: (ref: string) => void;
  editorAvailable: boolean;
}) {
  const refs = new Set(story.groups.flatMap((group) => group.refs));
  const endpoints = new Set(story.impact.flatMap((edge) => [edge.from, edge.to]));
  const areas = entities.filter((entity) => endpoints.has(entity.id) || entity.refs.some((ref) => refs.has(ref)));
  const labels = new Map(entities.map((entity) => [entity.id, entity.label]));
  const files = new Map<string, ChangeUnit>();
  const missingRefs: string[] = [];
  for (const ref of refs) {
    const unit = units.get(ref);
    if (!unit) { missingRefs.push(ref); continue; }
    const filename = unit.newPath ?? unit.oldPath ?? unit.id;
    if (!files.has(filename)) files.set(filename, unit);
  }

  return <div className="story-explanation">
    <header className="explanation-heading">
      <span className="eyebrow">WHAT CHANGED</span>
      <h2>{story.title}</h2>
      <p className="change-outcome">{story.summary}</p>
    </header>

    {(areas.length > 0 || story.impact.length > 0) && <details className="explanation-disclosure">
      <summary><ChevronRight size={16} className="disclosure-chevron" aria-hidden="true" /><span>What it affects</span><span className="disclosure-meta">{areas.length > 0 ? `${areas.length} ${areas.length === 1 ? 'area' : 'areas'}` : `${story.impact.length} ${story.impact.length === 1 ? 'connection' : 'connections'}`}</span></summary>
      <div className="disclosure-content">
      {areas.length > 0 && <div className="area-chips" role="group" aria-label="Affected areas">{areas.map((area) => <span className="area-chip" key={area.id}><Box size={14} aria-hidden="true" />{area.label}</span>)}</div>}
      {story.impact.length > 0 && <div className="connection-list">{story.impact.map((edge, index) => <article className={`change-connection ${edge.level}`} key={`${edge.from}-${edge.to}-${index}`}>
        <div className="connection-nodes">
          <div className="connection-node"><span className="node-dot" /><strong>{labels.get(edge.from) ?? edge.from}</strong></div>
          <ArrowRight className="connection-arrow" size={22} aria-label="affects" />
          <div className="connection-node destination"><span className="node-dot" /><strong>{labels.get(edge.to) ?? edge.to}</strong></div>
        </div>
        <p>{edge.summary}</p>
        <span className="connection-certainty">{edge.level === 'inferred' ? 'Inferred relationship' : 'Direct relationship'} · author reported</span>
      </article>)}</div>}
      </div>
    </details>}

    {story.decisions.length > 0 && <details className="explanation-disclosure">
      <summary><ChevronRight size={16} className="disclosure-chevron" aria-hidden="true" /><span>Why these choices</span><span className="disclosure-meta">{story.decisions.length} {story.decisions.length === 1 ? 'choice' : 'choices'}</span></summary>
      <div className="choice-list disclosure-content">{story.decisions.map((decision, index) => <article className="change-choice" key={`${story.id}-${index}`}>
        <div className="choice-marker" aria-hidden="true">{index + 1}</div>
        <div><h3>{decision.summary}</h3>{decision.rationale && <p><span className="rationale-label">Why</span>{decision.rationale}</p>}</div>
      </article>)}</div>
    </details>}

    {(files.size > 0 || missingRefs.length > 0 || story.decisions.some((decision) => decision.inspect)) && <details className="explanation-disclosure code-references">
      <summary><ChevronRight size={16} className="disclosure-chevron" aria-hidden="true" /><span>Code references</span><span className="disclosure-meta">{files.size} {files.size === 1 ? 'file' : 'files'}{missingRefs.length > 0 && <span className="error-text"> · {missingRefs.length} unavailable</span>}</span></summary>
      <div className="code-reference-list disclosure-content">{[...files].map(([filename, unit]) => <div className="code-reference" key={filename}>
        <FileCode2 size={15} aria-hidden="true" /><span>{filename}</span>
        <Button variant="ghost" size="sm" className="beui-button" aria-label={`${editorAvailable ? 'Open diff in VS Code' : 'View code'}: ${filename}`} onClick={() => onInspect(unit.id)}>{editorAvailable ? 'Open diff' : 'View code'}<ArrowUpRight size={13} aria-hidden="true" /></Button>
      </div>)}
      {story.decisions.filter((decision) => decision.inspect).map((decision, index) => <p className="code-inspect-note" key={index}><strong>{decision.summary}</strong><span>{decision.inspect}</span></p>)}
      {missingRefs.length > 0 && <p className="error-text">{missingRefs.length} referenced {missingRefs.length === 1 ? 'change is' : 'changes are'} unavailable.</p>}</div>
    </details>}
  </div>;
}
