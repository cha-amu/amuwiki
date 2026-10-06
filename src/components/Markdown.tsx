import { Children, isValidElement, useMemo } from 'react';
import type { ReactNode } from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { config } from '../config';
import {
  documentUrl,
  headingDomId,
  headingSlug,
  remapWikiDocumentUrl,
} from '../domain/navigation';
import { safeUrl } from '../domain/wiki';

type AstNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: AstNode[];
};
function rehypeHeadings() {
  return (tree: AstNode) => {
    const counts = new Map<string, number>();
    const plain = (node: AstNode): string =>
      node.value || node.children?.map(plain).join('') || '';
    const visit = (node: AstNode) => {
      if (
        node.type === 'element' &&
        /^h[1-6]$/u.test(node.tagName || '') &&
        !node.properties?.id
      ) {
        const slug = headingSlug(plain(node));
        const count = counts.get(slug) || 0;
        counts.set(slug, count + 1);
        node.properties = {
          ...node.properties,
          id: headingDomId(count ? `${slug}-${count}` : slug),
        };
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}

function textContent(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) =>
      isValidElement<{ children?: ReactNode }>(child)
        ? textContent(child.props.children)
        : typeof child === 'string' || typeof child === 'number'
          ? String(child)
          : '',
    )
    .join('');
}

export function Markdown({
  body,
  documentId,
}: {
  body: string;
  documentId: string;
}) {
  const content = useMemo(() => {
    const heading = (
      level: 2 | 3 | 4 | 5 | 6,
      children: ReactNode,
      id?: string,
    ) => {
      const slug = (id || '').replace(/^wiki-section-/u, '');
      const Tag = `h${level}` as 'h2';
      return (
        <Tag id={id} tabIndex={-1}>
          {children}
          <a
            className="heading-anchor"
            href={documentUrl(documentId, config.wikiUrl, slug)}
            aria-label={`${textContent(children)} 문단 링크`}
          >
            #
          </a>
        </Tag>
      );
    };
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        remarkRehypeOptions={{
          footnoteLabel: '덧붙임',
          footnoteBackLabel: '본문으로 돌아가기',
        }}
        rehypePlugins={[rehypeHeadings]}
        skipHtml
        urlTransform={(value, key) => {
          // Only document links get a custom scheme; all other links keep safe URL handling.
          if (key === 'href' && value.startsWith('doc:')) return value;
          return defaultUrlTransform(value);
        }}
        components={{
          h1: ({ children, id }) => heading(2, children, id),
          h2: ({ children, id }) => heading(2, children, id),
          h3: ({ children, id }) => heading(3, children, id),
          h4: ({ children, id }) => heading(4, children, id),
          h5: ({ children, id }) => heading(5, children, id),
          h6: ({ children, id }) => heading(6, children, id),
          a: ({
            href,
            children,
            id,
            'aria-label': ariaLabel,
            'aria-describedby': describedBy,
          }) => {
            if (!href) return <span>{children}</span>;
            if (href.startsWith('doc:')) {
              try {
                return (
                  <a
                    href={documentUrl(
                      decodeURIComponent(href.slice(4)),
                      config.wikiUrl,
                    )}
                  >
                    {children}
                  </a>
                );
              } catch {
                return <span>{children}</span>;
              }
            }
            if (href.startsWith('#')) {
              let slug: string;
              try {
                slug = decodeURIComponent(href.slice(1));
              } catch {
                return <span>{children}</span>;
              }
              // Footnote links also use the document route, never the router's bare hash.
              return (
                <a
                  id={id}
                  href={documentUrl(documentId, config.wikiUrl, slug)}
                  aria-label={ariaLabel}
                  aria-describedby={describedBy}
                >
                  {children}
                </a>
              );
            }
            const url =
              remapWikiDocumentUrl(href, config.wikiUrl) ||
              safeUrl(href, config.wikiUrl);
            return url ? (
              <a href={url} rel="noopener noreferrer">
                {children}
              </a>
            ) : (
              <span>{children}</span>
            );
          },
          img: ({ src, alt }) => {
            const url = src ? safeUrl(src, config.wikiUrl) : undefined;
            return url ? (
              <img
                src={url}
                alt={alt || ''}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
              />
            ) : null;
          },
          table: ({ children }) => (
            <div
              className="table-scroll"
              role="region"
              aria-label="표"
              tabIndex={0}
            >
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {body}
      </ReactMarkdown>
    );
  }, [body, documentId]);
  return <div className="markdown">{content}</div>;
}
