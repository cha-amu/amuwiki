import { documentKey, resourceKey, resolveTarget, safeUrl } from './wiki.ts';
import type { PublicWikiIndex } from './wiki.ts';

export const MAX_INDEX_BYTES = 8 * 1024 * 1024;
export class InvalidIndexError extends Error {
  constructor() {
    super('The public wiki index is invalid.');
    this.name = 'InvalidIndexError';
  }
}
function assert(condition: unknown): asserts condition {
  if (!condition) throw new InvalidIndexError();
}
function record(
  value: unknown,
  fields: string[],
): asserts value is Record<string, unknown> {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value));
  const keys = Object.keys(value);
  assert(
    keys.length === fields.length &&
      fields.every((key) => Object.hasOwn(value, key)),
  );
}
function string(
  value: unknown,
  max = 512,
  empty = false,
): asserts value is string {
  assert(
    typeof value === 'string' &&
      value.length <= max &&
      (empty || value.trim().length > 0),
  );
  // Reject lone surrogates before any encodeURIComponent or URL construction.
  try {
    encodeURIComponent(value);
  } catch {
    throw new InvalidIndexError();
  }
}
function identifier(value: unknown): asserts value is string {
  string(value, 2048);
  assert(!/[\u0000-\u001f\u007f]/u.test(value));
}
function array(value: unknown, max: number): asserts value is unknown[] {
  assert(Array.isArray(value) && value.length <= max);
}
function date(value: unknown) {
  string(value, 64);
  assert(
    /^\d{4}-\d{2}-\d{2}(T.*)?$/u.test(value) &&
      Number.isFinite(Date.parse(value)),
  );
}
function url(value: unknown) {
  string(value, 8192);
  assert(safeUrl(value, 'https://cha-amu.github.io/') !== undefined);
}

// Fail closed on extra fields, broken references, unsafe URLs and oversized input.
// Invalid input is never partially rendered and is never cached as a fallback.
export function validateIndex(value: unknown): PublicWikiIndex {
  record(value, ['version', 'generatedAt', 'documents', 'resources']);
  assert(value.version === 1);
  date(value.generatedAt);
  array(value.documents, 5000);
  array(value.resources, 5000);
  let connections = 0;
  for (const doc of value.documents) {
    record(doc, [
      'id',
      'title',
      'kind',
      'tags',
      'body',
      'links',
      'sources',
      'updated',
    ]);
    identifier(doc.id);
    string(doc.title);
    string(doc.body, 1_000_000, true);
    date(doc.updated);
    assert(
      ['concept', 'project', 'decision', 'question'].includes(
        doc.kind as string,
      ),
    );
    array(doc.tags, 100);
    doc.tags.forEach((tag) => string(tag, 100));
    assert(new Set(doc.tags).size === doc.tags.length);
    array(doc.links, 1000);
    array(doc.sources, 200);
    connections += doc.links.length;
    for (const link of doc.links) {
      record(link, ['target', 'type']);
      identifier(link.target);
      assert(
        ['related', 'uses', 'supports', 'supersedes'].includes(
          link.type as string,
        ),
      );
    }
    for (const source of doc.sources) {
      record(source, ['label', 'url']);
      string(source.label);
      url(source.url);
    }
  }
  for (const resource of value.resources) {
    record(resource, ['kind', 'id', 'title', 'url', 'documentIds']);
    assert(['post', 'asset'].includes(resource.kind as string));
    identifier(resource.id);
    string(resource.title);
    url(resource.url);
    array(resource.documentIds, 5000);
    resource.documentIds.forEach(identifier);
    connections += resource.documentIds.length;
  }
  assert(connections <= 50_000);
  const index = value as unknown as PublicWikiIndex;
  const docIds = new Set(index.documents.map((doc) => doc.id));
  const keys = new Set([
    ...index.documents.map((doc) => documentKey(doc.id)),
    ...index.resources.map(resourceKey),
  ]);
  assert(docIds.size === index.documents.length);
  assert(keys.size === index.documents.length + index.resources.length);
  for (const doc of index.documents) {
    for (const link of doc.links) assert(resolveTarget(link.target, keys));
  }
  for (const resource of index.resources) {
    for (const id of resource.documentIds) assert(docIds.has(id));
  }
  return index;
}

export type LoadFailure = 'unpublished' | 'network' | 'invalid';
export class IndexLoadError extends Error {
  readonly reason: LoadFailure;
  constructor(reason: LoadFailure) {
    super(reason);
    this.reason = reason;
    this.name = 'IndexLoadError';
  }
}
export async function loadIndex(
  url: string,
  signal: AbortSignal,
): Promise<PublicWikiIndex> {
  let response: Response;
  try {
    response = await fetch(url, {
      signal,
      cache: 'no-store',
      credentials: 'omit',
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new IndexLoadError('network');
  }
  if (response.status === 404 || response.status === 410)
    throw new IndexLoadError('unpublished');
  if (!response.ok) throw new IndexLoadError('network');
  const contentLength = Number(response.headers.get('content-length'));
  if (contentLength > MAX_INDEX_BYTES) throw new IndexLoadError('invalid');
  // Bound the actual streamed body too; Content-Length may be absent or inaccurate.
  const reader = response.body?.getReader();
  if (!reader) throw new IndexLoadError('invalid');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch {
        throw new IndexLoadError('network');
      }
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_INDEX_BYTES) {
        await reader.cancel().catch(() => {});
        throw new InvalidIndexError();
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    if (signal.aborted) throw error;
    if (error instanceof IndexLoadError) throw error;
    throw new IndexLoadError('invalid');
  } finally {
    reader.releaseLock();
  }
  try {
    return validateIndex(JSON.parse(text));
  } catch {
    throw new IndexLoadError('invalid');
  }
}
