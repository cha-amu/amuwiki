import type { Language } from './i18n';

export const DEFAULT_BLOG_URL = 'https://cha-amu.github.io/';
export const DEFAULT_WIKI_URL = new URL('/wiki/', DEFAULT_BLOG_URL).href;
export const DEFAULT_PUBLICATION_URL = new URL(
  '/amuwiki/',
  DEFAULT_BLOG_URL,
).href;

function safeRouteText(value: string, max = 2048): boolean {
  try {
    encodeURIComponent(value);
    return (
      value.trim().length > 0 &&
      value.length <= max &&
      !/[\u0000-\u001f\u007f]/u.test(value)
    );
  } catch {
    return false;
  }
}

export function documentUrl(
  id: string,
  base = DEFAULT_WIKI_URL,
  heading?: string,
): string {
  const url = new URL(base);
  url.search = '';
  url.hash = '';
  return `${url.href}#${encodeURIComponent(id)}${heading ? `/${encodeURIComponent(heading)}` : ''}`;
}
export function parseDocumentHash(
  hash: string,
): { id: string; heading?: string } | null {
  if (!hash.startsWith('#') || hash === '#') return null;
  const [id, heading, ...rest] = hash.slice(1).split('/');
  if (rest.length || !id) return null;
  try {
    const decodedId = decodeURIComponent(id);
    const decodedHeading = heading
      ? decodeURIComponent(heading)
      : undefined;
    if (
      !safeRouteText(decodedId) ||
      (decodedHeading !== undefined && !safeRouteText(decodedHeading))
    )
      return null;
    return {
      id: decodedId,
      ...(decodedHeading ? { heading: decodedHeading } : {}),
    };
  } catch {
    return null;
  }
}

export function remapWikiDocumentUrl(
  href: string,
  currentBase: string,
): string | undefined {
  try {
    const source = new URL(href, currentBase);
    const normalizedPath = (url: URL) => url.pathname.replace(/\/+$/, '');
    const knownBases = [
      new URL(DEFAULT_PUBLICATION_URL),
      new URL(DEFAULT_WIKI_URL),
      new URL(currentBase),
    ];
    if (
      !knownBases.some(
        (base) =>
          base.origin === source.origin &&
          normalizedPath(base) === normalizedPath(source),
      )
    )
      return undefined;
    const route = parseDocumentHash(source.hash);
    return route
      ? documentUrl(route.id, currentBase, route.heading)
      : undefined;
  } catch {
    return undefined;
  }
}
export function graphUrl(base = DEFAULT_WIKI_URL, focus?: string): string {
  const url = new URL(base);
  url.hash = '';
  url.search = '';
  url.searchParams.set('view', 'graph');
  if (focus) url.searchParams.set('focus', focus);
  return url.href;
}
export function embedUrl(
  focus: string | undefined,
  scope: 'local' | 'all',
  base = DEFAULT_PUBLICATION_URL,
): string {
  const url = new URL(base);
  url.hash = '';
  url.search = '';
  url.searchParams.set('embed', 'graph');
  if (focus) url.searchParams.set('focus', focus);
  url.searchParams.set('scope', scope);
  return url.href;
}

export type PublicRoute =
  | { kind: 'redirect'; url: string }
  | {
      kind: 'embed';
      focus?: string;
      scope: 'local' | 'all';
      compact: boolean;
      resourcesFromParent: boolean;
      lang: Language;
    };

// Only the graph iframe stays on the publication host. All visitor state is
// rebuilt on the configured blog page; query strings can never choose a host.
export function publicRoute(
  currentUrl: string,
  wikiUrl: string,
): PublicRoute {
  const current = new URL(currentUrl);
  const params = current.searchParams;
  if (params.get('embed') === 'graph') {
    const scope = params.get('scope') === 'all' ? 'all' : 'local';
    return {
      kind: 'embed',
      focus: params.get('focus') || undefined,
      scope,
      compact: scope === 'local' || params.get('compact') === '1',
      resourcesFromParent: params.get('resources') === 'parent',
      lang: params.get('lang') === 'en' ? 'en' : 'ko',
    };
  }

  const target = new URL(wikiUrl);
  target.search = '';
  target.hash = '';
  if (params.get('view') === 'graph') {
    target.searchParams.set('view', 'graph');
    const focus = params.get('focus');
    if (
      focus &&
      /^(doc|post|asset):/u.test(focus) &&
      safeRouteText(focus.slice(focus.indexOf(':') + 1))
    )
      target.searchParams.set('focus', focus);
    const scope = params.get('scope');
    if (scope === 'local' || scope === 'all')
      target.searchParams.set('scope', scope);
  }
  for (const key of ['tag', 'q', 'search', 'query']) {
    const value = params.get(key);
    if (value && safeRouteText(value, key === 'tag' ? 100 : 2048))
      target.searchParams.set(key, value);
  }
  const document = parseDocumentHash(current.hash);
  if (document)
    target.hash = new URL(
      documentUrl(document.id, wikiUrl, document.heading),
    ).hash;
  return { kind: 'redirect', url: target.href };
}
