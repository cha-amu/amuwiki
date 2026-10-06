export const DEFAULT_WIKI_URL = 'https://cha-amu.github.io/amuwiki/';

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
  if (!hash || hash === '#') return null;
  const [id, heading, ...rest] = hash.slice(1).split('/');
  if (rest.length || !id) return null;
  try {
    return {
      id: decodeURIComponent(id),
      ...(heading ? { heading: decodeURIComponent(heading) } : {}),
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
    const knownBases = [new URL(DEFAULT_WIKI_URL), new URL(currentBase)];
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
  focus: string,
  scope: 'local' | 'all',
  base = DEFAULT_WIKI_URL,
): string {
  const url = new URL(base);
  url.hash = '';
  url.search = '';
  url.searchParams.set('embed', 'graph');
  url.searchParams.set('focus', focus);
  url.searchParams.set('scope', scope);
  return url.href;
}
export function headingSlug(text: string): string {
  return (
    text
      .normalize('NFC')
      .trim()
      .toLocaleLowerCase('ko')
      .replace(/[^\p{L}\p{N}\s_-]/gu, '')
      .replace(/\s+/gu, '-') || 'section'
  );
}
export const headingDomId = (slug: string) => `wiki-section-${slug}`;
