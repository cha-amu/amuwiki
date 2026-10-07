import { describe, expect, it } from 'vitest';
import {
  embedParentOrigin,
  PARENT_RESOURCES_TIMEOUT_MS,
  resourceKeysFromMessage,
  updateParentResources,
} from '../src/domain/embed';
import { buildGraph, filterGraphResources } from '../src/domain/graph';
import { validateIndex } from '../src/domain/validation';
import fixture from './fixtures/public-wiki.json';

const wiki = 'https://cha-amu.github.io/amuwiki/?embed=graph';
const blog = 'https://cha-amu.github.io/';
describe('embed Escape origin boundary', () => {
  it('uses the configured blog origin even with no referrer', () => {
    expect(embedParentOrigin(wiki, blog)).toBe('https://cha-amu.github.io');
    expect(embedParentOrigin(wiki, 'https://blog.example.com/notes/')).toBe(
      'https://blog.example.com',
    );
  });
  it('does not signal from a normal document or full graph page', () => {
    expect(
      embedParentOrigin(
        'https://cha-amu.github.io/amuwiki/?view=graph',
        blog,
      ),
    ).toBeUndefined();
    expect(
      embedParentOrigin('https://cha-amu.github.io/amuwiki/#one', blog),
    ).toBeUndefined();
  });
  it('does not accept arbitrary parent origins in production', () => {
    expect(
      embedParentOrigin(
        `${wiki}&parentOrigin=https://untrusted.example`,
        blog,
      ),
    ).toBeUndefined();
    expect(
      embedParentOrigin(wiki, blog, 'https://untrusted.example/page'),
    ).toBeUndefined();
    expect(
      embedParentOrigin(`${wiki}&parentOrigin=http://localhost:5178`, blog),
    ).toBeUndefined();
  });
  it('allows a loopback-only parent query or referrer for cross-port QA', () => {
    expect(
      embedParentOrigin(
        'http://127.0.0.1:4174/amuwiki/?embed=graph&parentOrigin=http%3A%2F%2F127.0.0.1%3A5178',
        blog,
      ),
    ).toBe('http://127.0.0.1:5178');
    expect(
      embedParentOrigin(
        'http://localhost:4174/amuwiki/?embed=graph',
        blog,
        'http://127.0.0.1:5178/posts/',
      ),
    ).toBe('http://127.0.0.1:5178');
  });
  it.each([
    '*',
    'null',
    'javascript:alert(1)',
    'https://u:p@cha-amu.github.io',
    'https://cha-amu.github.io/path',
    'https://cha-amu.github.io/?other=1',
  ])('rejects malformed or non-origin parent input: %s', (parent) => {
    expect(
      embedParentOrigin(
        `${wiki}&parentOrigin=${encodeURIComponent(parent)}`,
        blog,
      ),
    ).toBeUndefined();
  });
  it('never expands the loopback allowance to lookalikes or arbitrary external sites', () => {
    expect(
      embedParentOrigin(
        'http://127.0.0.1:4174/amuwiki/?embed=graph&parentOrigin=https://evil.example',
        blog,
      ),
    ).toBeUndefined();
    expect(
      embedParentOrigin(
        'http://localhost.evil.example/amuwiki/?embed=graph&parentOrigin=http://localhost:5178',
        blog,
      ),
    ).toBeUndefined();
  });
});

describe('parent resource allowlist contract', () => {
  const parent = {};
  const origin = 'https://cha-amu.github.io';
  const keys = [
    'post:042e8cb5-2664-4e37-9798-dbe501e23df2',
    'asset:asset:assets/images/a.png',
  ];
  const message = {
    source: parent,
    origin,
    data: { type: 'amuwiki:resources', keys },
  };

  it('accepts exact resource keys, including colons, and an empty replacement', () => {
    expect(resourceKeysFromMessage(message, parent, origin)).toEqual(
      new Set(keys),
    );
    expect(
      resourceKeysFromMessage(
        { ...message, data: { type: 'amuwiki:resources', keys: [] } },
        parent,
        origin,
      ),
    ).toEqual(new Set());
  });
  it('rejects a different source, origin, or unresolved target origin', () => {
    expect(
      resourceKeysFromMessage({ ...message, source: {} }, parent, origin),
    ).toBeUndefined();
    expect(
      resourceKeysFromMessage({ ...message, source: null }, parent, origin),
    ).toBeUndefined();
    expect(
      resourceKeysFromMessage(
        { ...message, origin: 'https://untrusted.example' },
        parent,
        origin,
      ),
    ).toBeUndefined();
    expect(
      resourceKeysFromMessage(message, parent, undefined),
    ).toBeUndefined();
  });
  it.each([
    null,
    undefined,
    'amuwiki:resources',
    [],
    {},
    { type: 'amuwiki:ready', keys },
    { type: 'amuwiki:resources' },
    { type: 'amuwiki:resources', keys: 'post:one' },
    { type: 'amuwiki:resources', keys: {} },
    { type: 'amuwiki:resources', keys: [''] },
    { type: 'amuwiki:resources', keys: ['post:valid', 1] },
    { type: 'amuwiki:resources', keys: [null] },
    { type: 'amuwiki:resources', keys: ['a'.repeat(601)] },
    { type: 'amuwiki:resources', keys: Array(1) },
  ])('ignores the entire malformed message: %#', (data) => {
    expect(
      resourceKeysFromMessage({ ...message, data }, parent, origin),
    ).toBeUndefined();
  });
  it('accepts the length/count boundaries and rejects one key over budget', () => {
    const data = {
      type: 'amuwiki:resources',
      keys: Array.from({ length: 50_000 }, (_, i) => String(i)),
    };
    data.keys[0] = 'a'.repeat(600);
    expect(
      resourceKeysFromMessage({ ...message, data }, parent, origin)?.size,
    ).toBe(50_000);
    data.keys.push('one-too-many');
    expect(
      resourceKeysFromMessage({ ...message, data }, parent, origin),
    ).toBeUndefined();
  });
  it('falls back to documents after the four-second deadline and accepts late replacements', () => {
    expect(PARENT_RESOURCES_TIMEOUT_MS).toBe(4_000);
    const state = updateParentResources(
      { status: 'waiting' },
      { type: 'timeout' },
    );
    expect(state.status).toBe('ready');
    if (state.status !== 'ready')
      throw new Error('Expected document-only fallback');
    const index = validateIndex(fixture);
    const graph = filterGraphResources(buildGraph(index), state.keys);
    expect(graph.nodes.map((node) => node.kind)).not.toContain('post');
    expect(graph.nodes.map((node) => node.kind)).not.toContain('asset');
    expect(graph.nodes).toHaveLength(index.documents.length);
    const received = updateParentResources(state, {
      type: 'received',
      keys: new Set(keys),
    });
    expect(received).toEqual({ status: 'ready', keys: new Set(keys) });
    expect(updateParentResources(received, { type: 'timeout' })).toBe(
      received,
    );
    expect(
      updateParentResources(received, { type: 'received', keys: new Set() }),
    ).toEqual({ status: 'ready', keys: new Set() });
  });
});
