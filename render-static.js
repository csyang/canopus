/**
 * render-static.js
 * Canopus — Static SVG Renderer
 *
 * Generates a standalone SVG string from a post-layout ELK graph.
 * No React, no JSX, no browser dependencies — runs cleanly in Node.
 * Imports visual tokens from tokens.js so the static output is visually
 * consistent with the interactive Electron renderer.
 *
 * The render pipeline:
 *   absolutised layout result → renderStaticSvg() → SVG string
 *
 * Usage:
 *   import { renderStaticSvg, absolutiseAndFlatten } from './render-static.js';
 *
 *   const elkGraph  = manifestToElk(manifest);
 *   const laid      = await new ELK().layout(elkGraph);
 *   const { nodes, edges } = absolutiseAndFlatten(laid);
 *   const svg       = renderStaticSvg(nodes, edges, manifest.name);
 *   fs.writeFileSync('output.svg', svg, 'utf8');
 */

import {
  NODE_STYLE,
  EDGE_STYLE,
  CROSS_BOUNDARY_OVERLAY,
  TYPOGRAPHY,
  SURFACE,
  ARROWHEAD_SIZE,
  PORT_RADIUS,
  LABEL_PADDING,
} from './renderer/tokens.js';

// ─────────────────────────────────────────────────────────────────────────────
// Coordinate absolutisation (shared logic with CanopusCanvas)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert ELK's relative coordinates (each node relative to its parent)
 * into absolute SVG coordinates. Flattens the tree into two arrays.
 *
 * Mutates the layouted graph in-place (safe — ELK produces a fresh object).
 * Returns { nodes, edges } both ready for rendering.
 */
export function absolutiseAndFlatten(
  elkNode,
  parentX = 0,
  parentY = 0,
  nodes   = [],
  edges   = [],
) {
  const isRoot = elkNode.id === '__root__';

  if (!isRoot) {
    elkNode.x = (elkNode.x ?? 0) + parentX;
    elkNode.y = (elkNode.y ?? 0) + parentY;

    if (elkNode.ports) {
      for (const port of elkNode.ports) {
        port.absX = elkNode.x + (port.x ?? 0);
        port.absY = elkNode.y + (port.y ?? 0);
      }
    }
    nodes.push(elkNode);
  }

  if (elkNode.edges) {
    for (const edge of elkNode.edges) {
      if (!isRoot) {
        for (const section of (edge.sections ?? [])) {
          const off = pt => ({ x: pt.x + parentX, y: pt.y + parentY });
          section.startPoint = off(section.startPoint);
          section.endPoint   = off(section.endPoint);
          section.bendPoints = (section.bendPoints ?? []).map(off);
        }
      }
      edges.push(edge);
    }
  }

  const absX = isRoot ? 0 : elkNode.x;
  const absY = isRoot ? 0 : elkNode.y;

  for (const child of (elkNode.children ?? [])) {
    absolutiseAndFlatten(child, absX, absY, nodes, edges);
  }

  return { nodes, edges };
}

// ─────────────────────────────────────────────────────────────────────────────
// Style helpers
// ─────────────────────────────────────────────────────────────────────────────

