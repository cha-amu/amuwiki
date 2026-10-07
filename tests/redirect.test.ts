import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PUBLICATION_URL,
  DEFAULT_WIKI_URL,
  documentUrl,
  embedUrl,
  publicRoute,
} from '../src/domain/navigation';

function redirect(source: string, target = DEFAULT_WIKI_URL): URL {
  const route = publicRoute(source, target);
  expect(route.kind).toBe('redirect');
  if (route.kind !== 'redirect')
    throw new Error('Expected a visitor redirect');
  return new URL(route.url);
}

describe('publication visitor redirects', () => {
  it.each([
    '',
    '?view=unknown',
    '?embed=other',
    'index.html',
    '?next=https://evil.example',
  ])('sends an ordinary entry to the configured blog page: %s', (suffix) => {
    expect(redirect(`${DEFAULT_PUBLICATION_URL}${suffix}`).href).toBe(
      DEFAULT_WIKI_URL,
    );
  });
  it.each([
    '한글/문서?#%&scope=all',
    'doc:이미 접두사 있음',
    '✅ + %20',
    '__proto__',
  ])(
    'preserves a reserved-character document ID and its heading: %s',
    (id) => {
      const source = documentUrl(id, DEFAULT_PUBLICATION_URL, '문단/구분?#%');
      expect(redirect(source).href).toBe(
        documentUrl(id, DEFAULT_WIKI_URL, '문단/구분?#%'),
      );
    },
  );
  it.each([
    '#%GG',
    '#%ED%A0%80',
    '#%00hidden',
    '#one/%7F',
    '#one/two/three',
    '#%20',
    '#/one',
    '#',
    `#${'a'.repeat(2049)}`,
  ])('drops an invalid document fragment: %s', (hash) => {
    expect(redirect(`${DEFAULT_PUBLICATION_URL}${hash}`).href).toBe(
      DEFAULT_WIKI_URL,
    );
  });
  it.each(['doc:읽기/기록?#%한글', 'post:글/한글?#%', 'asset:자료:a/b?x&y'])(
    'preserves typed graph focus, scope and independent filters: %s',
    (focus) => {
      const source = new URL(
        documentUrl('문서/하나', DEFAULT_PUBLICATION_URL),
      );
      source.search = new URLSearchParams({
        view: 'graph',
        focus,
        scope: 'all',
        tag: '읽기 & 기록',
        q: 'a+b ? # %',
        search: '두 단어',
        query: '자료 검색',
        parentOrigin: 'https://evil.example',
        next: '//evil.example',
        embed: 'other',
      }).toString();
      const result = redirect(source.href, 'http://127.0.0.1:5178/wiki/');
      expect(result.origin).toBe('http://127.0.0.1:5178');
      expect(result.pathname).toBe('/wiki/');
      expect(Object.fromEntries(result.searchParams)).toEqual({
        view: 'graph',
        focus,
        scope: 'all',
        tag: '읽기 & 기록',
        q: 'a+b ? # %',
        search: '두 단어',
        query: '자료 검색',
      });
      expect(result.hash).toBe(`#${encodeURIComponent('문서/하나')}`);
    },
  );
  it('preserves the unfocused all graph and local scope', () => {
    expect(
      redirect(`${DEFAULT_PUBLICATION_URL}?view=graph&scope=all`).search,
    ).toBe('?view=graph&scope=all');
    expect(
      redirect(
        `${DEFAULT_PUBLICATION_URL}?view=graph&scope=local&focus=doc:one`,
      ).searchParams.get('scope'),
    ).toBe('local');
  });
  it('does not forward graph-only or embed-only options to the document list', () => {
    const result = redirect(
      `${DEFAULT_PUBLICATION_URL}?focus=doc:one&scope=all&parentOrigin=*&tag=tag&q=search`,
    );
    expect(Object.fromEntries(result.searchParams)).toEqual({
      tag: 'tag',
      q: 'search',
    });
  });
  it.each([
    'doc:',
    'private:one',
    'javascript:alert(1)',
    'doc:%00one',
    'asset:%20',
  ])('rejects invalid graph keys and scope: %s', (focus) => {
    const result = redirect(
      `${DEFAULT_PUBLICATION_URL}?view=graph&focus=${focus}&scope=private`,
    );
    expect(result.search).toBe('?view=graph');
  });
  it('drops control characters, over-budget input and empty filters', () => {
    const source = new URL(DEFAULT_PUBLICATION_URL);
    source.search = new URLSearchParams({
      tag: 'a'.repeat(101),
      q: '\u0000secret',
      search: 'a'.repeat(2049),
      query: '  ',
    }).toString();
    expect(redirect(source.href).search).toBe('');
  });
  it('rebuilds queries without injection or duplicate parameters', () => {
    const result = redirect(
      `${DEFAULT_PUBLICATION_URL}?tag=safe&tag=other&q=%26embed%3Dgraph%23bad&redirect=https://evil.example`,
    );
    expect(Object.fromEntries(result.searchParams)).toEqual({
      tag: 'safe',
      q: '&embed=graph#bad',
    });
    expect(result.origin).toBe('https://cha-amu.github.io');
    expect(result.hash).toBe('');
  });
  it('clears stale parameters and hashes from the configured destination', () => {
    expect(
      redirect(
        DEFAULT_PUBLICATION_URL,
        'https://blog.example/wiki/?embed=graph#old',
      ).href,
    ).toBe('https://blog.example/wiki/');
  });
});

