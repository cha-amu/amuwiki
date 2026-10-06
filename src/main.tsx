import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { config } from './config';
import { publicRoute } from './domain/navigation';
import './styles.css';

const route = publicRoute(window.location.href, config.wikiUrl);
if (route.kind === 'redirect') {
  // Replace the legacy entry in history, before mounting or fetching the index.
  window.location.replace(route.url);
} else {
  // Bound the iframe before rendering, including loading and failure states.
  document.documentElement.dataset.embed = 'graph';
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App focus={route.focus} scope={route.scope} />
    </StrictMode>,
  );
}
