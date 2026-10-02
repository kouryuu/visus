import { Graph, layout, type EdgeLabel, type GraphLabel, type NodeLabel } from '@dagrejs/dagre';
import { ArrowRight, ArrowUpRight, ChevronRight, FileCode2 } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import type { ChangeUnit, Report, Story } from '@visus/core';
import { Button } from '@/components/motion/button/base';

export function ImpactDiagram({ impact, entities, units, onInspect, editorAvailable }: {
  impact: Story['impact'];
  entities: Report['entities'];
  units: ReadonlyMap<string, ChangeUnit>;
  onInspect: (ref: string) => void;
  editorAvailable: boolean;
}) {
  const id = useId();
  const [selected, setSelected] = useState(0);
  const labels = useMemo(() => new Map(entities.map((entity) => [entity.id, entity.label])), [entities]);
  const graph = useMemo(() => createLayout(impact, labels), [impact, labels]);
  const activeIndex = selected < impact.length ? selected : 0;
  const active = impact[activeIndex]!;
  const refs = [...new Set(active.refs)];
  const levels = [...new Set(impact.map((edge) => edge.level))];
  const connectionName = (edge: Story['impact'][number]) => `${labels.get(edge.from) ?? edge.from} → ${labels.get(edge.to) ?? edge.to}`;

  return <div className="impact-diagram">
    <div className="impact-map" tabIndex={0} role="region" aria-label="Area connections. Scroll to explore the diagram.">
      <svg width={graph.graph().width} height={graph.graph().height} viewBox={`0 0 ${graph.graph().width} ${graph.graph().height}`} role="group" aria-label="Reported connections between affected areas">
        <defs>{(['direct', 'inferred'] as const).map((level) => <marker key={level} id={`${id}-${level}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill={level === 'direct' ? '#92c9ff' : '#c2a9e9'} /></marker>)}</defs>
        {impact.map((edge, index) => {
          const routed = graph.edge(edge.from, edge.to, String(index))!;
          const path = `M${routed.points!.map((point) => `${point.x},${point.y}`).join('L')}`;
          return <g key={index} className={`impact-edge ${edge.level} ${index === activeIndex ? 'selected' : ''}`} role="button" tabIndex={0} aria-label={`Connection ${index + 1}: ${connectionName(edge)}. ${edge.level === 'direct' ? 'Direct' : 'Inferred'}.`} aria-pressed={index === activeIndex} aria-controls={`${id}-detail`} onClick={() => setSelected(index)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(index); } }}>
            <title>{connectionName(edge)}</title>
            <path className="impact-edge-hit" d={path} />
            <path className="impact-edge-line" d={path} markerEnd={`url(#${id}-${edge.level})`} strokeDasharray={edge.level === 'inferred' ? '5 4' : undefined} />
            <circle className="impact-edge-number" cx={routed.x} cy={routed.y} r="11" />
            <text x={routed.x} y={routed.y} textAnchor="middle" dominantBaseline="central">{index + 1}</text>
          </g>;
        })}
        {graph.nodes().map((nodeId) => {
          const node = graph.node(nodeId)!;
          return <g key={nodeId} className={`impact-node ${nodeId === active.from || nodeId === active.to ? 'related' : ''}`}>
            <title>{node.label}</title>
            <rect x={node.x! - node.width / 2} y={node.y! - node.height / 2} width={node.width} height={node.height} rx="8" />
            <foreignObject x={node.x! - node.width / 2} y={node.y! - node.height / 2} width={node.width} height={node.height}><div className="impact-node-label"><span title={node.label}>{node.label}</span></div></foreignObject>
          </g>;
        })}
      </svg>
    </div>
    <div className="impact-legend"><span>Select a connection</span><div>{levels.map((level) => <span className="impact-key" key={level}><i className={level} aria-hidden="true" />{level === 'direct' ? 'Direct' : 'Inferred'}</span>)}</div></div>
    <div className="impact-connections" role="group" aria-label="Choose a connection">{impact.map((edge, index) => <button key={index} className={`impact-connection ${index === activeIndex ? 'selected' : ''}`} aria-pressed={index === activeIndex} aria-controls={`${id}-detail`} onClick={() => setSelected(index)}>
      <span className="impact-connection-number" aria-hidden="true">{index + 1}</span><span className="impact-connection-label">{labels.get(edge.from) ?? edge.from}<ArrowRight size={13} aria-hidden="true" />{labels.get(edge.to) ?? edge.to}</span>
    </button>)}</div>
    <section className="impact-detail" id={`${id}-detail`} aria-live="polite" aria-atomic="true">
      <span className="connection-certainty">{active.level === 'inferred' ? 'Inferred relationship' : 'Direct relationship'} · author reported</span>
      <p>{active.summary}</p>
      {refs.length > 0 && <details className="impact-code"><summary><ChevronRight size={14} className="disclosure-chevron" aria-hidden="true" />{refs.length} code {refs.length === 1 ? 'reference' : 'references'}</summary><div className="impact-references">{refs.map((ref) => {
        const unit = units.get(ref);
        const filename = unit?.newPath ?? unit?.oldPath ?? ref;
        return <Button key={ref} variant="ghost" size="sm" className="beui-button impact-reference" disabled={!unit} aria-label={`${unit ? editorAvailable ? 'Open diff' : 'View code' : 'Unavailable reference'}: ${filename}`} onClick={() => onInspect(ref)}><FileCode2 size={13} aria-hidden="true" /><span>{filename}</span><ArrowUpRight size={12} aria-hidden="true" /></Button>;
      })}</div></details>}
    </section>
  </div>;
}

function createLayout(impact: Story['impact'], labels: ReadonlyMap<string, string>) {
  const graph = new Graph<GraphLabel, NodeLabel, EdgeLabel>({ multigraph: true });
  graph.setGraph({ rankdir: 'TB', nodesep: 24, ranksep: 30, edgesep: 12, marginx: 14, marginy: 14 });
  for (const nodeId of new Set(impact.flatMap((edge) => [edge.from, edge.to]))) {
    graph.setNode(nodeId, { label: labels.get(nodeId) ?? nodeId, width: 156, height: 52 });
  }
  impact.forEach((edge, index) => graph.setEdge(edge.from, edge.to, { width: 22, height: 22, labelpos: 'c' }, String(index)));
  layout(graph);
  return graph;
}
