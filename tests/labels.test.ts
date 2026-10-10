import { describe, expect, it } from 'vitest';
import fixture from './fixtures/public-wiki.json' with { type: 'json' };
import { buildGraph, layoutGraph, selectGraph } from '../src/domain/graph';
import {
  LABEL_LINE_HEIGHT,
  planCompactLabels,
  splitTitle,
} from '../src/domain/labels';
import type { PublicWikiIndex } from '../src/domain/wiki';

// The published wiki: long titles that share words, two of them on the bottom row.
const published = (): PublicWikiIndex => {
  const value = structuredClone(fixture) as unknown as PublicWikiIndex;
  const template = value.documents[0];
  const docs: Array<[string, string, string, Array<[string, string]>]> = [
    ['amuwiki', '아무위키', 'project', [['amuwiki-connection-map', 'uses'], ['cha-amu-github-io', 'related'], ['channel-visual-system', 'uses']]],
    ['amuwiki-connection-map', '아무위키 연결 지도', 'concept', [['amuwiki', 'related'], ['channel-visual-system', 'uses']]],
    ['cha-amu-github-io', '채아무 블로그', 'project', [['amuwiki', 'uses'], ['channel-visual-system', 'uses']]],
    ['channel-visual-system', '채아무 블로그 디자인', 'concept', [['cha-amu-github-io', 'supports']]],
  ];
  value.documents = docs.map(([id, title, kind, links]) => ({
    ...structuredClone(template),
    id,
    title,
    kind: kind as typeof template.kind,
    links: links.map(([target, type]) => ({
      target,
      type: type as (typeof template.links)[number]['type'],
    })),
  }));
  value.resources = [];
  return value;
};

describe('splitTitle', () => {
  it('breaks at the space that balances the lines, preferring the later one on a tie', () => {
    expect(splitTitle('아무위키 연결 지도', 8)).toEqual(['아무위키', '연결 지도']);
    expect(splitTitle('채아무 블로그 디자인', 8)).toEqual(['채아무 블로그', '디자인']);
  });
  it('declines names without a space or with a line that is still too long', () => {
    expect(splitTitle('물건쌓는겜물리구현', 8)).toBeNull();
    expect(splitTitle('아무위키 연결 지도', 4)).toBeNull();
  });
});

describe('planCompactLabels', () => {
  // The blog sidebar map is 198×240; the bottom 42px hold the zoom controls.
  for (const [scope, focus, unconnected] of [
    ['local', 'doc:amuwiki', false],
    ['all', undefined, false],
    ['all', undefined, true],
  ] as const) {
    it(`keeps every published ${scope} name whole within the 198px sidebar frame${unconnected ? ', with a document that has no links' : ''}`, () => {
      const value = published();
      if (unconnected)
        value.documents.push({
          ...structuredClone(value.documents[0]),
          id: 'proof-and-confirmation',
          title: '증명과 입증',
          kind: 'concept',
          links: [],
        });
      const selected = selectGraph(buildGraph(value), scope, focus);
      const layout = layoutGraph(selected, focus, 1);
      const plan = planCompactLabels(selected.nodes, layout, 198, 198);
      const originY = (198 - layout.height * plan.fit) / 2;
      const offset = Math.max(35 * plan.fit, 18);
      for (const node of selected.nodes) {
        const label = plan.labels.get(node.key)!;
        expect(label.lines.join(' ')).toBe(node.title);
        expect(label.lines.length).toBeLessThanOrEqual(2);
        const y = originY + layout.positions.get(node.key)!.y * plan.fit;
        const bottom =
          y + offset + 4 + (label.lines.length - 1) * LABEL_LINE_HEIGHT;
        expect(bottom).toBeLessThanOrEqual(198 - 4);
      }
    });
  }
});

