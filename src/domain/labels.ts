import type { GraphLayout, GraphNode } from './graph';

// Compact labels: about 10px glyphs on a 1.25em line pitch, kept 8px apart.
export const LABEL_CHARACTER_WIDTH = 11;
export const LABEL_LINE_HEIGHT = 13;
const LABEL_GAP = 8;

export type CompactLabel = {
  lines: string[];
  /** Horizontal shift of the label centre from its node, in screen pixels. */
  shift: number;
};

export type CompactLabelPlan = {
  /** Drawing-to-screen scale of the compact map under the initial camera. */
  fit: number;
  labels: Map<string, CompactLabel>;
  /** A name could break onto a second line if the drawing left room below it. */
  needsRoomBelow: boolean;
};

/**
 * Breaks a name at the space that best balances two lines, if both fit. On a tie
 * the later space wins, keeping a leading phrase such as "채아무 블로그" together.
 */
export function splitTitle(
  title: string,
  maxCharacters: number,
): [string, string] | null {
  const characters = Array.from(title);
  let best: [string, string] | null = null;
  let bestLength = Number.POSITIVE_INFINITY;
  for (let index = 1; index < characters.length - 1; index++) {
    if (characters[index] !== ' ') continue;
    const first = characters.slice(0, index).join('').trim();
    const second = characters.slice(index + 1).join('').trim();
    const longest = Math.max(
      Array.from(first).length,
      Array.from(second).length,
    );
    if (first && second && longest <= maxCharacters && longest <= bestLength) {
      best = [first, second];
      bestLength = longest;
    }
  }
  return best;
}

/** The compact drawing scale; each extra label line reserves room below the lowest node. */
export function compactFit(
  layout: GraphLayout,
  width: number,
  drawingHeight: number,
  extraLines = 0,
): number {
  const nodeSpanHeight = Math.max(80, layout.height - 160);
  return Math.max(
    0.02,
    Math.min(
      Math.max(20, width - 72) / Math.max(100, layout.width - 220),
      // Below ~0.5x the label offset stops shrinking at 18px; the lowest
      // label then needs 18px + 4px descent + 4px clearance (and any second
      // line) under the lowest node, in each centred margin.
      Math.max(20, drawingHeight - 52 - 2 * LABEL_LINE_HEIGHT * extraLines) /
        nodeSpanHeight,
      // Above ~0.5x a label sits 35 drawing units below its node, so its
      // offset grows with the scale. Each centred margin must hold that
      // offset plus ~8px of text descent and halo (and any second line),
      // keeping the lowest label above the controls.
      Math.max(20, drawingHeight - 16 - 2 * LABEL_LINE_HEIGHT * extraLines) /
        (nodeSpanHeight + 70),
      1.3,
    ),
  );
}

/**
 * Places compact map labels in screen pixels under the initial camera, so names
 * do not change while panning. A name that does not fit moves inward from the
 * frame edge, then breaks at a space onto a second line, and only then is
 * shortened (tight spots keep 8 characters). Labels sharing a band split the
 * space between their nodes, and no label covers another node.
 */
export function placeCompactLabels(
  nodes: readonly GraphNode[],
  layout: GraphLayout,
  width: number,
  drawingHeight: number,
  fit: number,
): CompactLabelPlan {
  const originX = (width - layout.width * fit) / 2;
  const originY = (drawingHeight - layout.height * fit) / 2;
  const offset = Math.max(35 * fit, 18);
  const labelTop = offset - 10;
  const labelBottom = (lines: number) =>
    offset + 4 + (lines - 1) * LABEL_LINE_HEIGHT;
  const nodeRadius = 12 * fit + 2;
  const points = nodes.map((node) => {
    const point = layout.positions.get(node.key)!;
    return {
      key: node.key,
      title: node.title,
      x: originX + point.x * fit,
      y: originY + point.y * fit,
    };
  });
  const labels = new Map<string, CompactLabel>();
  let needsRoomBelow = false;
  // The second pass sees which neighbouring labels took a second line.
  for (let pass = 0; pass < 2; pass++) {
    needsRoomBelow = false;
    const lineCounts = new Map(
      [...labels].map(([key, label]) => [key, label.lines.length]),
    );
    for (const a of points) {
      const room = (lines: number) => {
        const top = a.y + labelTop;
        const bottom = a.y + labelBottom(lines);
        let lo = 4;
        let hi = width - 4;
        for (const b of points) {
          if (b === a) continue;
          const bTop = b.y + labelTop;
          const bBottom = b.y + labelBottom(lineCounts.get(b.key) ?? 1);
          if (bTop < bottom && bBottom > top) {
            const middle = (a.x + b.x) / 2;
            if (b.x >= a.x) hi = Math.min(hi, middle - LABEL_GAP / 2);
            else lo = Math.max(lo, middle + LABEL_GAP / 2);
          }
          if (b.y + nodeRadius > top && b.y - nodeRadius < bottom) {
            if (b.x >= a.x) hi = Math.min(hi, b.x - nodeRadius - LABEL_GAP / 2);
            else lo = Math.max(lo, b.x + nodeRadius + LABEL_GAP / 2);
          }
        }
        hi = Math.max(lo, hi);
        return {
          lo,
          hi,
          capacity: Math.floor((hi - lo) / LABEL_CHARACTER_WIDTH),
          fitsAbove: bottom <= drawingHeight - 4,
        };
      };
      const place = (
        lines: string[],
        span: { lo: number; hi: number },
      ): CompactLabel => {
        const labelWidth =
          Math.max(...lines.map((line) => Array.from(line).length)) *
          LABEL_CHARACTER_WIDTH;
        // A label wider than its room stays centred on its node.
        if (labelWidth >= span.hi - span.lo) return { lines, shift: 0 };
        const centre = Math.min(
          Math.max(a.x, span.lo + labelWidth / 2),
          span.hi - labelWidth / 2,
        );
        return { lines, shift: Math.round(centre - a.x) };
      };
      const characters = Array.from(a.title);
      const single = room(1);
      let label: CompactLabel;
      if (characters.length <= single.capacity) label = place([a.title], single);
      else {
        const double = room(2);
        const split = splitTitle(a.title, double.capacity);
        if (split && double.fitsAbove) label = place(split, double);
        else {
          if (split) needsRoomBelow = true;
          // One character is reserved for the ellipsis of a shortened name.
          const limit = Math.max(8, Math.min(16, single.capacity - 1));
          label = place(
            [
              characters.length > limit
                ? characters.slice(0, limit).join('') + '…'
                : a.title,
            ],
            single,
          );
        }
      }
      labels.set(a.key, label);
    }
  }
  return { fit, labels, needsRoomBelow };
}

/** Plans compact labels, shrinking the drawing once if a second line needs room below. */
export function planCompactLabels(
  nodes: readonly GraphNode[],
  layout: GraphLayout,
  width: number,
  drawingHeight: number,
): CompactLabelPlan {
  const plan = placeCompactLabels(
    nodes,
    layout,
    width,
    drawingHeight,
    compactFit(layout, width, drawingHeight),
  );
  if (!plan.needsRoomBelow) return plan;
  return placeCompactLabels(
    nodes,
    layout,
    width,
    drawingHeight,
    compactFit(layout, width, drawingHeight, 1),
  );
}