function resolveNodeStyle(canopus = {}) {
  const { type, mode } = canopus;
  const reg = NODE_STYLE[type];
  if (!reg) return NODE_STYLE.uvm_component;
  if (type === 'uvm_agent') return mode === 'passive' ? reg.passive : reg.active;
  return reg;
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─────────────────────────────────────────────────────────────────────────────
// SVG fragment builders
// ─────────────────────────────────────────────────────────────────────────────

function buildDefs() {
  const markers = Object.entries(EDGE_STYLE).map(([type, style]) => {
    const id = `arrow-${type.replace(/\./g, '-')}`;
    const s  = ARROWHEAD_SIZE;
    return `
  <marker id="${id}" markerWidth="${s}" markerHeight="${s}"
          refX="${s - 1}" refY="${s / 2}" orient="auto">
    <path d="M0,0 L0,${s} L${s},${s / 2} z" fill="${style.stroke}" fill-opacity="0.85"/>
  </marker>`;
  }).join('');

  return `<defs>${markers}\n</defs>`;
}

function buildCompoundNode(node) {
  const { x, y, width, height } = node;
  const style    = resolveNodeStyle(node.canopus);
  const label    = node.labels?.[0]?.text ?? node.id;
  const typeText = node.canopus?.type ?? '';
  const rx       = style.rx ?? 5;

  return `
<g class="canopus-compound" data-id="${esc(node.id)}">
  <rect x="${x}" y="${y}" width="${width}" height="${height}"
        rx="${rx}" fill="${style.fill}"
        stroke="${style.stroke}" stroke-width="${style.strokeWidth}"/>
  <text x="${x + LABEL_PADDING.x}" y="${y + LABEL_PADDING.y + TYPOGRAPHY.containerFontSize}"
        font-family="${esc(TYPOGRAPHY.containerFont)}"
        font-size="${TYPOGRAPHY.containerFontSize}"
        fill="${style.labelColor}" fill-opacity="${TYPOGRAPHY.containerOpacity}"
        style="user-select:none">${esc(typeText)}</text>
  <text x="${x + LABEL_PADDING.x}"
        y="${y + LABEL_PADDING.y + TYPOGRAPHY.containerFontSize * 2 + 3}"
        font-family="${esc(TYPOGRAPHY.nodeFont)}"
        font-size="${TYPOGRAPHY.nodeFontSize}"
        fill="${style.labelColor}"
        style="user-select:none">${esc(label)}</text>
</g>`;
}

function buildLeafNode(node) {
  const { x, y, width, height } = node;
  const style = resolveNodeStyle(node.canopus);
  const label = node.labels?.[0]?.text ?? node.id;
  const rx    = style.rx ?? 3;

  const ports = (node.ports ?? []).map(p => `
  <circle cx="${x + (p.x ?? 0) + PORT_RADIUS}" cy="${y + (p.y ?? 0) + PORT_RADIUS}"
          r="${PORT_RADIUS}" fill="${style.stroke}" fill-opacity="0.6"/>`).join('');

  return `
<g class="canopus-leaf" data-id="${esc(node.id)}">
  <rect x="${x}" y="${y}" width="${width}" height="${height}"
        rx="${rx}" fill="${style.fill}"
        stroke="${style.stroke}" stroke-width="${style.strokeWidth}"/>
  <text x="${x + width / 2}" y="${y + height / 2 + 1}"
        text-anchor="middle" dominant-baseline="middle"
        font-family="${esc(TYPOGRAPHY.nodeFont)}"
        font-size="${TYPOGRAPHY.nodeFontSize}"
        fill="${style.labelColor}"
        style="user-select:none">${esc(label)}</text>${ports}
</g>`;
}

function sectionToPoints(section) {
  const pts = [section.startPoint];
  if (section.bendPoints?.length) pts.push(...section.bendPoints);
  pts.push(section.endPoint);
  return pts;
}

function polylineMidpoint(points) {
  if (!points.length) return { x: 0, y: 0 };
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    total += Math.sqrt(dx * dx + dy * dy);
  }
  let walked = 0;
  const half = total / 2;
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    const seg = Math.sqrt(dx * dx + dy * dy);
    if (walked + seg >= half) {
      const t = (half - walked) / seg;
      return { x: points[i].x + t * dx, y: points[i].y + t * dy };
    }
    walked += seg;
  }
  return points[points.length - 1];
}

