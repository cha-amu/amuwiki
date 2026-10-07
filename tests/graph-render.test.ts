import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Graph } from '../src/components/Graph';
import { buildGraph } from '../src/domain/graph';
import { graphMessages } from '../src/domain/i18n';
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
  it('hides the item picker and keeps compact labels on one line with full accessible titles', () => {
    const html = renderToStaticMarkup(
      createElement(Graph, { graph, scope: 'all', compact: true }),
    );
    expect(html).not.toContain('<select');
    expect(html).not.toContain('dy="1.25em"');
    // The server render uses the default 500px canvas, where whole names fit.
    // Narrow frames shorten them; the 198px browser test covers that case.
    expect(html).toContain(
      `<tspan x="0" dy="0">${index.documents[0].title}</tspan>`,
    );
    expect(html).toContain(`aria-label="${index.documents[0].title} · 개념"`);
    expect(html).toContain(
      `<title>${index.documents[0].title} · 개념</title>`,
    );
  });
  it('translates visible controls, accessible names, help and all kind labels', () => {
    const html = renderToStaticMarkup(
      createElement(Graph, { graph, scope: 'all', lang: 'en' }),
    );
    for (const phrase of [
      'Connection map',
      'Map controls',
      'Zoom out map',
      'Zoom out (−)',
      'Zoom in map',
      'Zoom in (+)',
      'Reset map position',
      'Reset position (0)',
      'Map zoom',
      'Select a map item',
      'Find an item',
      graphMessages.en.help,
    ])
      expect(html).toContain(phrase);
    for (const node of graph.nodes)
      expect(html).toContain(` · ${graphMessages.en.kindLabels[node.kind]}`);
    const empty = renderToStaticMarkup(
      createElement(Graph, {
        graph: { nodes: [], edges: [] },
        scope: 'all',
        lang: 'en',
      }),
    );
    expect(empty).toContain(graphMessages.en.empty);
    const missing = renderToStaticMarkup(
      createElement(Graph, {
        graph,
        scope: 'local',
        focus: 'doc:unknown',
        lang: 'en',
      }),
    );
    expect(missing).toContain(graphMessages.en.missingFocus);
    const noFocus = renderToStaticMarkup(
      createElement(Graph, { graph, scope: 'local', lang: 'en' }),
    );
    expect(noFocus).toContain(graphMessages.en.selectDocument);
  });
});
