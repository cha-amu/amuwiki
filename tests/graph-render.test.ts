import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Graph } from '../src/components/Graph';
import { buildGraph } from '../src/domain/graph';
import { documentUrl } from '../src/domain/navigation';
import { validateIndex } from '../src/domain/validation';
import fixture from './fixtures/public-wiki.json';

vi.mock('../src/config', () => ({
  config: {
    wikiUrl: 'http://127.0.0.1:5178/wiki/',
    blogUrl: 'http://127.0.0.1:5178/',
  },
}));

const index = validateIndex(fixture);
const graph = buildGraph(index);
describe('embedded graph link contract (server render, no browser)', () => {
  it('renders every unfocused all-scope node with a top-level canonical destination', () => {
    const html = renderToStaticMarkup(
      createElement(Graph, { graph, scope: 'all', embed: true }),
    );
    const anchors = [...html.matchAll(/<a\b[^>]*>/gu)].map(
      ([anchor]) => anchor,
    );
    expect(anchors).toHaveLength(
      index.documents.length + index.resources.length,
    );
    for (const anchor of anchors) expect(anchor).toContain('target="_top"');
    for (const doc of index.documents) {
      expect(
        anchors.some((anchor) =>
          anchor.includes(
            `href="${documentUrl(doc.id, 'http://127.0.0.1:5178/wiki/')}"`,
          ),
        ),
      ).toBe(true);
    }
    for (const resource of index.resources) {
      expect(
        anchors.some((anchor) => anchor.includes(`href="${resource.url}"`)),
      ).toBe(true);
    }
    expect(html).not.toContain('/amuwiki/#');
    expect(html).not.toContain('<header');
  });
  it('resolves relative resource URLs against the blog without remapping them to wiki documents', () => {
    const value = structuredClone(index);
    value.resources[0].url = '/posts/canonical/';
    value.resources[1].url = '/assets/canonical.png';
    const html = renderToStaticMarkup(
      createElement(Graph, {
        graph: buildGraph(validateIndex(value)),
        scope: 'all',
        embed: true,
      }),
    );
    expect(html).toContain('href="http://127.0.0.1:5178/posts/canonical/"');
    expect(html).toContain(
      'href="http://127.0.0.1:5178/assets/canonical.png"',
    );
  });
  it('renders no public nodes or fallback content for an unknown local focus', () => {
    const html = renderToStaticMarkup(
      createElement(Graph, {
        graph,
        scope: 'local',
        focus: 'doc:missing',
        embed: true,
        compact: true,
      }),
    );
    expect(html).toContain('이 항목을 찾을 수 없어요.');
    expect(html).not.toContain('data-node-key');
    expect(html).not.toContain(index.documents[0].title);
  });
});