function buildEdge(edge) {
  if (!edge.sections?.length) return '';

  const connType  = edge.canopus?.type ?? '_default';
  const style     = EDGE_STYLE[connType] ?? EDGE_STYLE._default;
  const isCross   = edge.canopus?.meta?.boundary_cross === true;
  const markerId  = `arrow-${connType.replace(/\./g, '-')}`;
  const allPoints = edge.sections.flatMap(sectionToPoints);
  const mid       = polylineMidpoint(allPoints);

  let stroke    = style.stroke;
  let dashArray = style.dash ? `stroke-dasharray="${style.dash}"` : '';
  let opacity   = 1;

  if (isCross) {
    dashArray = `stroke-dasharray="${CROSS_BOUNDARY_OVERLAY.dash}"`;
    opacity   = CROSS_BOUNDARY_OVERLAY.strokeOpacity;
  }

  const polylines = edge.sections.map((section, i) => {
    const pts    = sectionToPoints(section);
    const ptStr  = pts.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
    const marker = i === edge.sections.length - 1
      ? `marker-end="url(#${markerId})"`
      : '';
    return `  <polyline points="${ptStr}" fill="none"
    stroke="${stroke}" stroke-width="${style.strokeWidth}"
    ${dashArray} stroke-linecap="round" stroke-linejoin="round"
    opacity="${opacity}" ${marker}/>`;
  }).join('\n');

  const labelText = edge.canopus?.transaction ?? style.label ?? null;
  const labelSvg  = labelText ? `
  <text x="${mid.x.toFixed(2)}" y="${(mid.y - 4).toFixed(2)}"
        text-anchor="middle"
        font-family="${esc(TYPOGRAPHY.edgeFont)}"
        font-size="${TYPOGRAPHY.edgeFontSize}"
        fill="${TYPOGRAPHY.edgeFontColor}"
        opacity="${opacity}"
        style="user-select:none">${esc(labelText)}</text>` : '';

  return `\n<g class="canopus-edge" data-type="${esc(connType)}">\n${polylines}${labelSvg}\n</g>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bounds computation
// ─────────────────────────────────────────────────────────────────────────────

function computeBounds(nodes, padding = 32) {
  if (!nodes.length) return { x: 0, y: 0, w: 800, h: 600 };

  let minX =  Infinity, minY =  Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  for (const n of nodes) {
    minX = Math.min(minX, n.x ?? 0);
    minY = Math.min(minY, n.y ?? 0);
    maxX = Math.max(maxX, (n.x ?? 0) + (n.width  ?? 0));
    maxY = Math.max(maxY, (n.y ?? 0) + (n.height ?? 0));
  }

  return {
    x: minX - padding,
    y: minY - padding,
    w: (maxX - minX) + padding * 2,
    h: (maxY - minY) + padding * 2,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Render an absolutised ELK layout to a standalone SVG string.
 *
 * @param  {object[]} nodes        Absolutised node array from absolutiseAndFlatten()
 * @param  {object[]} edges        Absolutised edge array from absolutiseAndFlatten()
 * @param  {string}   [title]      Optional topology name for SVG title element
 * @returns {string}               Complete standalone SVG document
 */
export function renderStaticSvg(nodes, edges, title = null) {
  const bounds = computeBounds(nodes);

  // Render order: compound nodes back-to-front, then leaves, then edges
  const compounds = nodes
    .filter(n => Array.isArray(n.children))
    .sort((a, b) => (b.width * b.height) - (a.width * a.height));

  const leaves = nodes.filter(n => !Array.isArray(n.children));

  const compoundSvg = compounds.map(buildCompoundNode).join('');
  const leafSvg     = leaves.map(buildLeafNode).join('');
  const edgeSvg     = edges.map(buildEdge).join('');

  const titleEl = title
    ? `  <title>${esc(title)}</title>\n`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="${bounds.x.toFixed(2)} ${bounds.y.toFixed(2)} ${bounds.w.toFixed(2)} ${bounds.h.toFixed(2)}"
     style="background:${SURFACE.background}">
${titleEl}${buildDefs()}

<!-- Compound nodes (back to front) -->${compoundSvg}

<!-- Leaf nodes -->${leafSvg}

<!-- Edges -->${edgeSvg}

</svg>
`;
}
