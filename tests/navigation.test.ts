import { describe, expect, it } from 'vitest';
import {
  documentUrl,
  embedUrl,
  graphUrl,
  parseDocumentHash,
  remapWikiDocumentUrl,
} from '../src/domain/navigation';

describe('published absolute document links follow the active deployment', () => {
  it('maps an exported canonical URL to the blog wiki page', () => {
    expect(
      remapWikiDocumentUrl(
        'https://cha-amu.github.io/amuwiki/#collision',
        'http://127.0.0.1:5178/wiki/',
      ),
    ).toBe('http://127.0.0.1:5178/wiki/#collision');
  });
  it('retains reserved-character IDs and headings at custom deployment paths', () => {
    const href = documentUrl('한글/문서?#%', undefined, '작은-기록');
    const result = remapWikiDocumentUrl(
      href,
      'https://wiki.example.com/notes/',
    );
    expect(result).toBe(
      documentUrl(
        '한글/문서?#%',
        'https://wiki.example.com/notes/',
        '작은-기록',
      ),
    );
  });
  it('does not rewrite unrelated hosts, paths or malformed hashes', () => {
    for (const href of [
      'https://other.example/amuwiki/#one',
      'https://cha-amu.github.io/posts/#one',
      'https://cha-amu.github.io/amuwiki/#%GG',
    ]) {
      expect(
        remapWikiDocumentUrl(href, 'http://127.0.0.1:5178/wiki/'),
      ).toBeUndefined();
    }
  });
});
describe('URL encoding and independent heading routes', () => {
  it.each([
    '한글',
    'a/b?c#d&e%f: g',
    'doc:이미 접두사 있음',
    '✅ + %20',
    'constructor',
    '__proto__',
  ])('roundtrips a document ID: %s', (id) => {
    const url = new URL(documentUrl(id));
    expect(parseDocumentHash(url.hash)?.id).toBe(id);
    expect(url.pathname).toBe('/wiki/');
  });
  it('separates an encoded slash inside a document ID from the heading separator', () => {
    const url = new URL(
      documentUrl(
        '문서/문단',
        'https://example.com/amuwiki/?embed=graph',
        '작은-기록',
      ),
    );
    expect(url.search).toBe('');
    expect(parseDocumentHash(url.hash)).toEqual({
      id: '문서/문단',
      heading: '작은-기록',
    });
  });
  it.each(['#%GG', '#one/two/three', '#', ''])(
    'rejects malformed hashes without throwing: %s',
    (hash) => {
      expect(parseDocumentHash(hash)).toBeNull();
    },
  );
  it('roundtrips resource keys in embed focus without query injection', () => {
    for (const key of [
      'doc:한글/문서?&scope=all#',
      'post:글%#/a',
      'asset:이미지:a&b',
    ]) {
      const url = new URL(
        embedUrl(key, 'local', 'http://localhost:4186/amuwiki/#old'),
      );
      expect(url.searchParams.get('focus')).toBe(key);
      expect(url.searchParams.get('scope')).toBe('local');
      expect(url.searchParams.get('embed')).toBe('graph');
      expect(url.hash).toBe('');
    }
  });
  it('produces a full graph page with no old document hash', () => {
    expect(
      new URL(
        graphUrl('https://example.com/amuwiki/#old'),
      ).searchParams.get('view'),
    ).toBe('graph');
    expect(new URL(graphUrl('https://example.com/amuwiki/#old')).hash).toBe(
      '',
    );
  });
});
