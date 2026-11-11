/**
 * types.ts
 * Canopus — Core Type Definitions
 *
 * The canonical TypeScript representation of the Canopus manifest data model.
 * These types mirror the JSON Schema (manifest.schema.json) exactly —
 * the schema validates runtime data, these types enforce correctness at
 * compile time for all new TypeScript code.
 *
 * Import pattern:
 *   import type { CanopusManifest, Component, Connection } from './types.js';
 *
 * Note the .js extension — required for NodeNext module resolution even
 * when importing from a .ts source file. TypeScript resolves it correctly.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Component type taxonomy
// ─────────────────────────────────────────────────────────────────────────────

export type ComponentType =
  | 'uvm_test'
  | 'uvm_env'
  | 'uvm_agent'
  | 'uvm_sequencer'
  | 'uvm_virtual_sequencer'
  | 'uvm_driver'
  | 'uvm_monitor'
  | 'uvm_scoreboard'
  | 'uvm_coverage_collector'
  | 'uvm_subscriber'
  | 'uvm_protocol_checker'
  | 'uvm_reg_block'
  | 'uvm_reg_adapter'
  | 'uvm_reg_predictor'
  | 'uvm_component';

// Component types that may contain children (compound nodes)
export const COMPOUND_COMPONENT_TYPES: ReadonlySet<ComponentType> = new Set([
  'uvm_test',
  'uvm_env',
  'uvm_agent',
  'uvm_component',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Connection type taxonomy
// ─────────────────────────────────────────────────────────────────────────────

export type TlmConnectionType =
  | 'tlm.blocking_get'
  | 'tlm.blocking_put'
  | 'tlm.nonblocking_put'
  | 'tlm.nonblocking_get'
  | 'tlm.transport'
  | 'tlm.nb_transport'
  | 'tlm.analysis'
  | 'tlm.fifo';

export type RefConnectionType =
  | 'ref.handle'
  | 'ref.shared_object';

export type RegConnectionType =
  | 'reg.frontdoor'
  | 'reg.backdoor'
  | 'reg.adapter'
  | 'reg.predictor';

export type ConnectionType =
  | TlmConnectionType
  | RefConnectionType
  | RegConnectionType;

export type ConnectionFamily = 'tlm' | 'ref' | 'reg';

/** Extract the family prefix from a connection type string */
export function connectionFamily(type: ConnectionType): ConnectionFamily {
  return type.split('.')[0] as ConnectionFamily;
}

// ─────────────────────────────────────────────────────────────────────────────
// Meta value — free-form but constrained to JSON-serialisable primitives
// ─────────────────────────────────────────────────────────────────────────────

export type MetaValue = string | number | boolean | string[];

