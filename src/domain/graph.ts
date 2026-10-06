import { documentKey, resourceKey, resolveTarget } from './wiki';
import type {
  DocumentKind,
  LinkKind,
  PublicWikiIndex,
  ResourceKind,
} from './wiki';

export interface GraphNode {
  key: string;
  id: string;
  title: string;
  kind: DocumentKind | ResourceKind;
  url?: string;
}
export interface GraphEdge {
  key: string;
  source: string;
  target: string;
  type: LinkKind | 'reference';
}
export interface WikiGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
export interface Position {
  x: number;
  y: number;
}
export interface GraphLayout {
  positions: Map<string, Position>;
  width: number;
  height: number;
}

export function buildGraph(index: PublicWikiIndex): WikiGraph {
  const nodes: GraphNode[] = [
    ...index.documents.map((doc) => ({
      key: documentKey(doc.id),
      id: doc.id,
      title: doc.title,
      kind: doc.kind,
    })),
    ...index.resources.map((resource) => ({
      key: resourceKey(resource),
      id: resource.id,
      title: resource.title,
      kind: resource.kind,
      url: resource.url,
    })),
  ];
  const keys = new Set(nodes.map((node) => node.key));
  const edges = new Map<string, GraphEdge>();
  const addEdge = (
    source: string,
    target: string | undefined,
    type: GraphEdge['type'],
  ) => {
    if (!target || source === target || !keys.has(source) || !keys.has(target))
      return;
    const key = JSON.stringify([source, target, type]);
    edges.set(key, { key, source, target, type });
  };
  for (const doc of index.documents) {
    for (const link of doc.links)
      addEdge(documentKey(doc.id), resolveTarget(link.target, keys), link.type);
  }
  for (const resource of index.resources) {
    for (const id of resource.documentIds)
      addEdge(resourceKey(resource), documentKey(id), 'reference');
  }
  return { nodes, edges: [...edges.values()] };
}

export function selectGraph(
  graph: WikiGraph,
  scope: 'local' | 'all',
  focus?: string,
): WikiGraph {
  if (scope === 'all') return graph;
  if (!focus || !graph.nodes.some((node) => node.key === focus))
    return { nodes: [], edges: [] };
  const neighbors = new Set([focus]);
  for (const edge of graph.edges) {
    if (edge.source === focus) neighbors.add(edge.target);
    if (edge.target === focus) neighbors.add(edge.source);
  }
  return {
    nodes: graph.nodes.filter((node) => neighbors.has(node.key)),
    edges: graph.edges.filter(
      (edge) => neighbors.has(edge.source) && neighbors.has(edge.target),
    ),
  };
}

// Deterministic, finite layout. No animation loop, timers, physics subscriptions or workers.
// Breadth-first ordering is O(V + E); collision relaxation is capped at 120 nodes / 60 passes.
export function layoutGraph(graph: WikiGraph, focus?: string): GraphLayout {
  const positions = new Map<string, Position>();
  if (!graph.nodes.length) return { positions, width: 360, height: 260 };
  const neighbors = new Map(
    graph.nodes.map((node) => [node.key, new Set<string>()]),
  );
  for (const edge of graph.edges) {
    neighbors.get(edge.source)?.add(edge.target);
    neighbors.get(edge.target)?.add(edge.source);
  }
  const roots = [...graph.nodes].sort(
    (a, b) =>
      Number(b.key === focus) - Number(a.key === focus) ||
      (neighbors.get(b.key)?.size || 0) - (neighbors.get(a.key)?.size || 0) ||
      a.key.localeCompare(b.key),
  );
  const seen = new Set<string>();
  const order: string[] = [];
  for (const root of roots) {
    if (seen.has(root.key)) continue;
    const queue = [root.key];
    seen.add(root.key);
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const key = queue[cursor];
      order.push(key);
      for (const neighbor of neighbors.get(key) || []) {
        if (!seen.has(neighbor)) {
          seen.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
  }
  order.forEach((key, i) => {
    const angle = i * 2.399963229728653;
    const radius = i ? 105 * Math.sqrt(i) : 0;
    positions.set(key, {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    });
  });
  if (graph.nodes.length <= 120) {
    for (let step = 0; step < 60; step++) {
      const cooling = 1 - step / 70;
      for (const edge of graph.edges) {
        const a = positions.get(edge.source)!;
        const b = positions.get(edge.target)!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy) || 1;
        const force = (distance - 180) * 0.014 * cooling;
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;
        if (edge.source !== focus) {
          a.x += fx;
          a.y += fy;
        }
        if (edge.target !== focus) {
          b.x -= fx;
          b.y -= fy;
        }
      }
      for (let i = 0; i < order.length; i++) {
        for (let j = i + 1; j < order.length; j++) {
          const a = positions.get(order[i])!;
          const b = positions.get(order[j])!;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const distance = Math.hypot(dx, dy) || 1;
          if (distance >= 150) continue;
          const force = (150 - distance) * 0.08 * cooling;
          const fx = (dx / distance) * force;
          const fy = (dy / distance) * force;
          if (order[i] !== focus) {
            a.x -= fx;
            a.y -= fy;
          }
          if (order[j] !== focus) {
            b.x += fx;
            b.y += fy;
          }
        }
      }
    }
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const position of positions.values()) {
    minX = Math.min(minX, position.x);
    minY = Math.min(minY, position.y);
    maxX = Math.max(maxX, position.x);
    maxY = Math.max(maxY, position.y);
  }
  const width = Math.max(320, maxX - minX + 220);
  const height = Math.max(240, maxY - minY + 160);
  for (const position of positions.values()) {
    position.x += (width - maxX - minX) / 2;
    position.y += (height - maxY - minY) / 2;
  }
  return { positions, width, height };
}

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}
export function zoomCamera(
  camera: Camera,
  factor: number,
  anchor: Position,
): Camera {
  const zoom = Math.max(0.2, Math.min(6, camera.zoom * factor));
  const ratio = zoom / camera.zoom;
  return {
    zoom,
    x: anchor.x - (anchor.x - camera.x) * ratio,
    y: anchor.y - (anchor.y - camera.y) * ratio,
  };
}
