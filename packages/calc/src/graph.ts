export type NodeId = string;

export class DirtyGraph {
  private readonly dependents = new Map<NodeId, Set<NodeId>>();
  private readonly deps = new Map<NodeId, Set<NodeId>>();

  link(from: NodeId, to: NodeId): void {
    if (!this.dependents.has(from)) this.dependents.set(from, new Set());
    this.dependents.get(from)!.add(to);
    if (!this.deps.has(to)) this.deps.set(to, new Set());
    this.deps.get(to)!.add(from);
  }

  /** Nodes that must recompute when `origin` changes, including origin. */
  dirtyFrom(origin: NodeId): Set<NodeId> {
    const dirty = new Set<NodeId>();
    const stack = [origin];
    while (stack.length) {
      const n = stack.pop()!;
      if (dirty.has(n)) continue;
      dirty.add(n);
      for (const d of this.dependents.get(n) ?? []) stack.push(d);
    }
    return dirty;
  }

  dependsOn(node: NodeId): Set<NodeId> {
    return new Set(this.deps.get(node) ?? []);
  }
}

export function buildProjectGraph(itemCodes: string[], lineCounts: number[]): DirtyGraph {
  const g = new DirtyGraph();
  itemCodes.forEach((code, i) => {
    const analysis = `analysis:${code}`;
    const item = `item:${code}`;
    const sub = `sub:${code}`;
    const adj = `adj:${code}`;
    const n = lineCounts[i] ?? 0;
    for (let k = 0; k < n; k++) {
      g.link(`line:${code}:${k}`, analysis);
    }
    g.link(analysis, item);
    g.link(item, sub);
    g.link(item, adj);
    g.link(item, "totals");
  });
  return g;
}
