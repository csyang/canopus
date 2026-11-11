/**
 * CanopusToolbar.jsx
 * Canopus — Interaction Controls Toolbar
 *
 * Renders controls for all five interaction features:
 *   - Expand All / Collapse All  (drill-down)
 *   - Edge family toggles        (TLM / REF / REG)
 *   - Level filter slider        (abstraction depth)
 *   - Edge label annotation      (transaction type on/off)
 *   - Selection info + clear     (path tracing)
 */

import React from 'react';
import { SURFACE, INTERACTION, TYPOGRAPHY } from './tokens.js';

// ─────────────────────────────────────────────────────────────────────────────
// Styling primitives (inline — no CSS framework dependency)
// ─────────────────────────────────────────────────────────────────────────────

const S = {
  toolbar: {
    display:         'flex',
    flexDirection:   'row',
    alignItems:      'center',
    gap:             '24px',
    padding:         '8px 16px',
    background:      SURFACE.panel,
    borderBottom:    `1px solid ${SURFACE.border}`,
    fontFamily:      TYPOGRAPHY.nodeFont,
    fontSize:        '11px',
    color:           '#6b7a99',
    userSelect:      'none',
    flexWrap:        'wrap',
  },
  group: {
    display:       'flex',
    flexDirection: 'row',
    alignItems:    'center',
    gap:           '8px',
  },
  groupLabel: {
    fontSize:    '9px',
    color:       '#3a4155',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    marginRight: '2px',
  },
  button: (active, color = '#4a90d9') => ({
    padding:       '3px 10px',
    borderRadius:  '3px',
    border:        `1px solid ${active ? color : '#2a2f3a'}`,
    background:    active ? color + '22' : 'transparent',
    color:         active ? color : '#4a5568',
    cursor:        'pointer',
    fontSize:      '10px',
    fontFamily:    TYPOGRAPHY.nodeFont,
    transition:    'all 0.12s ease',
  }),
  iconButton: {
    padding:      '3px 8px',
    borderRadius: '3px',
    border:       '1px solid #2a2f3a',
    background:   'transparent',
    color:        '#4a5568',
    cursor:       'pointer',
    fontSize:     '10px',
    fontFamily:   TYPOGRAPHY.nodeFont,
  },
  separator: {
    width:      '1px',
    height:     '20px',
    background: SURFACE.border,
    flexShrink: 0,
  },
  slider: {
    accentColor: '#4a90d9',
    width:       '80px',
    cursor:      'pointer',
  },
  selectionBadge: (color) => ({
    padding:      '2px 8px',
    borderRadius: '3px',
    background:   color + '22',
    border:       `1px solid ${color}`,
    color:        color,
    fontSize:     '10px',
  }),
};

// Edge family metadata for toggle buttons
const FAMILIES = [
  { key: 'tlm', label: 'TLM',  color: '#4a90d9' },
  { key: 'ref', label: 'REF',  color: '#6b7a99' },
  { key: 'reg', label: 'REG',  color: '#9a60d4' },
];

// ─────────────────────────────────────────────────────────────────────────────
// CanopusToolbar
// ─────────────────────────────────────────────────────────────────────────────

export function CanopusToolbar({ state, manifestName }) {
  return (
    <div style={S.toolbar}>

      {/* Topology name */}
      {manifestName && (
        <span style={{ color: '#3ab8b8', fontSize: '11px', fontWeight: 500 }}>
          {manifestName}
        </span>
      )}

      <div style={S.separator} />

      {/* ── Drill-down controls ─────────────────────────────────────────── */}
      <div style={S.group}>
        <span style={S.groupLabel}>Hierarchy</span>
        <button
          style={S.iconButton}
          onClick={state.expandAll}
          title="Expand all compound nodes"
        >
          expand all
        </button>
        <button
          style={S.iconButton}
          onClick={state.collapseAll}
          title="Collapse to top level"
        >
          collapse all
        </button>
      </div>

      <div style={S.separator} />

      {/* ── Edge family toggles ─────────────────────────────────────────── */}
      <div style={S.group}>
        <span style={S.groupLabel}>Edges</span>
        {FAMILIES.map(({ key, label, color }) => {
          const active = state.visibleFamilies.has(key);
          return (
            <button
              key={key}
              style={S.button(active, color)}
              onClick={() => state.toggleFamily(key)}
              title={`Toggle ${label} connections`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div style={S.separator} />

      {/* ── Abstraction level filter ────────────────────────────────────── */}
      <div style={S.group}>
        <span style={S.groupLabel}>Level</span>
        <input
          type="range"
          min={0}
          max={state.maxDefinedLevel}
          value={state.maxLevel ?? state.maxDefinedLevel}
          style={S.slider}
          onChange={e => {
            const val = parseInt(e.target.value, 10);
            state.setMaxLevel(val >= state.maxDefinedLevel ? null : val);
          }}
          title={`Abstraction level filter: ${state.maxLevel ?? 'all'}`}
        />
        <span style={{ color: '#4a5568', minWidth: '24px' }}>
          {state.maxLevel != null ? `≤${state.maxLevel}` : 'all'}
        </span>
      </div>

      <div style={S.separator} />

      {/* ── Transaction type annotation ─────────────────────────────────── */}
      <div style={S.group}>
        <button
          style={S.button(state.showEdgeLabels, '#3ab8b8')}
          onClick={state.toggleEdgeLabels}
          title="Show/hide transaction type labels on edges"
        >
          annotations
        </button>
      </div>

      <div style={S.separator} />

      {/* ── Selection / path tracing info ──────────────────────────────── */}
      <div style={S.group}>
        {state.selectedId ? (
          <>
            <span style={S.selectionBadge('#60b0ff')}>
              {state.selectedId}
            </span>
            <span style={{ color: '#3a4a5a', fontSize: '10px' }}>
              ↑ {state.tracedPaths.upstream.size}
              &nbsp;·&nbsp;
              ↓ {state.tracedPaths.downstream.size}
            </span>
            <button
              style={S.iconButton}
              onClick={state.clearSelection}
              title="Clear selection"
            >
              ✕
            </button>
          </>
        ) : (
          <span style={{ color: '#2a3040', fontSize: '10px' }}>
            click node to trace paths
          </span>
        )}
      </div>

    </div>
  );
}
