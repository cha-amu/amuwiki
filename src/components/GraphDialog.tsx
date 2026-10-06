import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { WikiGraph } from '../domain/graph';
import { Graph } from './Graph';
import { Icon } from './Icons';

export function GraphDialog({
  graph,
  focus,
  onClose,
}: {
  graph: WikiGraph;
  focus?: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [scope, setScope] = useState<'local' | 'all'>(focus ? 'local' : 'all');
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const previous =
      document.activeElement instanceof HTMLElement ||
      document.activeElement instanceof SVGElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    const scroll = { left: window.scrollX, top: window.scrollY };
    document.body.style.overflow = 'hidden';
    element.showModal();
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      window.scrollTo(scroll);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <dialog
      ref={dialog}
      className="graph-dialog"
      aria-labelledby="graph-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const box = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < box.left ||
            event.clientX > box.right ||
            event.clientY < box.top ||
            event.clientY > box.bottom
          )
            onClose();
        }
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        // Include SVG links: browsers disagree about them in native dialog tab cycling.
        const focusable = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement | SVGElement>(
            'button:not(:disabled), a[href], select, [tabindex="0"]',
          ),
        ).filter((element) => element.getClientRects().length > 0);
        const first = focusable[0];
        const last = focusable.at(-1);
        if (!first || !last) {
          event.preventDefault();
          return;
        }
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      <div className="dialog-header">
        <h2 id="graph-dialog-title">연결 지도</h2>
        <div className="segmented" aria-label="지도 범위">
          {focus && (
            <button
              type="button"
              aria-pressed={scope === 'local'}
              onClick={() => setScope('local')}
            >
              주변
            </button>
          )}
          <button
            type="button"
            aria-pressed={scope === 'all'}
            onClick={() => setScope('all')}
          >
            전체
          </button>
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label="지도 닫기"
          onClick={onClose}
          autoFocus
        >
          <Icon name="close" />
        </button>
      </div>
      <div className="dialog-map">
        <Graph graph={graph} scope={scope} focus={focus} />
      </div>
      <div className="graph-legend" aria-label="지도 범례">
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
    </dialog>,
    document.body,
  );
}
