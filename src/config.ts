import { safeUrl } from './domain/wiki';

function configuredUrl(value: string | undefined, fallback: string) {
  return (value && safeUrl(value, window.location.href)) || fallback;
}
const localWikiUrl = new URL(import.meta.env.BASE_URL, window.location.origin)
  .href;
export const config = {
  wikiUrl: configuredUrl(
    import.meta.env.VITE_WIKI_BASE_URL || import.meta.env.VITE_WIKI_URL,
    localWikiUrl,
  ),
  indexUrl: configuredUrl(
    import.meta.env.VITE_WIKI_INDEX_URL ||
      import.meta.env.VITE_PUBLIC_INDEX_URL,
    new URL('wiki.json', localWikiUrl).href,
  ),
  blogUrl: configuredUrl(
    import.meta.env.VITE_BLOG_URL,
    'https://cha-amu.github.io/',
  ),
  iconUrl: `${import.meta.env.BASE_URL}assets/ui/guestbook-icon.png`,
};
