import { useEffect, useMemo, useState } from 'react';
import { config } from './config';
import { buildGraph } from './domain/graph';
import { IndexLoadError, loadIndex } from './domain/validation';
import type { LoadFailure } from './domain/validation';
import type { PublicWikiIndex } from './domain/wiki';
import { Graph } from './components/Graph';
import { Icon } from './components/Icons';
import { useEmbedEscape } from './hooks/useEmbedEscape';

type IndexState =
  | { status: 'loading' }
  | { status: 'ready'; index: PublicWikiIndex }
  | { status: 'error'; reason: LoadFailure };

// The blog owns all page layout and document rendering. This app only mounts
// for ?embed=graph; main.tsx redirects visitors before any index is fetched.
export function App({
  focus,
  scope,
}: {
  focus?: string;
  scope: 'local' | 'all';
}) {
  const [state, setState] = useState<IndexState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEmbedEscape(true);
  useEffect(() => {
    document.title = '연결 지도 · 채아무 위키';
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

  return (
    <main className="embed-shell" aria-label="연결 지도">
      {index ? (
        <Graph
          graph={graph}
          focus={focus}
          scope={scope}
          embed
          compact={scope === 'local'}
        />
      ) : (
        <IndexStatus
          state={state}
          retry={() => setAttempt((value) => value + 1)}
        />
      )}
    </main>
  );
}

function IndexStatus({
  state,
  retry,
}: {
  state: IndexState;
  retry: () => void;
}) {
  if (state.status === 'ready') return null;
  if (state.status === 'loading')
    return (
      <div className="load-state" role="status">
        <span className="loading-dot" />
        <p>문서를 불러오고 있어요.</p>
      </div>
    );
  const messages = {
    unpublished: '아직 공개본이 없어요.',
    network: '문서를 불러오지 못했어요.',
    invalid: '공개본을 읽을 수 없어요.',
  };
  return (
    <div className="error-state" role="alert">
      <h1>{messages[state.reason]}</h1>
      <button className="button" type="button" onClick={retry}>
        다시 불러오기
        <Icon name="reset" size={15} />
      </button>
    </div>
  );
}
