/**
 * CanopusEdge.jsx
 * Canopus — SVG Edge Renderer
 *
 * Renders a single ELK edge using the bend-point sections array produced
 * by elk.layout(). Applies visual style from tokens.js and reacts to
 * interaction state (path tracing, family toggle, edge label annotation).
 *
 * ELK edge sections schema (post-layout):
 *   edge.sections = [{
 *     startPoint: { x, y },
 *     bendPoints: [{ x, y }, ...],   // may be absent
 *     endPoint:   { x, y },
 *   }]
 *
 * Each section is one routed segment. For simple edges there is typically
 * one section; for edges crossing compound boundaries ELK may produce more.
 */

import React from 'react';
import {
  EDGE_STYLE,
  CROSS_BOUNDARY_OVERLAY,
  INTERACTION,
  TYPOGRAPHY,
  ARROWHEAD_SIZE,
} from './tokens.js';

// ─────────────────────────────────────────────────────────────────────────────
// Arrowhead marker definition (rendered once in <defs>)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ArrowheadDefs
 * Call this once inside the root <svg><defs> block.
 * Produces one marker per edge style so each family gets the right colour.
 */
export function ArrowheadDefs() {
  return (
    <>
      {Object.entries(EDGE_STYLE).map(([type, style]) => {
        const id = `arrow-${type.replace(/\./g, '-')}`;
        return (
          <marker
            key={id}
            id={id}
            markerWidth={ARROWHEAD_SIZE}
            markerHeight={ARROWHEAD_SIZE}
            refX={ARROWHEAD_SIZE - 1}
            refY={ARROWHEAD_SIZE / 2}
            orient="auto"
          >
            <path
              d={`M0,0 L0,${ARROWHEAD_SIZE} L${ARROWHEAD_SIZE},${ARROWHEAD_SIZE / 2} z`}
              fill={style.stroke}
              fillOpacity={0.85}
            />
          </marker>
        );
      })}
      {/* Highlighted arrowhead for path tracing */}
      <marker
        id="arrow-path-active"
        markerWidth={ARROWHEAD_SIZE}
        markerHeight={ARROWHEAD_SIZE}
        refX={ARROWHEAD_SIZE - 1}
        refY={ARROWHEAD_SIZE / 2}
        orient="auto"
      >
        <path
          d={`M0,0 L0,${ARROWHEAD_SIZE} L${ARROWHEAD_SIZE},${ARROWHEAD_SIZE / 2} z`}
          fill={INTERACTION.pathActiveStroke}
        />
      </marker>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Point-list builder from ELK section
// ─────────────────────────────────────────────────────────────────────────────

function sectionToPoints(section) {
  const pts = [section.startPoint];
  if (section.bendPoints?.length) pts.push(...section.bendPoints);
  pts.push(section.endPoint);
  return pts;
}

function pointsToPolylineString(points) {
  return points.map(p => `${p.x},${p.y}`).join(' ');
}

/**
 * Midpoint of a polyline for label placement.
 */
function polylineMidpoint(points) {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];

  // Total length
  let totalLen = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    totalLen += Math.sqrt(dx * dx + dy * dy);
  }

  // Walk to half
  let travelled = 0;
  const half = totalLen / 2;
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    const segLen = Math.sqrt(dx * dx + dy * dy);
    if (travelled + segLen >= half) {
      const t = (half - travelled) / segLen;
      return { x: points[i].x + t * dx, y: points[i].y + t * dy };
    }
    travelled += segLen;
  }

  return points[points.length - 1];
}

// ─────────────────────────────────────────────────────────────────────────────
// CanopusEdge
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object}  edge              Post-layout ELK edge object
 * @param {boolean} isVisible         From isEdgeVisible() — family toggle
 * @param {string}  fromPathState     nodePathState() of the source node
 * @param {string}  toPathState       nodePathState() of the target node
 * @param {boolean} showLabel         From showEdgeLabels state
 * @param {boolean} hasActiveSelection Whether any node is currently selected
 */
export function CanopusEdge({
  edge,
  isVisible,
  fromPathState,
  toPathState,
  showLabel,
  hasActiveSelection,
}) {
  const connType  = edge.canopus?.type ?? '_default';
  const baseStyle = EDGE_STYLE[connType] ?? EDGE_STYLE._default;
  const isCross   = edge.canopus?.meta?.boundary_cross === true;

  // ── Path tracing state ──────────────────────────────────────────────────
  const isOnActivePath = (
    fromPathState === 'selected' || fromPathState === 'upstream' || fromPathState === 'downstream' ||
    toPathState   === 'selected' || toPathState   === 'upstream' || toPathState   === 'downstream'
  );

  const isSourceOrTarget = (
    fromPathState === 'selected' || toPathState === 'selected'
  );

  // ── Derived visual properties ───────────────────────────────────────────
  let stroke      = baseStyle.stroke;
  let strokeWidth = baseStyle.strokeWidth;
  let opacity     = 1;
  let dashArray   = baseStyle.dash ?? undefined;
  let markerEnd   = `url(#arrow-${connType.replace(/\./g, '-')})`;

  if (hasActiveSelection) {
    if (isOnActivePath) {
      stroke      = INTERACTION.pathActiveStroke;
      strokeWidth = baseStyle.strokeWidth + 0.5;
      markerEnd   = 'url(#arrow-path-active)';
    } else {
      opacity = INTERACTION.pathDimOpacity;
    }
  }

  if (!isVisible) {
    opacity = INTERACTION.edgeDimOpacity;
  }

  // Cross-boundary overlay
  if (isCross && !hasActiveSelection) {
    dashArray = CROSS_BOUNDARY_OVERLAY.dash;
    opacity   = CROSS_BOUNDARY_OVERLAY.strokeOpacity;
  }

  // ── Render one polyline per ELK section ─────────────────────────────────
  if (!edge.sections?.length) return null;

  const allPoints = edge.sections.flatMap(sectionToPoints);
  const labelPos  = polylineMidpoint(allPoints);
  const labelText = showLabel
    ? (edge.canopus?.transaction ?? baseStyle.label ?? null)
    : null;

  return (
    <g
      className="canopus-edge"
      data-edge-id={edge.id}
      data-edge-type={connType}
      style={{ pointerEvents: 'none' }}   // edges are not interactive targets
    >
      {edge.sections.map((section, i) => {
        const points = sectionToPoints(section);
        return (
          <polyline
            key={i}
            points={pointsToPolylineString(points)}
            fill="none"
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeDasharray={dashArray}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={opacity}
            markerEnd={i === edge.sections.length - 1 ? markerEnd : undefined}
          />
        );
      })}

      {/* Edge label — rendered at polyline midpoint */}
      {labelText && (
        <text
          x={labelPos.x}
          y={labelPos.y - 4}
          textAnchor="middle"
          fontFamily={TYPOGRAPHY.edgeFont}
          fontSize={TYPOGRAPHY.edgeFontSize}
          fill={TYPOGRAPHY.edgeFontColor}
          opacity={opacity}
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {labelText}
        </text>
      )}
    </g>
  );
}
