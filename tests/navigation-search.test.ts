import { describe, expect, it } from 'vitest';
import fixture from './fixtures/public-wiki.json';
import {
  documentUrl,
  embedUrl,
  graphUrl,
  parseDocumentHash,
  remapWikiDocumentUrl,
} from '../src/domain/navigation';
import { excerpt, findDocuments, publicTags } from '../src/domain/search';
import { validateIndex } from '../src/domain/validation';

const index = validateIndex(fixture);
describe('published absolute document links follow the active deployment', () => {
  it('maps an exported canonical URL to the current local wiki', () => {
    expect(
      remapWikiDocumentUrl(
        'https://cha-amu.github.io/amuwiki/#collision',
        'http://localhost:4174/amuwiki/',
      ),
    ).toBe('http://localhost:4174/amuwiki/#collision');
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
        remapWikiDocumentUrl(href, 'http://localhost:4174/amuwiki/'),
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
    expect(url.pathname).toBe('/amuwiki/');
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
      new URL(graphUrl('https://example.com/amuwiki/#old')).searchParams.get(
        'view',
      ),
    ).toBe('graph');
    expect(new URL(graphUrl('https://example.com/amuwiki/#old')).hash).toBe('');
  });
});
describe('lists and search operate exclusively on the supplied public index', () => {
  it('searches title, body and tags with intersection semantics', () => {
    expect(findDocuments(index, '기록실')).toHaveLength(1);
    expect(findDocuments(index, '개인 기록')).toHaveLength(1);
    expect(findDocuments(index, '연결', '읽기').map((doc) => doc.id)).toEqual([
      index.documents[0].id,
    ]);
    expect(findDocuments(index, '존재하지 않음')).toEqual([]);
  });
  it('lists only public tags, with no relation inference', () => {
    expect(publicTags(index)).toEqual([
      '기록',
      '디자인',
      '연결',
      '읽기',
      '질문',
    ]);
  });
  it('does not pull fixtures or search history into an empty index', () => {
    const empty = { ...index, documents: [], resources: [] };
    expect(findDocuments(empty, '')).toEqual([]);
    expect(publicTags(empty)).toEqual([]);
  });
  it('turns markdown into a bounded plain text excerpt', () => {
    expect(excerpt('## 제목\n\n[본문](https://example.com) **강조**')).toBe(
      '제목 본문 강조',
    );
    expect(excerpt('a'.repeat(1000))).toHaveLength(160);
  });
});
