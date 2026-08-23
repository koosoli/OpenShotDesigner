import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Cable, Workflow, X } from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { useDialogFocusTrap } from '../../utils/useDialogFocusTrap';
import { CableElement } from '../../types';
import { CABLE_TYPES } from '../../constants/presets';
import {
  detectFlowCycles,
  deriveSignalFlow,
  FlowEdge,
  FlowLayerEntry,
  FlowNode,
} from '../../domain/cable/signalFlow';

interface SignalFlowNode extends FlowNode {
  kind: 'element' | 'label';
  elementType?: string;
}

interface DisplayEdge extends FlowEdge {
  cableId: string;
}

interface SignalFlowViewProps {
  onClose: () => void;
}

const LABEL_PREFIX = 'label:';

export const SignalFlowView: React.FC<SignalFlowViewProps> = ({ onClose }) => {
  const { activeSetup, theme, selectElement } = useFloorPlan();
  const isLight = theme === 'light';

  const cables = useMemo(
    () => (activeSetup.elements || []).filter((e): e is CableElement => e.type === 'cable'),
    [activeSetup.elements]
  );

  const { nodes, edges } = useMemo(() => {
    const elementById = new Map(
      (activeSetup.elements || []).map((e) => [e.id, e])
    );
    const nodeMap = new Map<string, SignalFlowNode>();

    const resolveEndpoint = (
      elementId: string | undefined,
      label: string
    ): string => {
      if (elementId) {
        const el = elementById.get(elementId);
        if (el) {
          if (!nodeMap.has(el.id)) {
            nodeMap.set(el.id, {
              id: el.id,
              label: el.name || label || el.id,
              kind: 'element',
              elementType: el.type,
            });
          }
          return el.id;
        }
      }
      const key = `${LABEL_PREFIX}${label}`;
      if (!nodeMap.has(key)) {
        nodeMap.set(key, { id: key, label: label || 'Unnamed endpoint', kind: 'label' });
      }
      return key;
    };

    const builtEdges: DisplayEdge[] = [];
    cables.forEach((cable) => {
      if (!cable.fromLabel && !cable.toLabel && !cable.fromElementId && !cable.toElementId) return;
      const fromId = resolveEndpoint(cable.fromElementId, cable.fromLabel);
      const toId = resolveEndpoint(cable.toElementId, cable.toLabel);
      if (fromId === toId) return;
      const info = CABLE_TYPES.find((ct) => ct.type === cable.cableType);
      builtEdges.push({
        id: cable.id,
        cableId: cable.id,
        fromId,
        toId,
        label: info?.shortLabel || cable.cableType,
      });
    });

    return { nodes: Array.from(nodeMap.values()), edges: builtEdges };
  }, [activeSetup.elements, cables]);

  // Nodes that have at least one outgoing edge (candidate signal sources).
  const outgoingNodeIds = useMemo(() => new Set(edges.map((e) => e.fromId)), [edges]);
  const incomingNodeIds = useMemo(() => new Set(edges.map((e) => e.toId)), [edges]);

  // Auto-source heuristic: only outgoing edges. Fall back to any node with an
  // outgoing edge when the graph is fully cyclic.
  const autoSourceIds = useMemo(() => {
    const pure = nodes.filter((n) => outgoingNodeIds.has(n.id) && !incomingNodeIds.has(n.id)).map((n) => n.id);
    if (pure.length > 0) return pure;
    return nodes.filter((n) => outgoingNodeIds.has(n.id)).slice(0, 1).map((n) => n.id);
  }, [nodes, outgoingNodeIds, incomingNodeIds]);

  // Manual override; null = follow auto selection.
  const [manualSourceIds, setManualSourceIds] = useState<Set<string> | null>(null);

  // Reset the manual override when the underlying graph changes shape.
  const nodeSignature = useMemo(() => nodes.map((n) => n.id).join('|'), [nodes]);
  useEffect(() => {
    setManualSourceIds(null);
  }, [nodeSignature]);

  const effectiveSourceIds = useMemo(
    () => (manualSourceIds ? Array.from(manualSourceIds) : autoSourceIds),
    [manualSourceIds, autoSourceIds]
  );

  const flowEntries = useMemo(
    () => deriveSignalFlow(nodes, edges, effectiveSourceIds),
    [nodes, edges, effectiveSourceIds]
  );

  const layers = useMemo(() => {
    const byDepth = new Map<number, FlowLayerEntry[]>();
    flowEntries.forEach((entry) => {
      if (entry.depth < 0) return;
      const list = byDepth.get(entry.depth) ?? [];
      list.push(entry);
      byDepth.set(entry.depth, list);
    });
    return Array.from(byDepth.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([depth, entries]) => ({ depth, entries }));
  }, [flowEntries]);

  const unreachableNodes = useMemo(() => flowEntries.filter((e) => e.depth < 0), [flowEntries]);

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const depthById = useMemo(() => {
    const m = new Map<string, number>();
    flowEntries.forEach((e) => m.set(e.id, e.depth));
    return m;
  }, [flowEntries]);

  const cycles = useMemo(() => detectFlowCycles(edges), [edges]);
  const cycleLabels = useMemo(
    () =>
      cycles.map((cycle) =>
        cycle.map((id) => nodeById.get(id)?.label || id).join(' → ')
      ),
    [cycles, nodeById]
  );

  // Edge chips grouped by the depth of their source node, rendered between columns.
  const edgesBySourceDepth = useMemo(() => {
    const m = new Map<number, DisplayEdge[]>();
    edges.forEach((edge) => {
      const d = depthById.get(edge.fromId) ?? -1;
      const list = m.get(d) ?? [];
      list.push(edge as DisplayEdge);
      m.set(d, list);
    });
    return m;
  }, [edges, depthById]);

  const toggleSource = (nodeId: string) => {
    setManualSourceIds((prev) => {
      const base = new Set(prev ? prev : autoSourceIds);
      if (base.has(nodeId)) base.delete(nodeId);
      else base.add(nodeId);
      return base;
    });
  };

  // The parent only mounts this view while it is open, so the trap is armed
  // unconditionally; it releases focus back to the caller when this unmounts.
  const dialogRef = useDialogFocusTrap(true);
  const panelBg = isLight ? 'bg-white border-slate-300 text-slate-950' : 'bg-slate-900 border-slate-700 text-slate-100';
  const subtleText = isLight ? 'text-slate-600' : 'text-slate-400';
  const cardBorder = isLight ? 'bg-slate-50 border-slate-300' : 'bg-slate-950 border-slate-700';

  const typeBadge = (node: SignalFlowNode): { text: string; className: string } => {
    if (node.kind === 'label') {
      return {
        text: 'Endpoint',
        className: isLight ? 'bg-slate-200 text-slate-700' : 'bg-slate-800 text-slate-400',
      };
    }
    return {
      text: node.elementType || 'Element',
      className: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
    };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="signal-flow-title"
        tabIndex={-1}
        className={`w-full max-w-5xl max-h-[90vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden outline-hidden ${panelBg}`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between gap-2 px-4 py-3 border-b ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-950/60'}`}>
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${isLight ? 'bg-emerald-100 text-emerald-900' : 'bg-emerald-500/15 text-emerald-400'}`}>
              <Workflow className="w-4 h-4" />
            </div>
            <div>
              <h3 id="signal-flow-title" className="text-sm font-black">Signal Flow</h3>
              <p className={`text-[11px] font-semibold ${subtleText}`}>
                {cables.length} cable{cables.length === 1 ? '' : 's'} · {nodes.length} node{nodes.length === 1 ? '' : 's'} · {effectiveSourceIds.length} source{effectiveSourceIds.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            title="Close signal flow view"
            aria-label="Close signal flow view"
            className={`min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg transition-colors ${
              isLight ? 'hover:bg-slate-200 text-slate-600' : 'hover:bg-slate-800 text-slate-400'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {cables.length === 0 ? (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center gap-3 p-10 text-center">
            <Cable className={`w-12 h-12 opacity-40 ${isLight ? 'text-slate-400' : 'text-slate-600'}`} />
            <p className="text-sm font-black">No cables yet</p>
            <p className={`text-xs font-semibold max-w-sm ${subtleText}`}>
              Draw cable runs on the floor plan (with “from” / “to” endpoints) to see the
              signal path from sources through to sinks here.
            </p>
          </div>
        ) : (
          <>
            {/* Source override row */}
            <div className={`flex items-center gap-1.5 flex-wrap px-4 py-2.5 border-b ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
              <span className="text-[10px] font-black uppercase tracking-wider mr-1">Sources</span>
              {nodes.filter((n) => outgoingNodeIds.has(n.id)).map((node) => {
                const checked = manualSourceIds ? manualSourceIds.has(node.id) : autoSourceIds.includes(node.id);
                return (
                  <button
                    key={node.id}
                    onClick={() => toggleSource(node.id)}
                    role="checkbox"
                    aria-checked={checked}
                    title={`${checked ? 'Remove' : 'Add'} “${node.label}” as a flow source`}
                    className={`min-h-[36px] px-2.5 rounded-lg border text-[11px] font-bold flex items-center gap-1.5 transition-colors ${
                      checked
                        ? 'bg-emerald-500 text-white border-emerald-500'
                        : isLight
                          ? 'border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-800'
                          : 'border-slate-700 bg-slate-950 hover:bg-slate-800 text-slate-300'
                    }`}
                  >
                    <span
                      className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center text-[9px] font-black shrink-0 ${
                        checked ? 'bg-white/25 border-white/60' : isLight ? 'border-slate-400' : 'border-slate-500'
                      }`}
                    >
                      {checked ? '✓' : ''}
                    </span>
                    <span className="truncate max-w-[160px]">{node.label}</span>
                  </button>
                );
              })}
              {manualSourceIds && (
                <button
                  onClick={() => setManualSourceIds(null)}
                  title="Reset to automatically detected sources"
                  className={`min-h-[36px] px-2.5 rounded-lg border text-[11px] font-bold transition-colors ${
                    isLight
                      ? 'border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-600'
                      : 'border-slate-700 bg-slate-950 hover:bg-slate-800 text-slate-400'
                  }`}
                >
                  Auto
                </button>
              )}
            </div>

            {/* Cycle warning banner */}
            {cycleLabels.length > 0 && (
              <div className={`mx-4 mt-3 rounded-lg border p-2.5 flex items-start gap-2 text-[11px] font-bold ${
                isLight ? 'bg-amber-50 border-amber-300 text-amber-950' : 'bg-amber-950/30 border-amber-800/60 text-amber-100'
              }`}>
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
                <div className="flex flex-col gap-1">
                  <span>
                    {cycleLabels.length} signal loop{cycleLabels.length === 1 ? '' : 's'} detected —
                    layered order below is approximate for these paths.
                  </span>
                  {cycleLabels.map((label, i) => (
                    <span key={i} className="font-mono font-semibold opacity-90 break-all">
                      ↻ {label}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Layered flow columns */}
            <div className="flex-1 min-h-0 overflow-auto custom-scrollbar p-4">
              <div className="flex items-stretch gap-3 min-w-max">
                {layers.map(({ depth, entries }) => (
                  <React.Fragment key={depth}>
                    <div className="flex flex-col gap-2 min-w-[150px]">
                      <span className={`text-[10px] font-black uppercase tracking-wider ${subtleText}`}>
                        {depth === 0 ? 'Sources' : `Depth ${depth}`}
                      </span>
                      {entries.map((entry) => {
                        const node = nodeById.get(entry.id);
                        if (!node) return null;
                        const badge = typeBadge(node);
                        return (
                          <button
                            key={entry.id}
                            onClick={() => {
                              if (node.kind === 'element') selectElement(node.id);
                            }}
                            title={
                              node.kind === 'element'
                                ? `Select “${node.label}” on the floor plan`
                                : `Label-only endpoint “${node.label}”`
                            }
                            className={`text-left p-2.5 rounded-xl border flex flex-col gap-1 transition-shadow hover:shadow-md ${cardBorder}`}
                          >
                            <span className="text-xs font-black break-words">{node.label}</span>
                            <span className={`self-start px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wide ${badge.className}`}>
                              {badge.text}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {/* Edge chips leaving this column */}
                    {(edgesBySourceDepth.get(depth) || []).length > 0 && (
                      <div className="flex flex-col justify-center gap-1.5 py-6 min-w-[170px] max-w-[220px]">
                        {(edgesBySourceDepth.get(depth) || []).map((edge) => (
                          <span
                            key={edge.id}
                            title={edge.label}
                            className={`px-2 py-1 rounded-full border text-[10px] font-bold truncate ${
                              isLight
                                ? 'border-slate-300 bg-slate-100 text-slate-700'
                                : 'border-slate-700 bg-slate-950 text-slate-300'
                            }`}
                          >
                            {(nodeById.get(edge.fromId)?.label || edge.fromId)}
                            {' → '}
                            {(nodeById.get(edge.toId)?.label || edge.toId)}
                            {edge.label ? ` (${edge.label})` : ''}
                          </span>
                        ))}
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </div>

              {/* Unreachable nodes */}
              {unreachableNodes.length > 0 && (
                <div className={`mt-4 rounded-xl border p-3 flex flex-col gap-2 ${
                  isLight ? 'bg-slate-50 border-slate-300' : 'bg-slate-950/60 border-slate-800'
                }`}>
                  <span className={`text-[10px] font-black uppercase tracking-wider ${subtleText}`}>
                    Not reachable from selected sources ({unreachableNodes.length})
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {unreachableNodes.map((entry) => {
                      const node = nodeById.get(entry.id);
                      if (!node) return null;
                      const badge = typeBadge(node);
                      return (
                        <span key={entry.id} className={`px-2 py-1 rounded-lg border inline-flex items-center gap-1.5 ${cardBorder}`}>
                          <span className="text-[11px] font-bold">{node.label}</span>
                          <span className={`px-1 py-0.5 rounded-full text-[9px] font-black uppercase ${badge.className}`}>
                            {badge.text}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
