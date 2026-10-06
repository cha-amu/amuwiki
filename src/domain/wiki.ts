export type DocumentKind = 'concept' | 'project' | 'decision' | 'question';
export type LinkKind = 'related' | 'uses' | 'supports' | 'supersedes';
export type ResourceKind = 'post' | 'asset';

export interface PublicWikiDocument {
  id: string;
  title: string;
  kind: DocumentKind;
  tags: string[];
  body: string;
  links: { target: string; type: LinkKind }[];
  sources: { label: string; url: string }[];
  updated: string;
}

export interface PublicWikiResource {
  kind: ResourceKind;
  id: string;
  title: string;
  url: string;
  documentIds: string[];
}

export interface PublicWikiIndex {
  version: 1;
  generatedAt: string;
  documents: PublicWikiDocument[];
  resources: PublicWikiResource[];
}

export const kindLabels: Record<DocumentKind | ResourceKind, string> = {
  concept: '개념',
  project: '프로젝트',
  decision: '결정',
  question: '질문',
  post: '블로그 글',
  asset: '자료',
};
export const linkLabels: Record<LinkKind, string> = {
  related: '함께 보기',
  uses: '활용',
  supports: '뒷받침',
  supersedes: '이전 기록',
};
export const documentKey = (id: string) => `doc:${id}`;
export const resourceKey = (
  resource: Pick<PublicWikiResource, 'kind' | 'id'>,
) => `${resource.kind}:${resource.id}`;

// Explicit keys are preferred. Raw document IDs are also accepted from exporters.
export function resolveTarget(
  target: string,
  keys: ReadonlySet<string>,
): string | undefined {
  if (keys.has(target)) return target;
  const key = documentKey(target);
  return keys.has(key) ? key : undefined;
}

export function safeUrl(value: string, base: string): string | undefined {
  if (!value || /[\u0000-\u0020\u007f\\]/u.test(value)) return undefined;
  try {
    const url = new URL(value, base);
    return ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
