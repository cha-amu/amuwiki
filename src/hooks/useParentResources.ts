import { useEffect, useReducer } from 'react';
import { config } from '../config';
import {
  embedParentOrigin,
  PARENT_RESOURCES_TIMEOUT_MS,
  resourceKeysFromMessage,
  updateParentResources,
} from '../domain/embed';

const noResources: ReadonlySet<string> = new Set();

export function useParentResources(enabled: boolean) {
  const required = enabled && window.parent !== window;
  const [state, dispatch] = useReducer(updateParentResources, {
    status: 'waiting',
  });

  useEffect(() => {
    if (!required) return;
    const targetOrigin = embedParentOrigin(
      window.location.href,
      config.blogUrl,
      document.referrer,
    );
    const timeout = window.setTimeout(
      () => dispatch({ type: 'timeout' }),
      PARENT_RESOURCES_TIMEOUT_MS,
    );
    const onMessage = (event: MessageEvent) => {
      const keys = resourceKeysFromMessage(
        event,
        window.parent,
        targetOrigin,
      );
      if (keys === undefined) return;
      window.clearTimeout(timeout);
      dispatch({ type: 'received', keys });
    };
    window.addEventListener('message', onMessage);
    if (targetOrigin)
      window.parent.postMessage({ type: 'amuwiki:ready' }, targetOrigin);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener('message', onMessage);
    };
  }, [required]);

  return {
    waiting: required && state.status === 'waiting',
    allowedKeys: required
      ? state.status === 'ready'
        ? state.keys
        : noResources
      : undefined,
  };
}
