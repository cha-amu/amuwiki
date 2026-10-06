import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/domain/config';

const current = 'http://127.0.0.1:4186/amuwiki/?embed=graph#ignored';
describe('publication and blog configuration', () => {
  it('defaults to the blog wiki while loading JSON from the publication host', () => {
    expect(resolveConfig({}, current)).toEqual({
      wikiUrl: 'https://cha-amu.github.io/wiki/',
      blogUrl: 'https://cha-amu.github.io/',
      indexUrl: 'http://127.0.0.1:4186/amuwiki/wiki.json',
    });
  });
  it('supports local blog integration without moving the index endpoint', () => {
    expect(
      resolveConfig({ VITE_BLOG_URL: 'http://127.0.0.1:5178/' }, current),
    ).toEqual({
      wikiUrl: 'http://127.0.0.1:5178/wiki/',
      blogUrl: 'http://127.0.0.1:5178/',
      indexUrl: 'http://127.0.0.1:4186/amuwiki/wiki.json',
    });
  });
  it('derives /wiki/ from the blog origin even when its URL contains a path', () => {
    expect(
      resolveConfig(
        { VITE_BLOG_URL: 'https://blog.example/posts/?q=old' },
        current,
      ).wikiUrl,
    ).toBe('https://blog.example/wiki/');
  });
  it('gives the explicit wiki URL precedence over the legacy alias', () => {
    expect(
      resolveConfig(
        {
          VITE_WIKI_URL: 'https://blog.example/notes/?embed=graph#old',
          VITE_WIKI_BASE_URL: 'https://old.example/wiki/',
        },
        current,
      ).wikiUrl,
    ).toBe('https://blog.example/notes/');
  });
  it('resolves a relative wiki override against the blog, not the publication host', () => {
    expect(
      resolveConfig(
        {
          VITE_BLOG_URL: 'http://127.0.0.1:5178/',
          VITE_WIKI_URL: '/notes/',
        },
        current,
      ).wikiUrl,
    ).toBe('http://127.0.0.1:5178/notes/');
  });
  it('retains valid legacy wiki and public index aliases', () => {
    const config = resolveConfig(
      {
        VITE_WIKI_BASE_URL: 'https://blog.example/wiki/',
        VITE_PUBLIC_INDEX_URL: 'https://public.example/snapshot.json',
      },
      current,
    );
    expect(config.wikiUrl).toBe('https://blog.example/wiki/');
    expect(config.indexUrl).toBe('https://public.example/snapshot.json');
  });
  it.each([
    'http://127.0.0.1:4186/amuwiki/',
    'http://127.0.0.1:4186/amuwiki',
    'https://cha-amu.github.io/amuwiki/',
  ])('avoids loops from a stale standalone wiki setting: %s', (wikiUrl) => {
    expect(
      resolveConfig(
        {
          VITE_BLOG_URL: 'http://127.0.0.1:5178/',
          VITE_WIKI_BASE_URL: wikiUrl,
        },
        current,
      ).wikiUrl,
    ).toBe('http://127.0.0.1:5178/wiki/');
  });
  it.each([
    'javascript:alert(1)',
    'data:text/html,test',
    'https://u:p@evil.example',
    'https://evil.example/\npath',
    'https://[bad',
  ])('fails closed to defaults for unsafe configuration: %s', (value) => {
    expect(
      resolveConfig(
        {
          VITE_WIKI_URL: value,
          VITE_BLOG_URL: value,
          VITE_WIKI_INDEX_URL: value,
        },
        current,
      ),
    ).toEqual(resolveConfig({}, current));
  });
  it('keeps custom publication bases and index overrides independent of wiki links', () => {
    expect(
      resolveConfig({ BASE_URL: '/snapshot/' }, current).indexUrl,
    ).toBe('http://127.0.0.1:4186/snapshot/wiki.json');
    expect(
      resolveConfig({ VITE_WIKI_INDEX_URL: '/data/wiki.json' }, current)
        .indexUrl,
    ).toBe('http://127.0.0.1:4186/data/wiki.json');
  });
});
