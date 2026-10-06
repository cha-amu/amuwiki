import { useEffect, useMemo, useState } from 'react';
import { config } from './config';
import { buildGraph } from './domain/graph';
import {
  documentUrl,
  graphUrl,
  headingDomId,
  parseDocumentHash,
} from './domain/navigation';
import { excerpt, findDocuments, publicTags } from './domain/search';
import { IndexLoadError, loadIndex } from './domain/validation';
import type { LoadFailure } from './domain/validation';
import { documentKey, kindLabels } from './domain/wiki';
import type { PublicWikiIndex } from './domain/wiki';
import { Document } from './components/Document';
import { Graph } from './components/Graph';
import { GraphDialog } from './components/GraphDialog';
import { Icon } from './components/Icons';
import { useEmbedEscape } from './hooks/useEmbedEscape';

type IndexState =
  | { status: 'loading' }
  | { status: 'ready'; index: PublicWikiIndex }
  | { status: 'error'; reason: LoadFailure };
function readRoute() {
  const params = new URLSearchParams(window.location.search);
  return {
    document: parseDocumentHash(window.location.hash),
    requestedDocument: window.location.hash.length > 1,
    graph: params.get('view') === 'graph',
    embed: params.get('embed') === 'graph',
    focus: params.get('focus') || undefined,
    scope:
      params.get('scope') === 'all' ? ('all' as const) : ('local' as const),
    tag: params.get('tag') || '',
  };
}