export type Meta = Record<string, MetaValue>;

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export interface Component {
  /** Globally unique identifier — letters, digits, underscores; starts with a letter */
  id:        string;

  /** UVM component type from the Canopus taxonomy */
  type:      ComponentType;

  /** Display name / SystemVerilog class name shown in the visualisation */
  label?:    string;

  /**
   * Agent operating mode.
   * Only meaningful on uvm_agent; ignored on all other types.
   * Defaults to 'active' when omitted.
   */
  mode?:     'active' | 'passive';

  /**
   * Abstraction level for depth-based filtering.
   * 0 = top-level test; higher integers = deeper in the hierarchy.
   */
  level?:    number;

  /** Free-form key-value metadata for display and tooling */
  meta?:     Meta;

  /**
   * Nested child components (containment hierarchy).
   * Presence makes this component a compound (container) node.
   * Only valid on COMPOUND_COMPONENT_TYPES.
   */
  children?: Component[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Connection
// ─────────────────────────────────────────────────────────────────────────────

export interface Connection {
  /** Unique connection identifier */
  id:          string;

  /** ID of the source component */
  from:        string;

  /** Named port on the source (when a component has multiple ports of the same type) */
  from_port?:  string;

  /** ID of the target component */
  to:          string;

  /** Named port on the target */
  to_port?:    string;

  /** Connection type from the Canopus taxonomy */
  type:        ConnectionType;

  /** Transaction type name shown as edge label when annotation is enabled */
  transaction?: string;

  /** Display label override — shown instead of transaction when both are present */
  label?:      string;

  /**
   * Free-form key-value metadata.
   * Use boundary_cross: true for edges that cross compound-node boundaries.
   */
  meta?:       ConnectionMeta;
}

/** Connection-specific meta — extends Meta with known keys */
export interface ConnectionMeta extends Meta {
  /** Marks edges that cross sub-environment boundaries for distinct visual rendering */
  boundary_cross?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Manifest
// ─────────────────────────────────────────────────────────────────────────────

export interface CanopusManifest {
  /** Schema version — must be '0.1' */
  canopus:      '0.1';

  /** Unique machine-readable topology name */
  name:         string;

  /** Optional human-readable description */
  description?: string;

  /** Optional tags for filtering and grouping */
  tags?:        string[];

  /**
   * Hierarchical component tree.
   * Containment is expressed through nesting.
   * All IDs must be globally unique across the entire tree.
   */
  components:   Component[];

  /**
   * Flat list of directed connections.
   * All from/to values must reference IDs declared in components.
   */
  connections:  Connection[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation result (matches validate.js output shape)
// ─────────────────────────────────────────────────────────────────────────────

export interface ValidationError {
  /** JSON path to the offending field (e.g. 'components[0].id') */
  path:    string;

  /** Human-readable error description */
  message: string;

  /** Optional actionable hint for fixing the error */
  hint:    string | null;
}

export interface ValidationResult {
  valid:  boolean;
  errors: ValidationError[];
}

// ─────────────────────────────────────────────────────────────────────────────
// ELK-adjacent types (Canopus additions to the ELK node/edge model)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The `canopus` property added to every ELK node by the transform.
 * ELK ignores it; the renderer reads it for visual behaviour.
 */
export interface CanopusNodeMeta {
  type:   ComponentType;
  mode:   'active' | 'passive' | null;
  level:  number | null;
  meta:   Meta;
}

/**
 * The `canopus` property added to every ELK edge by the transform.
 */
export interface CanopusEdgeMeta {
  type:        ConnectionType;
  transaction: string | null;
  meta:        ConnectionMeta;
}

// ─────────────────────────────────────────────────────────────────────────────
// Connection index (used by useCanopusState for path tracing)
// ─────────────────────────────────────────────────────────────────────────────

export interface ConnectionIndex {
  upstream:   Record<string, Set<string>>;
  downstream: Record<string, Set<string>>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Interaction state shape (mirrors useCanopusState return value)
// ─────────────────────────────────────────────────────────────────────────────

export type PathState = 'selected' | 'upstream' | 'downstream' | 'dimmed' | 'normal';

export interface TracedPaths {
  upstream:   Set<string>;
  downstream: Set<string>;
}

export interface CanopusInteractionState {
  // Drill-down
  expandedIds:      Set<string>;
  toggleExpanded:   (id: string) => void;
  expandAll:        () => void;
  collapseAll:      () => void;

  // Edge family toggle
  visibleFamilies:  Set<ConnectionFamily>;
  toggleFamily:     (family: ConnectionFamily) => void;
  showAllFamilies:  () => void;

  // Abstraction level filter
  maxLevel:         number | null;
  maxDefinedLevel:  number;
  setMaxLevel:      (level: number | null) => void;

  // Selection + path tracing
  selectedId:       string | null;
  tracedPaths:      TracedPaths;
  selectNode:       (id: string) => void;
  clearSelection:   () => void;

  // Annotation
  showEdgeLabels:   boolean;
  toggleEdgeLabels: () => void;

  // Derived helpers
  isEdgeVisible:    (connType: ConnectionType) => boolean;
  nodePathState:    (id: string) => PathState;
  isNodeVisible:    (level: number | undefined | null) => boolean;
}
