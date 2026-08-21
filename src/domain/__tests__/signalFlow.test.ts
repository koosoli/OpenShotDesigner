import { describe, expect, it } from 'vitest';

import { detectFlowCycles, deriveSignalFlow } from '../cable/signalFlow';
import type { FlowEdge, FlowNode } from '../cable/signalFlow';

const node = (id: string): FlowNode => ({ id, label: id.toUpperCase() });

describe('deriveSignalFlow', () => {
  const nodes: FlowNode[] = [
    node('camera'),
    node('switcher'),
    node('monitor'),
    node('stream'),
    node('orphan'),
  ];
  const edges: FlowEdge[] = [
    { id: 'e1', fromId: 'camera', toId: 'switcher' },
    { id: 'e2', fromId: 'switcher', toId: 'monitor' },
    { id: 'e3', fromId: 'switcher', toId: 'stream' },
  ];

  it('layers nodes by BFS depth from the sources', () => {
    const flow = deriveSignalFlow(nodes, edges, ['camera']);
    expect(flow).toEqual([
      { id: 'camera', depth: 0, label: 'CAMERA' },
      { id: 'switcher', depth: 1, label: 'SWITCHER' },
      { id: 'monitor', depth: 2, label: 'MONITOR' },
      { id: 'stream', depth: 2, label: 'STREAM' },
      { id: 'orphan', depth: -1, label: 'ORPHAN' },
    ]);
  });

  it('supports multiple sources at depth 0 and preserves original order within a layer', () => {
    const flow = deriveSignalFlow(nodes, edges, ['camera', 'orphan']);
    expect(flow.filter((f) => f.depth === 0).map((f) => f.id)).toEqual(['camera', 'orphan']);
    expect(flow.every((f) => f.depth >= 0)).toBe(true);
  });

  it('includes unreachable nodes at depth -1 sorted after reachable ones', () => {
    const flow = deriveSignalFlow(
      [node('a'), node('b'), node('island1'), node('island2')],
      [{ id: 'e', fromId: 'a', toId: 'b' }],
      ['a'],
    );
    expect(flow.map((f) => [f.id, f.depth])).toEqual([
      ['a', 0],
      ['b', 1],
      ['island1', -1],
      ['island2', -1],
    ]);
  });

  it('tolerates cycles without looping forever', () => {
    const cyclicEdges: FlowEdge[] = [
      { id: 'c1', fromId: 'camera', toId: 'switcher' },
      { id: 'c2', fromId: 'switcher', toId: 'monitor' },
      { id: 'c3', fromId: 'monitor', toId: 'switcher' },
    ];
    const flow = deriveSignalFlow(nodes.slice(0, 3), cyclicEdges, ['camera']);
    expect(flow.map((f) => [f.id, f.depth])).toEqual([
      ['camera', 0],
      ['switcher', 1],
      ['monitor', 2],
    ]);
  });

  it('handles empty graphs and unknown sources gracefully', () => {
    expect(deriveSignalFlow([], [], [])).toEqual([]);
    expect(deriveSignalFlow([node('x')], [], ['ghost'])).toEqual([
      { id: 'x', depth: -1, label: 'X' },
    ]);
  });
});

describe('detectFlowCycles', () => {
  it('finds a simple cycle', () => {
    const edges: FlowEdge[] = [
      { id: 'e1', fromId: 'a', toId: 'b' },
      { id: 'e2', fromId: 'b', toId: 'c' },
      { id: 'e3', fromId: 'c', toId: 'a' },
    ];
    const cycles = detectFlowCycles(edges);
    expect(cycles).toHaveLength(1);
    expect([...cycles[0]].sort()).toEqual(['a', 'b', 'c']);
  });

  it('returns no cycles for a DAG', () => {
    const edges: FlowEdge[] = [
      { id: 'e1', fromId: 'a', toId: 'b' },
      { id: 'e2', fromId: 'a', toId: 'c' },
      { id: 'e3', fromId: 'b', toId: 'd' },
      { id: 'e4', fromId: 'c', toId: 'd' },
    ];
    expect(detectFlowCycles(edges)).toEqual([]);
  });

  it('detects a self-loop as a cycle', () => {
    const cycles = detectFlowCycles([{ id: 's', fromId: 'x', toId: 'x' }]);
    expect(cycles).toHaveLength(1);
    expect(cycles[0]).toEqual(['x']);
  });

  it('tolerates multiple independent cycles', () => {
    const edges: FlowEdge[] = [
      { id: 'e1', fromId: 'a', toId: 'b' },
      { id: 'e2', fromId: 'b', toId: 'a' },
      { id: 'e3', fromId: 'c', toId: 'd' },
      { id: 'e4', fromId: 'd', toId: 'c' },
    ];
    const cycles = detectFlowCycles(edges);
    expect(cycles.length).toBeGreaterThanOrEqual(2);
  });

  it('handles an empty edge list', () => {
    expect(detectFlowCycles([])).toEqual([]);
  });
});
