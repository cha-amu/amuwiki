import { DEFAULT_BLOG_URL, DEFAULT_PUBLICATION_URL } from './navigation';
import { safeUrl } from './wiki';

type Environment = {
  BASE_URL?: string;
  VITE_BLOG_URL?: string;
  VITE_WIKI_URL?: string;
  VITE_WIKI_BASE_URL?: string;
  VITE_WIKI_INDEX_URL?: string;
  VITE_PUBLIC_INDEX_URL?: string;
};

export function resolveConfig(env: Environment, currentUrl: string) {
  const publicationUrl = new URL(env.BASE_URL || '/amuwiki/', currentUrl)
    .href;
  const blogUrl =
    safeUrl(env.VITE_BLOG_URL || '', currentUrl) || DEFAULT_BLOG_URL;
  const defaultWikiUrl = new URL('/wiki/', blogUrl).href;
  const wiki = new URL(
    safeUrl(env.VITE_WIKI_URL || env.VITE_WIKI_BASE_URL || '', blogUrl) ||
      defaultWikiUrl,
  );
  wiki.search = '';
  wiki.hash = '';
  // Old deployments may still configure the publication root as the wiki page.
  // Ignore that stale setting rather than sending visitors into a redirect loop.
  const isPublication = [publicationUrl, DEFAULT_PUBLICATION_URL].some(
    (base) => {
      const url = new URL(base);
      return (
        wiki.origin === url.origin &&
        wiki.pathname.replace(/\/+$/, '') ===
          url.pathname.replace(/\/+$/, '')
      );
    },
  );
  return {
    wikiUrl: isPublication ? defaultWikiUrl : wiki.href,
    indexUrl:
      safeUrl(
        env.VITE_WIKI_INDEX_URL || env.VITE_PUBLIC_INDEX_URL || '',
        currentUrl,
      ) || new URL('wiki.json', publicationUrl).href,
    blogUrl,
  };
}
