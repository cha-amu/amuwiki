import { describe, expect, it } from 'vitest';
import fixture from './fixtures/public-wiki.json';
import {
  buildGraph,
  filterGraphResources,
  layoutGraph,
  selectGraph,
  zoomCamera,
} from '../src/domain/graph';
import { validateIndex } from '../src/domain/validation';
import { documentKey, resourceKey } from '../src/domain/wiki';

const index = validateIndex(fixture);
const graph = buildGraph(index);
const focus = documentKey(index.documents[0].id);

describe('only explicit public relationships become edges', () => {
  it('creates document and resource keys without corrupting reserved characters', () => {
    expect(graph.nodes).toHaveLength(7);
    expect(graph.nodes.map((node) => node.key)).toContain(
      'asset:자료:a/b?x&y',
    );
    expect(graph.nodes.map((node) => node.key)).toContain(
      'doc:읽기/기록?#%한글',
    );
  });
  it('does not connect documents that only share a tag', () => {
    expect(
      graph.edges.some(
        (edge) =>
          edge.source === 'doc:fixture-only-amu-test' ||
          edge.target === 'doc:fixture-only-amu-test',
      ),
    ).toBe(false);
    expect(graph.edges).toHaveLength(6);
  });
  it('deduplicates explicit links and rejects phantom/self edges defensively', () => {
    const value = structuredClone(index);
    value.documents[0].links.push(
      value.documents[0].links[0],
      { target: focus, type: 'related' },
      { target: 'does-not-exist', type: 'uses' },
    );
    expect(buildGraph(value).edges).toEqual(graph.edges);
  });
  it('supports both explicit doc keys and raw document IDs', () => {
    const value = structuredClone(index);
    value.documents[0].links[0].target = index.documents[1].id;
    expect(buildGraph(value).edges).toEqual(graph.edges);
  });
  it('takes only one hop in either direction and includes linked resources', () => {
    const local = selectGraph(graph, 'local', focus);
    expect(new Set(local.nodes.map((node) => node.key))).toEqual(
      new Set([focus, 'doc:프로젝트:a&b', 'doc:질문', 'post:글/한글?#%']),
    );
    expect(local.nodes.map((node) => node.key)).not.toContain('doc:결정');
    expect(local.nodes.map((node) => node.key)).not.toContain(
      'asset:자료:a/b?x&y',
    );
    expect(
      local.edges.every(
        (edge) =>
          local.nodes.some((node) => node.key === edge.source) &&
          local.nodes.some((node) => node.key === edge.target),
      ),
    ).toBe(true);
  });
  it('supports post and asset focus with their document neighbors', () => {
    expect(
      selectGraph(graph, 'local', 'post:글/한글?#%').nodes.map(
        (node) => node.key,
      ),
    ).toEqual([focus, 'post:글/한글?#%']);
    expect(
      selectGraph(graph, 'local', 'asset:자료:a/b?x&y').nodes.map(
        (node) => node.key,
      ),
    ).toEqual(['doc:프로젝트:a&b', 'asset:자료:a/b?x&y']);
  });
  it('returns no placeholder nodes or hidden counts for unknown focus', () => {
    expect(selectGraph(graph, 'local', 'doc:unknown')).toEqual({
      nodes: [],
      edges: [],
    });
    expect(selectGraph(graph, 'local')).toEqual({ nodes: [], edges: [] });
  });
  it('keeps every public node in the all view, including isolated nodes', () => {
    expect(selectGraph(graph, 'all')).toBe(graph);
  });
});

describe('parent resources filter every graph surface before selection', () => {
  it('keeps all resources when the parent contract is absent', () => {
    expect(filterGraphResources(graph)).toBe(graph);
  });
  it('keeps documents and only the allowed resources and their edges', () => {
    const value = structuredClone(index);
    value.documents[0].links.push({
      target: resourceKey(value.resources[1]),
      type: 'uses',
    });
    const original = buildGraph(value);
    const filtered = filterGraphResources(
      original,
      new Set([resourceKey(value.resources[0]), 'post:unknown']),
    );
    expect(filtered.nodes.map((node) => node.key)).toEqual([
      ...index.documents.map((doc) => documentKey(doc.id)),
      resourceKey(index.resources[0]),
    ]);
    const hiddenKey = resourceKey(index.resources[1]);
    expect(filtered.edges).toEqual(
      original.edges.filter(
        (edge) => edge.source !== hiddenKey && edge.target !== hiddenKey,
      ),
    );
    expect(original.nodes).toHaveLength(7);
  });
  it('keeps no resource placeholders or dangling links after an empty replacement', () => {
    const filtered = filterGraphResources(graph, new Set());
    expect(filtered.nodes).toHaveLength(index.documents.length);
    expect(
      filtered.edges.every(
        (edge) =>
          edge.source.startsWith('doc:') && edge.target.startsWith('doc:'),
      ),
    ).toBe(true);
    for (const resource of index.resources) {
      for (const scope of ['all', 'local'] as const) {
        expect(selectGraph(filtered, scope, resourceKey(resource))).toEqual({
          nodes: [],
          edges: [],
        });
      }
    }
  });
});

describe('bounded, deterministic graph layout and camera', () => {
  it('lays out every selected node within finite bounds, deterministically', () => {
    const local = selectGraph(graph, 'local', focus);
    const layout = layoutGraph(local, focus);
    expect(layout).toEqual(layoutGraph(local, focus));
    expect(layout.positions.size).toBe(local.nodes.length);
    for (const point of layout.positions.values()) {
      expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(layout.width);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(layout.height);
    }
  });
  it('handles thousands of nodes without pairwise relaxation or animation', () => {
    const large = {
      nodes: Array.from({ length: 5000 }, (_, i) => ({
        key: `doc:${i}`,
        id: String(i),
        title: `Node ${i}`,
        kind: 'concept' as const,
      })),
      edges: [],
    };
    const layout = layoutGraph(large);
    expect(layout.positions.size).toBe(5000);
    expect(
      Number.isFinite(layout.width) && Number.isFinite(layout.height),
    ).toBe(true);
  });
  it('preserves the zoom anchor and enforces zoom limits', () => {
    const camera = { x: 10, y: 20, zoom: 1 };
    const point = { x: 100, y: 150 };
    const zoomed = zoomCamera(camera, 2, point);
    expect((point.x - zoomed.x) / zoomed.zoom).toBe(
      (point.x - camera.x) / camera.zoom,
    );
    expect((point.y - zoomed.y) / zoomed.zoom).toBe(
      (point.y - camera.y) / camera.zoom,
    );
    expect(zoomCamera(camera, 1000, point).zoom).toBe(6);
    expect(zoomCamera(camera, 0.0001, point).zoom).toBe(0.2);
  });
});
