import type { PublicWikiDocument, PublicWikiIndex } from './wiki';

const normalize = (value: string) =>
  value.normalize('NFKC').toLocaleLowerCase('ko');
export function findDocuments(
  index: PublicWikiIndex,
  query: string,
  tag = '',
): PublicWikiDocument[] {
  const words = normalize(query).trim().split(/\s+/u).filter(Boolean);
  return index.documents
    .filter((doc) => {
      if (tag && !doc.tags.includes(tag)) return false;
      const haystack = normalize([doc.title, doc.body, ...doc.tags].join('\n'));
      return words.every((word) => haystack.includes(word));
    })
    .sort(
      (a, b) =>
        Date.parse(b.updated) - Date.parse(a.updated) ||
        a.title.localeCompare(b.title, 'ko'),
    );
}
export function publicTags(index: PublicWikiIndex): string[] {
  return [...new Set(index.documents.flatMap((doc) => doc.tags))].sort((a, b) =>
    a.localeCompare(b, 'ko'),
  );
}
export function excerpt(body: string): string {
  return body
    .replace(/<[^>]*>/gu, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/gu, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, '$1')
    .replace(/[#*`>~_\[\]]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 160);
}
