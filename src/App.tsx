import { useEffect, useMemo, useState } from 'react';
import { config } from './config';
import { buildGraph, filterGraphResources } from './domain/graph';
import { graphMessages } from './domain/i18n';
import type { Language } from './domain/i18n';
import { IndexLoadError, loadIndex } from './domain/validation';
import type { LoadFailure } from './domain/validation';
import type { PublicWikiIndex } from './domain/wiki';
import { Graph } from './components/Graph';
import { Icon } from './components/Icons';
import { useEmbedEscape } from './hooks/useEmbedEscape';
import { useParentResources } from './hooks/useParentResources';

type IndexState =
  | { status: 'loading' }
  | { status: 'ready'; index: PublicWikiIndex }
  | { status: 'error'; reason: LoadFailure };

// The blog owns all page layout and document rendering. This app only mounts
// for ?embed=graph; main.tsx redirects visitors before any index is fetched.
export function App({
  focus,
  scope,
  compact = scope === 'local',
  resourcesFromParent = false,
  lang = 'ko',
}: {
  focus?: string;
  scope: 'local' | 'all';
  compact?: boolean;
  resourcesFromParent?: boolean;
  lang?: Language;
}) {
  const [state, setState] = useState<IndexState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const messages = graphMessages[lang];
  const resources = useParentResources(resourcesFromParent);
  useEmbedEscape(true);
  useEffect(() => {
    document.title = messages.documentTitle;
  }, [messages]);
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
            reason:
              error instanceof IndexLoadError ? error.reason : 'network',
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
  const visibleGraph = useMemo(
    () => filterGraphResources(graph, resources.allowedKeys),
    [graph, resources.allowedKeys],
  );

  return (
    <main className="embed-shell" aria-label={messages.map}>
      {index && !resources.waiting ? (
        <Graph
          graph={visibleGraph}
          focus={focus}
          scope={scope}
          embed
          compact={compact}
          lang={lang}
        />
      ) : (
        <IndexStatus
          state={state.status === 'ready' ? { status: 'loading' } : state}
          lang={lang}
          retry={() => setAttempt((value) => value + 1)}
        />
      )}
    </main>
  );
}

function IndexStatus({
  state,
  retry,
  lang,
}: {
  state: IndexState;
  retry: () => void;
  lang: Language;
}) {
  const messages = graphMessages[lang];
  if (state.status === 'ready') return null;
  if (state.status === 'loading')
    return (
      <div className="load-state" role="status">
        <span className="loading-dot" />
        <p>{messages.loading}</p>
      </div>
    );
  return (
    <div className="error-state" role="alert">
      <h1>{messages.errors[state.reason]}</h1>
      <button className="button" type="button" onClick={retry}>
        {messages.retry}
        <Icon name="reset" size={15} />
      </button>
    </div>
  );
}
