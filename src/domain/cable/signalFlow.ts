/**
 * Signal flow graph derivation (plan §21).
 *
 * Pure graph helpers over lightweight FlowNode/FlowEdge structures. Nodes are
 * typically elements (camera, switcher, amp…); edges are signal connections.
 * Cycles are tolerated everywhere — a visited set guards the BFS, and cycle
 * detection is best-effort simple DFS.
 */

export interface FlowNode {
  id: string;
  label: string;
}

export interface FlowEdge {
  id: string;
  fromId: string;
  toId: string;
  label?: string;
}

export interface FlowLayerEntry {
  id: string;
  depth: number;
  label: string;
}

/**
 * BFS layering from `sourceIds` (depth 0). Unreachable nodes are included at
 * depth -1 and sorted after all reachable nodes. Cycles never loop forever.
 */
export const deriveSignalFlow = (
  nodes: FlowNode[],
  edges: FlowEdge[],
  sourceIds: string[],
): Array<FlowLayerEntry> => {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const list = adjacency.get(edge.fromId) ?? [];
    list.push(edge.toId);
    adjacency.set(edge.fromId, list);
  }

  const depth = new Map<string, number>();
  const queue: string[] = [];
  for (const sourceId of sourceIds) {
    if (nodeById.has(sourceId) && !depth.has(sourceId)) {
      depth.set(sourceId, 0);
      queue.push(sourceId);
    }
  }

  for (let head = 0; head < queue.length; head++) {
    const current = queue[head];
    const currentDepth = depth.get(current)!;
    for (const next of adjacency.get(current) ?? []) {
      if (!nodeById.has(next) || depth.has(next)) continue;
      depth.set(next, currentDepth + 1);
      queue.push(next);
    }
  }

  const reachable: Array<{ entry: FlowLayerEntry; index: number }> = [];
  const unreachable: FlowLayerEntry[] = [];
  nodes.forEach((node, index) => {
    const d = depth.get(node.id);
    if (d === undefined) {
      unreachable.push({ id: node.id, depth: -1, label: node.label });
    } else {
      reachable.push({ entry: { id: node.id, depth: d, label: node.label }, index });
    }
  });

  return [
    ...reachable
      .sort((a, b) => a.entry.depth - b.entry.depth || a.index - b.index)
      .map((r) => r.entry),
    ...unreachable,
  ];
};

/**
 * Detect cycles in the flow graph via DFS with a recursion stack. Returns one
 * entry per distinct back-edge found, as the node-id sequence of the cycle.
 * Simple detection — overlapping cycles may be reported more than once.
 */
export const detectFlowCycles = (edges: FlowEdge[]): string[][] => {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const list = adjacency.get(edge.fromId) ?? [];
    list.push(edge.toId);
    adjacency.set(edge.fromId, list);
  }

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  const stack: string[] = [];
  const cycles: string[][] = [];

  const visit = (node: string): void => {
    color.set(node, GRAY);
    stack.push(node);
    for (const next of adjacency.get(node) ?? []) {
      const state = color.get(next) ?? WHITE;
      if (state === WHITE) {
        visit(next);
      } else if (state === GRAY) {
        const start = stack.indexOf(next);
        cycles.push([...stack.slice(start)]);
      }
    }
    stack.pop();
    color.set(node, BLACK);
  };

  for (const fromId of adjacency.keys()) {
    if ((color.get(fromId) ?? WHITE) === WHITE) visit(fromId);
  }

  return cycles;
};
