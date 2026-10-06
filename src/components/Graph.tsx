import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { config } from '../config';
import { layoutGraph, selectGraph, zoomCamera } from '../domain/graph';
import type { Camera, GraphNode, Position, WikiGraph } from '../domain/graph';
import { documentUrl } from '../domain/navigation';
import { kindLabels, safeUrl } from '../domain/wiki';
import { Icon } from './Icons';

type Props = {
  graph: WikiGraph;
  focus?: string;
  scope: 'local' | 'all';
  embed?: boolean;
  compact?: boolean;
};
type Drag = {
  id: number;
  start: Position;
  last: Position;
  node?: string;
  moved: boolean;
};
const initialCamera: Camera = { x: 0, y: 0, zoom: 1 };
const isResource = (node: GraphNode) =>
  node.kind === 'post' || node.kind === 'asset';
const nodeHref = (node: GraphNode) =>
  isResource(node)
    ? safeUrl(node.url || '', config.blogUrl)
    : documentUrl(node.id, config.wikiUrl);

export function Graph({
  graph,
  focus,
  scope,
  embed = false,
  compact = false,
}: Props) {
  const selected = useMemo(
    () => selectGraph(graph, scope, focus),
    [graph, scope, focus],
  );
  const layout = useMemo(() => layoutGraph(selected, focus), [selected, focus]);
  const container = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 500, height: 320 });
  const [camera, setCamera] = useState<Camera>(initialCamera);
  const [movedPositions, setMovedPositions] = useState<Map<string, Position>>(
    new Map(),
  );
  const [active, setActive] = useState<string | undefined>(focus);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const helpId = useId();
  const instanceId = useId().replace(/:/gu, '');
  // Small embeds reserve screen-space margins for readable labels and controls;
  // merely scaling the entire desktop drawing can clip a label at 190px wide.
  const drawingHeight = compact ? Math.max(40, size.height - 42) : size.height;
  const fit = compact
    ? Math.max(
        0.02,
        Math.min(
          Math.max(20, size.width - 110) / Math.max(100, layout.width - 220),
          Math.max(20, drawingHeight - 80) / Math.max(80, layout.height - 160),
          1.3,
        ),
      )
    : Math.min(size.width / layout.width, size.height / layout.height) * 0.9;
  const origin = {
    x: (size.width - layout.width * fit) / 2,
    y: (drawingHeight - layout.height * fit) / 2,
  };
  const transform = `translate(${camera.x} ${camera.y}) scale(${camera.zoom}) translate(${origin.x} ${origin.y}) scale(${fit})`;
  const position = (key: string) =>
    movedPositions.get(key) || layout.positions.get(key)!;
  const reset = () => {
    setCamera(initialCamera);
    setMovedPositions(new Map());
  };
  const zoom = (factor: number) =>
    setCamera((current) =>
      zoomCamera(current, factor, { x: size.width / 2, y: size.height / 2 }),
    );

  useEffect(() => {
    reset();
    setActive(focus);
  }, [layout, focus]);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width && height)
        setSize((current) =>
          current.width === width && current.height === height
            ? current
            : { width, height },
        );
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      drag.current = null;
    };
  }, []);
  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      // A small map never steals the document's ordinary vertical scroll.
      if (compact && !event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      setCamera((current) =>
        zoomCamera(
          current,
          Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * 0.004),
          { x: event.clientX - rect.left, y: event.clientY - rect.top },
        ),
      );
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [compact, selected.nodes.length]);

  const startDrag = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 || drag.current) return;
    const target = event.target as Element;
    const node =
      target.closest('[data-node-key]')?.getAttribute('data-node-key') ||
      undefined;
    suppressClick.current = false;
    drag.current = {
      id: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      last: { x: event.clientX, y: event.clientY },
      node,
      moved: false,
    };
    // Keep an ordinary click on its anchor. Capturing immediately on the SVG
    // would retarget pointerup/click to the canvas and prevent navigation.
    (target.closest('a') || event.currentTarget).setPointerCapture(
      event.pointerId,
    );
  };
  const moveDrag = (event: PointerEvent<SVGSVGElement>) => {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    if (
      !current.moved &&
      Math.hypot(
        event.clientX - current.start.x,
        event.clientY - current.start.y,
      ) < 5
    )
      return;
    current.moved = true;
    const dx = event.clientX - current.last.x;
    const dy = event.clientY - current.last.y;
    current.last = { x: event.clientX, y: event.clientY };
    if (current.node) {
      const key = current.node;
      setMovedPositions((previous) => {
        const next = new Map(previous);
        const point = previous.get(key) || layout.positions.get(key)!;
        next.set(key, {
          x: point.x + dx / (fit * camera.zoom),
          y: point.y + dy / (fit * camera.zoom),
        });
        return next;
      });
    } else
      setCamera((previous) => ({
        ...previous,
        x: previous.x + dx,
        y: previous.y + dy,
      }));
  };
  const endDrag = (event: PointerEvent<SVGSVGElement>) => {
    if (drag.current?.id !== event.pointerId) return;
    suppressClick.current = drag.current.moved;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const keyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    const step = event.shiftKey ? 12 : 36;
    const offsets: Record<string, number[]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const offset = offsets[event.key];
    if (offset) {
      event.preventDefault();
      const key = (event.target as Element)
        .closest('[data-node-key]')
        ?.getAttribute('data-node-key');
      if (event.shiftKey && key) {
        const point = position(key);
        setMovedPositions((previous) =>
          new Map(previous).set(key, {
            x: point.x + offset[0] / fit,
            y: point.y + offset[1] / fit,
          }),
        );
      } else
        setCamera((current) => ({
          ...current,
          x: current.x + offset[0],
          y: current.y + offset[1],
        }));
    } else if (['+', '=', '-', '0', 'Home'].includes(event.key)) {
      event.preventDefault();
      if (event.key === '0' || event.key === 'Home') reset();
      else zoom(event.key === '-' ? 1 / 1.25 : 1.25);
    }
  };
  const revealNode = (key: string) => {
    setActive(key);
    const point = position(key);
    const scale = Math.max(1, Math.min(6, 1 / fit));
    setCamera({
      zoom: scale,
      x: size.width / 2 - (origin.x + point.x * fit) * scale,
      y: size.height / 2 - (origin.y + point.y * fit) * scale,
    });
    svg.current
      ?.querySelector<SVGAElement>(
        `[data-node-index="${selected.nodes.findIndex((node) => node.key === key)}"]`,
      )
      ?.focus();
  };
  const missingFocus =
    scope === 'local' &&
    !!focus &&
    !graph.nodes.some((node) => node.key === focus);

  return (
    <div className={`graph ${compact ? 'graph--compact' : ''}`} ref={container}>
      {!selected.nodes.length ? (
        <div className="graph-empty" role="status">
          <Icon name="map" size={28} />
          <span>
            {missingFocus
              ? '이 항목을 찾을 수 없어요.'
              : scope === 'local' && !focus && graph.nodes.length
                ? '문서를 선택하면 연결이 보여요.'
                : '아직 공개된 문서가 없어요.'}
          </span>
        </div>
      ) : (
        <>
          <p className="sr-only" id={helpId}>
            방향키로 지도를 이동하고, 더하기와 빼기로 확대하거나 축소할 수
            있어요. 탭으로 항목을 선택하고 엔터로 열어요. 시프트와 방향키로
            선택한 항목을 옮겨요.
          </p>
          <svg
            ref={svg}
            className="graph-canvas"
            viewBox={`0 0 ${size.width} ${size.height}`}
            role="group"
            aria-label="연결 지도"
            aria-describedby={helpId}
            tabIndex={0}
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onLostPointerCapture={() => {
              drag.current = null;
            }}
            onKeyDown={keyDown}
            onClickCapture={(event) => {
              if (suppressClick.current) {
                event.preventDefault();
                event.stopPropagation();
                suppressClick.current = false;
              }
            }}
          >
            <defs>
              <marker
                id={`${instanceId}-arrow`}
                viewBox="0 0 8 8"
                refX="17"
                refY="4"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M1 1 7 4 1 7" fill="none" stroke="#8f9e92" />
              </marker>
            </defs>
            <g data-camera="true" transform={transform}>
              <g className="graph-edges" aria-hidden="true">
                {selected.edges.map((edge) => {
                  const a = position(edge.source);
                  const b = position(edge.target);
                  return (
                    <line
                      key={edge.key}
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      className={
                        edge.source === active || edge.target === active
                          ? 'is-active'
                          : ''
                      }
                      markerEnd={
                        edge.type === 'reference' || edge.type === 'related'
                          ? undefined
                          : `url(#${instanceId}-arrow)`
                      }
                    />
                  );
                })}
              </g>
              {selected.nodes.map((node, index) => {
                const point = position(node.key);
                const isFocus = node.key === focus;
                const selectedNode = node.key === active;
                const narrow = compact || size.width < 560;
                const titleCharacters = Array.from(node.title);
                const titleLimit = narrow ? 18 : 20;
                const visibleTitle =
                  titleCharacters.length > titleLimit
                    ? `${titleCharacters.slice(0, titleLimit - 1).join('')}…`
                    : node.title;
                const labelLines =
                  narrow && visibleTitle.length > 9
                    ? [visibleTitle.slice(0, 9), visibleTitle.slice(9)]
                    : [visibleTitle];
                const fontSize = compact
                  ? (isFocus ? 11 : 10) / fit
                  : Math.max(isFocus ? 21 : 19, 11 / (fit * camera.zoom));
                const labelVisible =
                  selected.nodes.length <= 30 ||
                  fit * camera.zoom >= 0.65 ||
                  isFocus ||
                  selectedNode;
                return (
                  <g
                    key={node.key}
                    transform={`translate(${point.x} ${point.y})`}
                  >
                    <a
                      href={nodeHref(node)}
                      target={embed ? '_top' : undefined}
                      rel={isResource(node) ? 'noopener noreferrer' : undefined}
                      data-node-key={node.key}
                      data-node-index={index}
                      data-kind={node.kind}
                      className={`graph-node ${isFocus ? 'is-focus' : ''} ${selectedNode ? 'is-selected' : ''}`}
                      aria-label={`${node.title} · ${kindLabels[node.kind]}`}
                      tabIndex={0}
                      onFocus={() => setActive(node.key)}
                      onMouseEnter={() => setActive(node.key)}
                    >
                      <title>{`${node.title} · ${kindLabels[node.kind]}`}</title>
                      <circle className="graph-node-hit" r="24" />
                      {isFocus && (
                        <circle className="graph-focus-ring" r="20" />
                      )}
                      {isResource(node) ? (
                        <rect
                          className="graph-node-shape"
                          x="-11"
                          y="-11"
                          width="22"
                          height="22"
                          rx={node.kind === 'post' ? 7 : 3}
                        />
                      ) : (
                        <circle
                          className="graph-node-shape"
                          r={isFocus ? 12 : 9}
                        />
                      )}
                      {labelVisible && (
                        <text
                          y="35"
                          textAnchor="middle"
                          style={{ fontSize }}
                          className={
                            isFocus ? 'graph-label is-focus' : 'graph-label'
                          }
                        >
                          {labelLines.map((line, lineIndex) => (
                            <tspan
                              x="0"
                              dy={lineIndex ? '1.25em' : '0'}
                              key={lineIndex}
                            >
                              {line}
                            </tspan>
                          ))}
                        </text>
                      )}
                    </a>
                  </g>
                );
              })}
            </g>
          </svg>
          <div className="graph-controls" aria-label="지도 조절">
            <button
              type="button"
              aria-label="지도 축소"
              title="축소 (−)"
              onClick={() => zoom(1 / 1.25)}
              disabled={camera.zoom <= 0.2}
            >
              −
            </button>
            <output aria-label="지도 배율">
              {Math.round(camera.zoom * 100)}%
            </output>
            <button
              type="button"
              aria-label="지도 확대"
              title="확대 (+)"
              onClick={() => zoom(1.25)}
              disabled={camera.zoom >= 6}
            >
              +
            </button>
            <button
              type="button"
              aria-label="지도 처음 위치"
              title="처음 위치 (0)"
              onClick={reset}
            >
              <Icon name="reset" size={16} />
            </button>
          </div>
          {!compact && (
            <div className="graph-picker">
              <label className="sr-only" htmlFor={`${instanceId}-picker`}>
                지도의 항목 선택
              </label>
              <select
                id={`${instanceId}-picker`}
                value=""
                onChange={(event) => revealNode(event.target.value)}
              >
                <option value="" disabled>
                  항목 찾기
                </option>
                {selected.nodes.map((node) => (
                  <option key={node.key} value={node.key}>
                    {node.title}
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      )}
    </div>
  );
}
