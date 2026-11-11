/**
 * CanopusNode.jsx
 * Canopus — SVG Node Renderer (leaf and compound)
 *
 * A single component handles both compound nodes (uvm_env, uvm_agent, etc.)
 * and leaf nodes (uvm_sequencer, uvm_driver, etc.) because their visual
 * treatment differs only in degree, not in kind:
 *
 *   Compound — rounded rect with dashed border, translucent fill,
 *              label in top-left corner, expand/collapse toggle
 *   Leaf     — solid rect, centred label, port dots on edges
 *
 * ELK places all children in absolute coordinates relative to the root.
 * Each node's (x, y) is its top-left corner in the SVG coordinate space.
 * The renderer applies no additional transforms.
 *
 * Coordinate note: ELK reports child positions relative to their parent
 * container. To render in a flat SVG (no nested <g> with transforms),
 * positions must be made absolute first. The CanopusCanvas component
 * handles that pre-pass before rendering nodes.
 */

import React from 'react';
import {
  NODE_STYLE,
  INTERACTION,
  TYPOGRAPHY,
  PORT_RADIUS,
  LABEL_PADDING,
} from './tokens.js';

// ─────────────────────────────────────────────────────────────────────────────
// Style resolution helpers
// ─────────────────────────────────────────────────────────────────────────────

function resolveNodeStyle(canopus) {
  const { type, mode } = canopus ?? {};
  const registered = NODE_STYLE[type];
  if (!registered) return NODE_STYLE.uvm_component;

  // uvm_agent has sub-styles by mode
  if (type === 'uvm_agent') {
    return mode === 'passive' ? registered.passive : registered.active;
  }

  return registered;
}