export function App() {
  const [route, setRoute] = useState(readRoute);
  const [state, setState] = useState<IndexState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mobileGraphOpen, setMobileGraphOpen] = useState(false);
  const [allScope, setAllScope] = useState<'local' | 'all'>('all');
  useEmbedEscape(route.embed);
  useEffect(() => {
    const onRoute = () => {
      setRoute(readRoute());
      setDialogOpen(false);
    };
    window.addEventListener('hashchange', onRoute);
    window.addEventListener('popstate', onRoute);
    return () => {
      window.removeEventListener('hashchange', onRoute);
      window.removeEventListener('popstate', onRoute);
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    setState({ status: 'loading' });
    loadIndex(config.indexUrl, controller.signal)
      .then((index) => {
        if (!disposed) setState({ status: 'ready', index });
      })
      .catch((error) => {
        if (!disposed)
          setState({
            status: 'error',
            reason: error instanceof IndexLoadError ? error.reason : 'network',
          });
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      disposed = true;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [attempt]);
  const index = state.status === 'ready' ? state.index : undefined;
  const graph = useMemo(
    () => (index ? buildGraph(index) : { nodes: [], edges: [] }),
    [index],
  );
  const tags = useMemo(() => (index ? publicTags(index) : []), [index]);
  const documents = useMemo(
    () => (index ? findDocuments(index, query, route.tag) : []),
    [index, query, route.tag],
  );
  const doc = index?.documents.find(
    (candidate) => candidate.id === route.document?.id,
  );
  const focus = doc ? documentKey(doc.id) : route.focus;
  useEffect(() => {
    document.title = route.embed
      ? '연결 지도 · 아무위키'
      : doc
        ? `${doc.title} · 아무위키`
        : route.graph
          ? '연결 지도 · 아무위키'
          : '아무위키';
    if (route.embed || state.status !== 'ready') return;
    const frame = window.requestAnimationFrame(() => {
      if (route.document?.heading) {
        const heading =
          document.getElementById(headingDomId(route.document.heading)) ||
          document.getElementById(route.document.heading);
        if (heading) {
          heading.scrollIntoView({ block: 'start' });
          heading.focus({ preventScroll: true });
        }
      } else if (doc) {
        window.scrollTo({ top: 0 });
        document
          .getElementById('document-title')
          ?.focus({ preventScroll: true });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [doc, route.document?.heading, route.embed, route.graph, state.status]);
  const filterTag = (tag: string) => {
    const url = new URL(config.wikiUrl);
    if (tag) url.searchParams.set('tag', tag);
    if (
      url.origin !== window.location.origin ||
      url.pathname !== window.location.pathname
    ) {
      window.location.assign(url.href);
      return;
    }
    window.history.pushState(null, '', url);
    setRoute(readRoute());
    setQuery('');
    setDialogOpen(false);
    window.scrollTo({ top: 0 });
  };
  const status = (
    <IndexStatus
      state={state}
      retry={() => setAttempt((value) => value + 1)}
      compact={route.embed}
    />
  );

  if (route.embed)
    return (
      <main className="embed-shell" aria-label="연결 지도">
        {index ? (
          <Graph
            graph={graph}
            focus={route.focus}
            scope={route.scope}
            embed
            compact={route.scope === 'local'}
          />
        ) : (
          status
        )}
      </main>
    );

  return (
    <>
      <a
        className="skip-link"
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        본문으로 바로 가기
      </a>
      <header className="site-header">
        <div className="header-inner">
          <a
            className="brand"
            href={config.wikiUrl}
            aria-label="아무위키 처음으로"
          >
            <img src={config.iconUrl} width="68" height="68" alt="" />
            <span>
              아무위키<small>아무의 작은 백과사전</small>
            </span>
          </a>
          <nav className="main-nav" aria-label="주 메뉴">
            <a
              href={config.wikiUrl}
              aria-current={!route.graph ? 'page' : undefined}
            >
              모든 문서
            </a>
            <a
              href={graphUrl(config.wikiUrl)}
              aria-current={route.graph ? 'page' : undefined}
            >
              <Icon name="map" size={18} />
              연결 지도
            </a>
          </nav>
          <a className="blog-link" href={config.blogUrl}>
            채아무 블로그 <span aria-hidden="true">↗</span>
          </a>
        </div>
      </header>
      <main
        id="main"
        className={`page ${route.graph ? 'page--graph' : ''}`}
        tabIndex={-1}
      >
        {route.graph ? (
          <section className="map-page panel" aria-labelledby="map-page-title">
            <div className="map-page-header">
              <div>
                <p className="eyebrow">아무위키</p>
                <h1 id="map-page-title">연결 지도</h1>
              </div>
              <div className="segmented" aria-label="지도 범위">
                {focus && (
                  <button
                    type="button"
                    aria-pressed={allScope === 'local'}
                    onClick={() => setAllScope('local')}
                  >
                    주변
                  </button>
                )}
                <button
                  type="button"
                  aria-pressed={allScope === 'all'}
                  onClick={() => setAllScope('all')}
                >
                  전체
                </button>
              </div>
            </div>
            <div className="full-map">
              {index ? (
                <Graph graph={graph} focus={focus} scope={allScope} />
              ) : (
                status
              )}
            </div>
            <div className="graph-legend">
              <span>
                <i className="legend-doc" />
                문서
              </span>
              <span>
                <i className="legend-post" />
                블로그 글
              </span>
              <span>
                <i className="legend-asset" />
                자료
              </span>
            </div>
          </section>
        ) : (
          <div className="reading-layout">
            <div className="main-column">
              {state.status !== 'ready' ? (
                <div className="panel state-panel">{status}</div>
              ) : route.requestedDocument ? (
                doc ? (
                  <Document
                    doc={doc}
                    index={state.index}
                    graph={graph}
                    onTag={filterTag}
                  />
                ) : (
                  <div className="panel state-panel">
                    <div className="empty-state">
                      <span className="empty-marker" aria-hidden="true">
                        ?
                      </span>
                      <h1>문서를 찾을 수 없어요.</h1>
                      <p>주소를 확인하거나 다른 문서를 둘러보세요.</p>
                      <a className="button" href={config.wikiUrl}>
                        모든 문서 보기
                        <Icon name="arrow" size={17} />
                      </a>
                    </div>
                  </div>
                )
              ) : (
                <>
                  <section className="list-heading">
                    <p className="eyebrow">기록에서 기록으로</p>
                    <h1>{route.tag ? `#${route.tag}` : '모든 문서'}</h1>
                    <p>궁금한 개념부터, 이어지는 생각까지.</p>
                  </section>
                  <form
                    className="search"
                    role="search"
                    onSubmit={(event) => event.preventDefault()}
                  >
                    <Icon name="search" size={22} />
                    <label className="sr-only" htmlFor="wiki-search">
                      문서 검색
                    </label>
                    <input
                      id="wiki-search"
                      type="search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="어떤 이야기가 궁금한가요?"
                      autoComplete="off"
                    />
                    {query && (
                      <button
                        type="button"
                        className="icon-button"
                        aria-label="검색어 지우기"
                        onClick={() => setQuery('')}
                      >
                        <Icon name="close" size={18} />
                      </button>
                    )}
                  </form>
                  <div className="list-toolbar">
                    <p role="status">
                      {query ? '검색 결과' : '문서'}{' '}
                      <strong>{documents.length}</strong>
                    </p>
                    {route.tag ? (
                      <button
                        className="clear-filter"
                        type="button"
                        onClick={() => filterTag('')}
                      >
                        태그 해제 <Icon name="close" size={14} />
                      </button>
                    ) : (
                      <span>최근 기록 순</span>
                    )}
                  </div>
                  {!state.index.documents.length ? (
                    <div className="panel empty-state home-empty">
                      <img
                        src={config.iconUrl}
                        width="142"
                        height="142"
                        alt=""
                      />
                      <h2>첫 문서를 기다리고 있어요.</h2>
                      <p>공개한 기록이 이곳에 하나씩 모여요.</p>
                    </div>
                  ) : !documents.length ? (
                    <div className="panel empty-state">
                      <Icon name="search" size={34} />
                      <h2>찾는 문서가 없어요.</h2>
                      <p>다른 검색어나 태그로 찾아보세요.</p>
                      <button
                        type="button"
                        className="button"
                        onClick={() => {
                          setQuery('');
                          filterTag('');
                        }}
                      >
                        다시 둘러보기
                      </button>
                    </div>
                  ) : (
                    <section className="document-list" aria-label="문서 목록">
                      {documents.map((item) => (
                        <article className="document-card" key={item.id}>
                          <div className="card-meta">
                            <span className={`kind-badge kind-${item.kind}`}>
                              {kindLabels[item.kind]}
                            </span>
                            <time dateTime={item.updated}>
                              {new Date(item.updated).toLocaleDateString(
                                'ko-KR',
                                {
                                  year: 'numeric',
                                  month: '2-digit',
                                  day: '2-digit',
                                  timeZone: 'Asia/Seoul',
                                },
                              )}
                            </time>
                          </div>
                          <h2>
                            <a href={documentUrl(item.id, config.wikiUrl)}>
                              {item.title}
                              <Icon name="arrow" size={20} />
                            </a>
                          </h2>
                          {item.body && <p>{excerpt(item.body)}</p>}
                          <div className="card-tags">
                            {item.tags.map((tag) => (
                              <button
                                type="button"
                                className="tag"
                                key={tag}
                                onClick={() => filterTag(tag)}
                              >
                                #{tag}
                              </button>
                            ))}
                          </div>
                        </article>
                      ))}
                    </section>
                  )}
                </>
              )}
            </div>
            <aside className="sidebar" aria-label="연결과 태그">
              <section
                className={`sidebar-map panel ${mobileGraphOpen ? 'is-open' : ''}`}
              >
                <div className="sidebar-title">
                  <h2>{doc ? '이 문서의 연결' : '연결 지도'}</h2>
                  <button
                    type="button"
                    className="icon-button desktop-expand"
                    aria-label="연결 지도 크게 보기"
                    onClick={() => setDialogOpen(true)}
                    disabled={!index}
                  >
                    <Icon name="expand" size={17} />
                  </button>
                  <button
                    type="button"
                    className="icon-button mobile-toggle"
                    aria-label={
                      mobileGraphOpen ? '연결 지도 접기' : '연결 지도 펼치기'
                    }
                    aria-expanded={mobileGraphOpen}
                    aria-controls="sidebar-map-body"
                    onClick={() => setMobileGraphOpen((value) => !value)}
                  >
                    <Icon name="chevron" />
                  </button>
                </div>
                <div id="sidebar-map-body" className="sidebar-map-body">
                  <div className="mini-map">
                    {index ? (
                      <Graph
                        graph={graph}
                        scope="local"
                        focus={focus}
                        compact
                      />
                    ) : (
                      <p className="mini-status">
                        {state.status === 'loading'
                          ? '불러오는 중…'
                          : '지도를 불러오지 못했어요.'}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="map-open-link"
                    onClick={() => setDialogOpen(true)}
                    disabled={!index}
                  >
                    지도로 둘러보기 <Icon name="expand" size={14} />
                  </button>
                </div>
              </section>
              <section className="tag-section" aria-labelledby="tag-title">
                <div className="sidebar-title">
                  <h2 id="tag-title">태그</h2>
                  {!!tags.length && (
                    <span className="count">{tags.length}</span>
                  )}
                </div>
                {tags.length ? (
                  <div className="tag-cloud">
                    <button
                      type="button"
                      className={`tag ${!route.tag ? 'is-active' : ''}`}
                      onClick={() => filterTag('')}
                    >
                      전체
                    </button>
                    {tags.map((tag) => (
                      <button
                        type="button"
                        className={`tag ${route.tag === tag ? 'is-active' : ''}`}
                        aria-pressed={route.tag === tag}
                        key={tag}
                        onClick={() => filterTag(tag)}
                      >
                        #{tag}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="quiet">
                    {state.status === 'ready'
                      ? '문서와 함께 모일 거예요.'
                      : '—'}
                  </p>
                )}
              </section>
              <a className="sidebar-blog" href={config.blogUrl}>
                <strong>
                  채아무 블로그 <span aria-hidden="true">↗</span>
                </strong>
              </a>
            </aside>
          </div>
        )}
      </main>
      <footer className="site-footer">
        <a href={config.wikiUrl}>아무위키</a>
        <a href={config.blogUrl}>채아무 ↗</a>
      </footer>
      {dialogOpen && index && (
        <GraphDialog
          graph={graph}
          focus={focus}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </>
  );
}

function IndexStatus({
  state,
  retry,
  compact,
}: {
  state: IndexState;
  retry: () => void;
  compact: boolean;
}) {
  if (state.status === 'ready') return null;
  if (state.status === 'loading')
    return (
      <div
        className={`load-state ${compact ? 'is-compact' : ''}`}
        role="status"
      >
        <span className="loading-dot" />
        <p>문서를 불러오고 있어요.</p>
      </div>
    );
  const messages = {
    unpublished: [
      '아직 공개본이 없어요.',
      '첫 기록이 공개되면 이곳에서 만나요.',
    ],
    network: ['문서를 불러오지 못했어요.', '잠시 후 다시 열어 보세요.'],
    invalid: [
      '공개본을 읽을 수 없어요.',
      '새 공개본이 준비되면 다시 확인해 주세요.',
    ],
  };
  return (
    <div
      className={`empty-state error-state ${compact ? 'is-compact' : ''}`}
      role="alert"
    >
      {!compact && (
        <Icon
          name={state.reason === 'unpublished' ? 'map' : 'reset'}
          size={34}
        />
      )}
      <h1>{messages[state.reason][0]}</h1>
      {!compact && <p>{messages[state.reason][1]}</p>}
      <button className="button" type="button" onClick={retry}>
        다시 불러오기
        <Icon name="reset" size={15} />
      </button>
    </div>
  );
}
