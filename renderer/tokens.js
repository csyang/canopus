/**
 * tokens.js
 * Canopus — Visual Design Tokens
 *
 * All visual decisions live here. Components import from this file;
 * nothing is hardcoded in the rendering components themselves.
 *
 * Aesthetic direction: engineering-grade dark theme.
 * Precise, monochrome-dominant, with a single blue accent for
 * interactive/active states. Edge types distinguished by hue only
 * (never shape alone) so the diagram reads under colour-deficient vision.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Surface & Chrome
// ─────────────────────────────────────────────────────────────────────────────

export const SURFACE = {
  background:   '#0f1117',   // canvas background
  panel:        '#161b22',   // side panel / toolbar
  border:       '#2a2f3a',   // panel borders
  gridLine:     '#1a1f2b',   // subtle canvas grid
};

// ─────────────────────────────────────────────────────────────────────────────
// Node fills and strokes by component type family
// ─────────────────────────────────────────────────────────────────────────────

export const NODE_STYLE = {
  // Compound containers — nested rectangles, increasingly lighter borders
  uvm_test:  { fill: '#0f1117', stroke: '#3a4155', strokeWidth: 1.5, labelColor: '#6b7a99', rx: 6 },
  uvm_env:   { fill: '#131820', stroke: '#2e3a50', strokeWidth: 1.5, labelColor: '#7a8aaa', rx: 5 },
  uvm_agent: {
    active:  { fill: '#141c2a', stroke: '#2a4a7f', strokeWidth: 1.5, labelColor: '#5b8fd4', rx: 4 },
    passive: { fill: '#141c22', stroke: '#2a4a5a', strokeWidth: 1.5, labelColor: '#4a7a8a', rx: 4 },
  },

  // Stimulus path — blue family
  uvm_sequencer:         { fill: '#0d1e36', stroke: '#1e4d8c', strokeWidth: 1, labelColor: '#4a90d9', rx: 3 },
  uvm_virtual_sequencer: { fill: '#0d1e36', stroke: '#1e4d8c', strokeWidth: 1, labelColor: '#4a90d9', rx: 3 },
  uvm_driver:            { fill: '#0d1e36', stroke: '#1e4d8c', strokeWidth: 1, labelColor: '#4a90d9', rx: 3 },

  // Observation path — teal family
  uvm_monitor:           { fill: '#0d2424', stroke: '#1a5a5a', strokeWidth: 1, labelColor: '#3ab8b8', rx: 3 },

  // Analysis sinks — amber family
  uvm_scoreboard:         { fill: '#221a0d', stroke: '#6b4500', strokeWidth: 1, labelColor: '#c48a20', rx: 3 },
  uvm_coverage_collector: { fill: '#221a0d', stroke: '#6b4500', strokeWidth: 1, labelColor: '#c48a20', rx: 3 },
  uvm_subscriber:         { fill: '#221a0d', stroke: '#6b4500', strokeWidth: 1, labelColor: '#c48a20', rx: 3 },
  uvm_protocol_checker:   { fill: '#221a0d', stroke: '#8b5500', strokeWidth: 1, labelColor: '#d4a030', rx: 3 },

  // Register model — violet family
  uvm_reg_block:     { fill: '#1a0d2e', stroke: '#4a1a7a', strokeWidth: 1, labelColor: '#9a60d4', rx: 3 },
  uvm_reg_adapter:   { fill: '#1a0d2e', stroke: '#4a1a7a', strokeWidth: 1, labelColor: '#9a60d4', rx: 3 },
  uvm_reg_predictor: { fill: '#1a0d2e', stroke: '#4a1a7a', strokeWidth: 1, labelColor: '#9a60d4', rx: 3 },

  // Generic fallback
  uvm_component: { fill: '#161b22', stroke: '#2a2f3a', strokeWidth: 1, labelColor: '#6b7a99', rx: 3 },
};

// ─────────────────────────────────────────────────────────────────────────────
// Edge strokes by connection type family
// ─────────────────────────────────────────────────────────────────────────────

export const EDGE_STYLE = {
  // TLM — solid, coloured by semantic role
  'tlm.blocking_get':    { stroke: '#4a90d9', strokeWidth: 1.5, dash: null,      label: 'seq_item' },
  'tlm.blocking_put':    { stroke: '#4a90d9', strokeWidth: 1.5, dash: null,      label: 'put'      },
  'tlm.nonblocking_put': { stroke: '#4a90d9', strokeWidth: 1,   dash: '4 2',     label: 'nb_put'   },
  'tlm.nonblocking_get': { stroke: '#4a90d9', strokeWidth: 1,   dash: '4 2',     label: 'nb_get'   },
  'tlm.transport':       { stroke: '#5ab0c8', strokeWidth: 1.5, dash: null,      label: 'transport' },
  'tlm.nb_transport':    { stroke: '#5ab0c8', strokeWidth: 1,   dash: '4 2',     label: 'nb_transport' },
  'tlm.analysis':        { stroke: '#3ab8b8', strokeWidth: 1.5, dash: null,      label: 'analysis' },
  'tlm.fifo':            { stroke: '#3ab8b8', strokeWidth: 1,   dash: '6 3',     label: 'fifo'     },

  // REF — muted, dashed
  'ref.handle':          { stroke: '#6b7a99', strokeWidth: 1,   dash: '5 3',     label: 'handle'   },
  'ref.shared_object':   { stroke: '#6b7a99', strokeWidth: 1,   dash: '3 3',     label: 'shared'   },

  // REG — violet, distinguished dash patterns
  'reg.frontdoor':       { stroke: '#9a60d4', strokeWidth: 1.5, dash: null,      label: 'frontdoor' },
  'reg.backdoor':        { stroke: '#9a60d4', strokeWidth: 1,   dash: '2 4',     label: 'backdoor'  },
  'reg.adapter':         { stroke: '#b070e4', strokeWidth: 1,   dash: '6 2 2 2', label: 'adapter'   },
  'reg.predictor':       { stroke: '#b070e4', strokeWidth: 1,   dash: '6 2 2 2', label: 'predictor' },

  // Fallback
  _default:              { stroke: '#4a5568', strokeWidth: 1,   dash: null,      label: ''         },
};

// Cross-boundary edge overlay — applied on top of base edge style
export const CROSS_BOUNDARY_OVERLAY = {
  strokeOpacity: 0.6,
  dash: '8 4',
};

// ─────────────────────────────────────────────────────────────────────────────
// Interaction states
// ─────────────────────────────────────────────────────────────────────────────

export const INTERACTION = {
  // Node hover / selection ring
  hoverStroke:     '#4a90d9',
  selectedStroke:  '#60b0ff',
  selectedGlow:    'drop-shadow(0 0 4px rgba(74, 144, 217, 0.6))',

  // Path tracing highlight
  pathActiveStroke:   '#60d4b0',
  pathActiveFill:     'rgba(96, 212, 176, 0.08)',
  pathDimOpacity:     0.2,

  // Edge family toggle — dimmed when hidden
  edgeDimOpacity: 0.08,

  // Expand/collapse compound node indicator
  expanderSize:   12,
  expanderColor:  '#3a4155',
  expanderHover:  '#4a90d9',
};

// ─────────────────────────────────────────────────────────────────────────────
// Typography
// ─────────────────────────────────────────────────────────────────────────────

export const TYPOGRAPHY = {
  // Node labels — monospace, engineering aesthetic
  nodeFont:      '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
  nodeFontSize:  11,
  nodeFontWeight: 400,

  // Compound node header labels — slightly larger, lighter weight
  containerFont:     '"JetBrains Mono", "Fira Code", monospace',
  containerFontSize: 10,
  containerFontWeight: 300,
  containerOpacity: 0.7,

  // Edge labels
  edgeFont:      '"JetBrains Mono", "Fira Code", monospace',
  edgeFontSize:  9,
  edgeFontColor: '#4a5568',
};

// ─────────────────────────────────────────────────────────────────────────────
// Layout constants (must match manifest-to-elk.js NODE_SIZES)
// ─────────────────────────────────────────────────────────────────────────────

export const ARROWHEAD_SIZE = 6;
export const PORT_RADIUS    = 2.5;  // dot rendered at port location
export const LABEL_PADDING  = { x: 8, y: 6 };