function resolvePathStyle(pathState) {
  switch (pathState) {
    case 'selected':
      return {
        stroke:  INTERACTION.selectedStroke,
        filter:  INTERACTION.selectedGlow,
        opacity: 1,
      };
    case 'upstream':
    case 'downstream':
      return {
        stroke:  INTERACTION.pathActiveStroke,
        filter:  null,
        opacity: 1,
      };
    case 'dimmed':
      return {
        stroke:  null,
        filter:  null,
        opacity: INTERACTION.pathDimOpacity,
      };
    default:
      return { stroke: null, filter: null, opacity: 1 };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ExpandCollapseToggle — the +/- indicator on compound nodes.
 * Positioned at the top-right corner of the node.
 */
function ExpandCollapseToggle({ x, y, width, expanded, onToggle }) {
  const s    = INTERACTION.expanderSize;
  const cx   = x + width - s / 2 - 6;
  const cy   = y + s / 2 + 6;
  const sign = expanded ? '−' : '+';

  return (
    <g
      className="canopus-expander"
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      style={{ cursor: 'pointer' }}
    >
      <circle
        cx={cx} cy={cy} r={s / 2}
        fill={INTERACTION.expanderColor}
        stroke="none"
      />
      <text
        x={cx} y={cy + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily={TYPOGRAPHY.nodeFont}
        fontSize={s - 2}
        fill={INTERACTION.expanderHover}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {sign}
      </text>
    </g>
  );
}

/**
 * PortDots — small circles rendered at each port location.
 * ELK provides port positions relative to the node origin.
 */
function PortDots({ node, style }) {
  if (!node.ports?.length) return null;

  return (
    <>
      {node.ports.map(port => (
        <circle
          key={port.id}
          cx={node.x + (port.x ?? 0) + PORT_RADIUS}
          cy={node.y + (port.y ?? 0) + PORT_RADIUS}
          r={PORT_RADIUS}
          fill={style.stroke}
          fillOpacity={0.6}
          style={{ pointerEvents: 'none' }}
        />
      ))}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CanopusNode
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object}  node           Post-layout ELK node (absolute coords)
 * @param {boolean} isCompound     True if this node has children
 * @param {boolean} isExpanded     Drill-down: is this compound node open?
 * @param {string}  pathState      From nodePathState()
 * @param {boolean} isLevelVisible From isNodeVisible()
 * @param {function} onToggle      Expand/collapse callback
 * @param {function} onSelect      Selection callback
 */
export function CanopusNode({
  node,
  isCompound,
  isExpanded,
  pathState,
  isLevelVisible,
  onToggle,
  onSelect,
}) {
  if (!isLevelVisible) return null;

  const { x, y, width, height } = node;
  const canopus   = node.canopus ?? {};
  const nodeStyle = resolveNodeStyle(canopus);
  const pathStyle = resolvePathStyle(pathState);

  const stroke      = pathStyle.stroke ?? nodeStyle.stroke;
  const opacity     = pathStyle.opacity;
  const filter      = pathStyle.filter;
  const labelColor  = pathState === 'dimmed'
    ? nodeStyle.labelColor + '44'   // fade label with node
    : nodeStyle.labelColor;

  const isHoverable = true;  // all nodes are hover targets

  if (isCompound) {
    // ── Compound node (container) ──────────────────────────────────────────
    return (
      <g
        className="canopus-node canopus-compound"
        data-node-id={node.id}
        data-node-type={canopus.type}
        onClick={() => onSelect(node.id)}
        style={{ cursor: 'pointer' }}
        opacity={opacity}
      >
        <rect
          x={x} y={y}
          width={width}
          height={height}
          rx={nodeStyle.rx ?? 5}
          fill={nodeStyle.fill}
          stroke={stroke}
          strokeWidth={nodeStyle.strokeWidth}
          strokeDasharray={isExpanded ? undefined : '6 3'}
          filter={filter ?? undefined}
        />

        {/* Type badge — top-left corner inside border */}
        <text
          x={x + LABEL_PADDING.x}
          y={y + LABEL_PADDING.y + TYPOGRAPHY.containerFontSize}
          fontFamily={TYPOGRAPHY.containerFont}
          fontSize={TYPOGRAPHY.containerFontSize}
          fontWeight={TYPOGRAPHY.containerFontWeight}
          fill={labelColor}
          fillOpacity={TYPOGRAPHY.containerOpacity}
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {canopus.type}
        </text>

        {/* Instance label — below type badge */}
        <text
          x={x + LABEL_PADDING.x}
          y={y + LABEL_PADDING.y + TYPOGRAPHY.containerFontSize * 2 + 3}
          fontFamily={TYPOGRAPHY.nodeFont}
          fontSize={TYPOGRAPHY.nodeFontSize}
          fontWeight={TYPOGRAPHY.nodeFontWeight + 200}
          fill={labelColor}
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {node.labels?.[0]?.text ?? node.id}
        </text>

        {/* Expand/collapse toggle — only when node has children */}
        <ExpandCollapseToggle
          x={x} y={y}
          width={width}
          expanded={isExpanded}
          onToggle={() => onToggle(node.id)}
        />
      </g>
    );
  }

  // ── Leaf node ─────────────────────────────────────────────────────────────
  return (
    <g
      className="canopus-node canopus-leaf"
      data-node-id={node.id}
      data-node-type={canopus.type}
      onClick={() => onSelect(node.id)}
      style={{ cursor: 'pointer' }}
      opacity={opacity}
    >
      <rect
        x={x} y={y}
        width={width}
        height={height}
        rx={nodeStyle.rx ?? 3}
        fill={nodeStyle.fill}
        stroke={stroke}
        strokeWidth={nodeStyle.strokeWidth}
        filter={filter ?? undefined}
      />

      {/* Centred instance label */}
      <text
        x={x + width / 2}
        y={y + height / 2 + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily={TYPOGRAPHY.nodeFont}
        fontSize={TYPOGRAPHY.nodeFontSize}
        fontWeight={TYPOGRAPHY.nodeFontWeight}
        fill={labelColor}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {node.labels?.[0]?.text ?? node.id}
      </text>

      {/* Port dots */}
      <PortDots node={node} style={nodeStyle} />
    </g>
  );
}
