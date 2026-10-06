import { afterEach, describe, expect, it, vi } from 'vitest';
import fixture from './fixtures/public-wiki.json';
import {
  InvalidIndexError,
  MAX_INDEX_BYTES,
  loadIndex,
  validateIndex,
} from '../src/domain/validation';

afterEach(() => vi.unstubAllGlobals());
const fresh = () => structuredClone(fixture);
describe('public manifest boundary', () => {
  it('accepts the exact versioned empty publication', () => {
    expect(
      validateIndex({
        version: 1,
        generatedAt: fixture.generatedAt,
        documents: [],
        resources: [],
      }).documents,
    ).toEqual([]);
  });
  it('accepts public documents, resources and reserved/unicode IDs', () => {
    expect(validateIndex(fresh()).documents[0].id).toBe('읽기/기록?#%한글');
  });
  it.each([
    (value: Record<string, unknown>) => {
      value.private = [];
    },
    (value: Record<string, unknown>) => {
      (value.documents as Record<string, unknown>[])[0].private = true;
    },
    (value: Record<string, unknown>) => {
      (value.resources as Record<string, unknown>[])[0].hiddenCount = 3;
    },
    (value: Record<string, unknown>) => {
      (
        (value.documents as Record<string, unknown>[])[0].links as Record<
          string,
          unknown
        >[]
      )[0].visibility = 'private';
    },
    (value: Record<string, unknown>) => {
      (
        (value.documents as Record<string, unknown>[])[0].sources as Record<
          string,
          unknown
        >[]
      )[0].internalPath = '/secret';
    },
  ])(
    'rejects any extra fields instead of stripping them and showing partial success',
    (mutate) => {
      const value = fresh();
      mutate(value);
      expect(() => validateIndex(value)).toThrow(InvalidIndexError);
    },
  );
  it('rejects dangling document targets without creating placeholder nodes', () => {
    const value = fresh();
    value.documents[0].links.push({
      target: 'doc:unpublished',
      type: 'related',
    });
    expect(() => validateIndex(value)).toThrow(InvalidIndexError);
  });
  it('rejects a resource pointing to an unpublished document', () => {
    const value = fresh();
    value.resources[0].documentIds.push('unpublished');
    expect(() => validateIndex(value)).toThrow(InvalidIndexError);
  });
  it('rejects duplicate document and resource IDs', () => {
    const value = fresh();
    value.documents.push(value.documents[0]);
    expect(() => validateIndex(value)).toThrow(InvalidIndexError);
    const other = fresh();
    other.resources.push(other.resources[0]);
    expect(() => validateIndex(other)).toThrow(InvalidIndexError);
  });
  it('keeps post/asset namespaces distinct for the same resource ID', () => {
    const value = fresh();
    value.resources[1].id = value.resources[0].id;
    expect(validateIndex(value).resources).toHaveLength(2);
  });
  it.each([
    'javascript:alert(1)',
    'data:text/html,hello',
    'file:///etc/passwd',
    'https://user:password@example.com',
    'https://example.com\\secret',
  ])('rejects unsafe URLs: %s', (url) => {
    const value = fresh();
    value.documents[0].sources[0].url = url;
    expect(() => validateIndex(value)).toThrow(InvalidIndexError);
  });
  it('rejects malformed dates, schema versions, nulls and invalid unicode', () => {
    expect(() => validateIndex({ ...fresh(), version: 2 })).toThrow(
      InvalidIndexError,
    );
    expect(() =>
      validateIndex({ ...fresh(), generatedAt: 'not a date' }),
    ).toThrow(InvalidIndexError);
    expect(() => validateIndex(null)).toThrow(InvalidIndexError);
    const value = fresh();
    value.documents[0].id = '\ud800';
    expect(() => validateIndex(value)).toThrow(InvalidIndexError);
  });
});

describe('fetch states never use an old or bundled index', () => {
  const fetchIndex = () =>
    loadIndex('https://example.com/wiki.json', new AbortController().signal);
  it('fetches only the public index without cookies or cached fallback', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(fixture)));
    vi.stubGlobal('fetch', fetcher);
    expect((await fetchIndex()).documents).toHaveLength(5);
    expect(fetcher).toHaveBeenCalledWith(
      'https://example.com/wiki.json',
      expect.objectContaining({ credentials: 'omit', cache: 'no-store' }),
    );
  });
  it.each([404, 410])(
    'distinguishes an unpublished index (%s)',
    async (status) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response(null, { status })),
      );
      await expect(fetchIndex()).rejects.toMatchObject({
        reason: 'unpublished',
      });
    },
  );
  it.each([403, 500, 503])(
    'distinguishes a fetch failure (%s)',
    async (status) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response(null, { status })),
      );
      await expect(fetchIndex()).rejects.toMatchObject({ reason: 'network' });
    },
  );
  it('distinguishes an invalid publication from connectivity problems', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html>not JSON</html>')),
    );
    await expect(fetchIndex()).rejects.toMatchObject({ reason: 'invalid' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(fetchIndex()).rejects.toMatchObject({ reason: 'network' });
  });
  it('does not keep a successful index if a later fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify(fixture)))
        .mockRejectedValueOnce(new Error('offline')),
    );
    await expect(fetchIndex()).resolves.toHaveProperty('version', 1);
    await expect(fetchIndex()).rejects.toMatchObject({ reason: 'network' });
  });
  it('rejects oversized payloads with and without Content-Length', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('{}', {
            headers: { 'Content-Length': String(MAX_INDEX_BYTES + 1) },
          }),
        ),
    );
    await expect(fetchIndex()).rejects.toMatchObject({ reason: 'invalid' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(' '.repeat(MAX_INDEX_BYTES + 1))),
    );
    await expect(fetchIndex()).rejects.toMatchObject({ reason: 'invalid' });
  });
  it('classifies a connection lost partway through the stream as a network error', async () => {
    let read = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (!read++)
          controller.enqueue(new TextEncoder().encode('{"version":'));
        else controller.error(new TypeError('Network connection terminated'));
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream)));
    await expect(fetchIndex()).rejects.toMatchObject({ reason: 'network' });
  });
});
