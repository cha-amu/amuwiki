import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

// Apply the embed sizing boundary before the first render (including loading states).
document.documentElement.dataset.embed =
  new URLSearchParams(window.location.search).get('embed') === 'graph'
    ? 'graph'
    : '';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