describe('embed routes stay on the publication host', () => {
  it.each(['doc:한글/문서?&scope=all#', 'post:글%#/a', 'asset:이미지:a&b'])(
    'retains the focus key and local scope: %s',
    (focus) => {
      expect(publicRoute(embedUrl(focus, 'local'), DEFAULT_WIKI_URL)).toEqual(
        {
          kind: 'embed',
          focus,
          scope: 'local',
          compact: true,
          resourcesFromParent: false,
          lang: 'ko',
        },
      );
    },
  );
  it('supports an all graph with no focus and keeps the default local scope', () => {
    expect(publicRoute(embedUrl(undefined, 'all'), DEFAULT_WIKI_URL)).toEqual(
      {
        kind: 'embed',
        focus: undefined,
        scope: 'all',
        compact: false,
        resourcesFromParent: false,
        lang: 'ko',
      },
    );
    expect(
      publicRoute(`${DEFAULT_PUBLICATION_URL}?embed=graph`, DEFAULT_WIKI_URL),
    ).toEqual({
      kind: 'embed',
      focus: undefined,
      scope: 'local',
      compact: true,
      resourcesFromParent: false,
      lang: 'ko',
    });
  });
  it('does not replace unknown focus with a public node or document hash', () => {
    expect(
      publicRoute(
        `${DEFAULT_PUBLICATION_URL}?embed=graph&focus=doc:unknown&scope=invalid#known`,
        DEFAULT_WIKI_URL,
      ),
    ).toEqual({
      kind: 'embed',
      focus: 'doc:unknown',
      scope: 'local',
      compact: true,
      resourcesFromParent: false,
      lang: 'ko',
    });
  });
  it('uses the publication URL for embeds and the blog URL for documents by default', () => {
    expect(new URL(embedUrl(undefined, 'all')).pathname).toBe('/amuwiki/');
    expect(new URL(documentUrl('one')).pathname).toBe('/wiki/');
  });
  it.each([
    ['scope=all&compact=1&resources=parent&lang=en', false, true, true, 'en'],
    [
      'scope=local&compact=0&resources=parent&lang=ko',
      true,
      true,
      true,
      'ko',
    ],
    [
      'scope=all&compact=true&resources=all&lang=EN',
      false,
      false,
      false,
      'ko',
    ],
    [
      'scope=all&compact=0&resources=Parent&lang=fr',
      false,
      false,
      false,
      'ko',
    ],
    ['scope=invalid&lang=', true, true, false, 'ko'],
  ])(
    'parses only the documented embed parameters: %s',
    (query, local, compact, resourcesFromParent, lang) => {
      expect(
        publicRoute(
          `${DEFAULT_PUBLICATION_URL}?embed=graph&${query}`,
          DEFAULT_WIKI_URL,
        ),
      ).toEqual({
        kind: 'embed',
        focus: undefined,
        scope: local ? 'local' : 'all',
        compact,
        resourcesFromParent,
        lang,
      });
    },
  );
});
