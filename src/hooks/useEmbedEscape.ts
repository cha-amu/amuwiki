import { useEffect } from 'react';
import { config } from '../config';
import { embedParentOrigin } from '../domain/embed';

export function useEmbedEscape(embedded: boolean) {
  useEffect(() => {
    if (!embedded || window.parent === window) return;
    const targetOrigin = embedParentOrigin(
      window.location.href,
      config.blogUrl,
      document.referrer,
    );
    if (!targetOrigin) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      window.parent.postMessage({ type: 'amuwiki:escape' }, targetOrigin);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [embedded]);
}
