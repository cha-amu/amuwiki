import { config } from '../config';
import type { WikiGraph } from '../domain/graph';
import { documentUrl } from '../domain/navigation';
import { documentKey, kindLabels, linkLabels, safeUrl } from '../domain/wiki';
import type { PublicWikiDocument, PublicWikiIndex } from '../domain/wiki';
import { Icon } from './Icons';
import { Markdown } from './Markdown';

export function Document({
  doc,
  index,
  graph,
  onTag,
}: {
  doc: PublicWikiDocument;
  index: PublicWikiIndex;
  graph: WikiGraph;
  onTag: (tag: string) => void;
}) {
  const key = documentKey(doc.id);
  const byKey = new Map(graph.nodes.map((node) => [node.key, node]));
  const outgoing = graph.edges.filter(
    (edge) => edge.source === key && edge.type !== 'reference',
  );
  const incoming = graph.edges.filter(
    (edge) => edge.target === key && edge.type !== 'reference',
  );
  const resources = index.resources.filter((resource) =>
    resource.documentIds.includes(doc.id),
  );
  const nodeLink = (key: string) => {
    const node = byKey.get(key)!;
    return node.url
      ? safeUrl(node.url, config.blogUrl)
      : documentUrl(node.id, config.wikiUrl);
  };
  return (
    <article className="document panel" aria-labelledby="document-title">
      <div className="document-topline">
        <a href={config.wikiUrl} className="back-link">
          ← 모든 문서
        </a>
        <span className={`kind-badge kind-${doc.kind}`}>
          {kindLabels[doc.kind]}
        </span>
      </div>
      <header className="document-header">
        <h1 id="document-title" tabIndex={-1}>
          {doc.title}
        </h1>
        <div className="document-meta">
          <time dateTime={doc.updated}>
            {new Intl.DateTimeFormat('ko-KR', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'Asia/Seoul',
            }).format(new Date(doc.updated))}
          </time>
          <a
            className="permalink"
            href={documentUrl(doc.id, config.wikiUrl)}
            aria-label="이 문서의 직접 링크"
          >
            <Icon name="link" size={15} />
            문서 링크
          </a>
        </div>
        {!!doc.tags.length && (
          <div className="document-tags">
            {doc.tags.map((tag) => (
              <button
                type="button"
                className="tag"
                key={tag}
                onClick={() => onTag(tag)}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}
      </header>
      <Markdown body={doc.body} documentId={doc.id} />
      {(!!outgoing.length || !!incoming.length) && (
        <div className="document-connections">
          {!!outgoing.length && (
            <section aria-labelledby="outgoing-title">
              <h2 id="outgoing-title">이어지는 문서</h2>
              <ul>
                {outgoing.map((edge) => (
                  <li key={edge.key}>
                    <a href={nodeLink(edge.target)}>
                      {byKey.get(edge.target)!.title}
                      <Icon name="arrow" size={16} />
                    </a>
                    <span>
                      {linkLabels[edge.type as keyof typeof linkLabels]}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {!!incoming.length && (
            <section aria-labelledby="incoming-title">
              <h2 id="incoming-title">이 문서를 가리키는 문서</h2>
              <ul>
                {incoming.map((edge) => (
                  <li key={edge.key}>
                    <a href={nodeLink(edge.source)}>
                      {byKey.get(edge.source)!.title}
                      <Icon name="arrow" size={16} />
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
      {!!resources.length && (
        <section
          className="document-resources"
          aria-labelledby="resources-title"
        >
          <h2 id="resources-title">함께 읽기</h2>
          <ul>
            {resources.map((resource) => (
              <li key={`${resource.kind}:${resource.id}`}>
                <span className="resource-kind">
                  {kindLabels[resource.kind]}
                </span>
                <a
                  href={safeUrl(resource.url, config.blogUrl)}
                  rel="noopener noreferrer"
                >
                  {resource.title}
                  <span aria-hidden="true">↗</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      {!!doc.sources.length && (
        <section className="document-sources" aria-labelledby="sources-title">
          <h2 id="sources-title">참고한 곳</h2>
          <ol>
            {doc.sources.map((source, i) => (
              <li key={`${source.url}-${i}`}>
                <a
                  href={safeUrl(source.url, config.wikiUrl)}
                  rel="noopener noreferrer"
                >
                  {source.label}
                  <span aria-hidden="true"> ↗</span>
                </a>
              </li>
            ))}
          </ol>
        </section>
      )}
    </article>
  );
}
