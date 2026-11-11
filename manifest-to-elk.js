/**
 * manifest-to-elk.js
 * Canopus — Manifest to ELK JSON Transform
 *
 * Converts a parsed Canopus manifest object into an ELK JSON graph
 * ready for elk.layout(). The transform runs in five phases:
 *
 *   1. Index   — flat id→component and id→parentId maps
 *   2. Ports   — assign ELK ports to every connection endpoint
 *   3. Nodes   — build the ELK compound-node tree from the component tree
 *   4. LCA     — find each edge's lowest common ancestor container
 *   5. Attach  — place edges on their container node and assemble the graph
 *
 * Canopus metadata is preserved on every ELK node and edge under a
 * `canopus` key so the renderer can drive visual behaviour (colours,
 * dash patterns, filtering) without re-parsing the original manifest.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default pixel dimensions for each leaf component type.
 * Compound types (uvm_env, uvm_agent, etc.) are null — ELK computes
 * their bounds from their children.
 */
const NODE_SIZES = {
  uvm_test:               null,   // compound
  uvm_env:                null,   // compound
  uvm_agent:              null,   // compound
  uvm_sequencer:          { width: 130, height: 48 },
  uvm_virtual_sequencer:  { width: 150, height: 48 },
  uvm_driver:             { width: 110, height: 48 },
  uvm_monitor:            { width: 110, height: 48 },
  uvm_scoreboard:         { width: 130, height: 48 },
  uvm_coverage_collector: { width: 150, height: 48 },
  uvm_subscriber:         { width: 130, height: 48 },
  uvm_protocol_checker:   { width: 150, height: 48 },
  uvm_reg_block:          { width: 140, height: 56 },
  uvm_reg_adapter:        { width: 130, height: 48 },
  uvm_reg_predictor:      { width: 140, height: 48 },
  uvm_component:          { width: 120, height: 48 }, // generic fallback
};

/**
 * Port sides for source and target of each connection type family.
 *
 * TLM connections:      EAST out / WEST in  — left-to-right dataflow
 * REF/REG connections:  SOUTH out / NORTH in — visually distinct from TLM,
 *                        avoiding port-side conflicts on shared nodes
 */
const PORT_SIDES = {
  'tlm.blocking_get':    { from: 'EAST',  to: 'WEST'  },
  'tlm.blocking_put':    { from: 'EAST',  to: 'WEST'  },
  'tlm.nonblocking_put': { from: 'EAST',  to: 'WEST'  },
  'tlm.nonblocking_get': { from: 'EAST',  to: 'WEST'  },
  'tlm.transport':       { from: 'EAST',  to: 'WEST'  },
  'tlm.nb_transport':    { from: 'EAST',  to: 'WEST'  },
  'tlm.analysis':        { from: 'EAST',  to: 'WEST'  },
  'tlm.fifo':            { from: 'EAST',  to: 'WEST'  },
  'ref.handle':          { from: 'SOUTH', to: 'NORTH' },
  'ref.shared_object':   { from: 'SOUTH', to: 'NORTH' },
  'reg.frontdoor':       { from: 'SOUTH', to: 'NORTH' },
  'reg.backdoor':        { from: 'SOUTH', to: 'NORTH' },
  'reg.adapter':         { from: 'SOUTH', to: 'NORTH' },
  'reg.predictor':       { from: 'SOUTH', to: 'NORTH' },
};

const DEFAULT_PORT_SIDES = { from: 'EAST', to: 'WEST' };

/**
 * ELK layout options applied to the invisible graph root.
 * These cascade down unless overridden at the node level.
 */
const ROOT_LAYOUT_OPTIONS = {
  'elk.algorithm':                     'layered',
  'elk.direction':                     'RIGHT',
  'elk.edgeRouting':                   'ORTHOGONAL',
  'elk.layered.unnecessaryBendpoints': 'true',
  'elk.spacing.nodeNode':              '24',
  'elk.padding':                       '[top=20,left=20,bottom=20,right=20]',
};

/**
 * Layout options applied to compound nodes (uvm_env, uvm_agent, etc.).
 * Extra top padding accommodates the label rendered inside the top border.
 */
const COMPOUND_LAYOUT_OPTIONS = {
  'elk.algorithm':        'layered',
  'elk.direction':        'RIGHT',
  'elk.padding':          '[top=32,left=16,bottom=16,right=16]',
  'elk.spacing.nodeNode': '16',
};

/**
 * Layout options applied to leaf nodes (sequencer, driver, monitor, etc.).
 * FIXED_SIDE ensures ELK respects our EAST/WEST/SOUTH/NORTH port assignments
 * rather than re-optimising them.
 */
const LEAF_LAYOUT_OPTIONS = {
  'elk.portConstraints': 'FIXED_SIDE',
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 — Index building
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Recursively walk the component tree and produce two flat maps:
 *   nodeIndex  { id → component }   for validation and size lookup
 *   parentMap  { id → parentId }    for LCA computation (null = top-level)
 *
 * Throws on duplicate IDs — global uniqueness is a schema invariant.
 */
function buildIndexes(components, parentId = null, nodeIndex = {}, parentMap = {}) {
  for (const comp of components) {
    if (nodeIndex[comp.id]) {
      throw new Error(`Duplicate component id: "${comp.id}"`);
    }
    nodeIndex[comp.id] = comp;
    parentMap[comp.id] = parentId;

    if (comp.children?.length) {
      buildIndexes(comp.children, comp.id, nodeIndex, parentMap);
    }
  }
  return { nodeIndex, parentMap };
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 — Port map
// ─────────────────────────────────────────────────────────────────────────────

/**
 * For every connection, mint one output port on `from` and one input port
 * on `to`. Port IDs embed the connection id so they are always unique even
 * when a node participates in many connections.
 *
 * Returns portMap { nodeId → [{ portId, side, connId, role }] }
 */
function buildPortMap(connections) {
  const portMap = {};

  for (const conn of connections) {
    const sides = PORT_SIDES[conn.type] ?? DEFAULT_PORT_SIDES;

    portMap[conn.from] ??= [];
    portMap[conn.to]   ??= [];

    portMap[conn.from].push({
      portId: `${conn.from}__out__${conn.id}`,
      side:   sides.from,
      connId: conn.id,
      role:   'output',
    });

    portMap[conn.to].push({
      portId: `${conn.to}__in__${conn.id}`,
      side:   sides.to,
      connId: conn.id,
      role:   'input',
    });
  }

  return portMap;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3 — ELK node tree
// ─────────────────────────────────────────────────────────────────────────────

function isCompound(comp) {
  return Array.isArray(comp.children) && comp.children.length > 0;
}

function resolveNodeSize(comp) {
  // Explicit size in manifest always wins (future extensibility)
  if (comp.width && comp.height) return { width: comp.width, height: comp.height };

  const registered = NODE_SIZES[comp.type];
  if (registered) return registered;

  // Unknown type: safe default
  console.warn(`Unknown component type "${comp.type}" for id "${comp.id}" — using default size`);
  return { width: 120, height: 48 };
}

/**
 * Recursively convert one Canopus component into an ELK node.
 * The `canopus` property on the returned object is ignored by ELK but
 * carried through the layout result for the renderer.
 */
function buildElkNode(comp, portMap) {
  const compound = isCompound(comp);

  const ports = (portMap[comp.id] ?? []).map(p => ({
    id:            p.portId,
    layoutOptions: { 'port.side': p.side },
  }));

  const elkNode = {
    id:            comp.id,
    labels:        [{ text: comp.label ?? comp.id }],
    layoutOptions: compound ? COMPOUND_LAYOUT_OPTIONS : LEAF_LAYOUT_OPTIONS,
    ports,
    canopus: {
      type:  comp.type,
      mode:  comp.mode  ?? null,
      level: comp.level ?? null,
      meta:  comp.meta  ?? {},
    },
  };

  if (compound) {
    elkNode.children = comp.children.map(child => buildElkNode(child, portMap));
  } else {
    const size = resolveNodeSize(comp);
    elkNode.width  = size.width;
    elkNode.height = size.height;
  }

  return elkNode;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 4 — LCA and edge grouping
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return the ancestor chain of a node as an ordered array,
 * starting from the immediate parent up to the topmost node.
 */
function getAncestors(nodeId, parentMap) {
  const ancestors = [];
  let current = parentMap[nodeId];
  while (current != null) {
    ancestors.push(current);
    current = parentMap[current];
  }
  return ancestors;
}

/**
 * Find the lowest common ancestor (LCA) of two nodes.
 *
 * In ELK, every edge must be declared on its LCA container — otherwise
 * ELK cannot route cross-boundary edges correctly. This is the key
 * mechanism that makes Topology 3's cross-sub-env edges work.
 *
 * Returns the LCA node id, or null when the nodes share no common
 * ancestor within the manifest (edge belongs at the ELK root level).
 *
 * Note: if one node is an ancestor of the other (e.g. an edge from a
 * compound node to one of its own descendants), the ancestor node IS
 * the LCA and the edge is declared there — ELK handles this correctly.
 */
function findLCA(fromId, toId, parentMap) {
  // Build ancestor set for `from`, including `from` itself
  const fromAncestors = new Set([fromId, ...getAncestors(fromId, parentMap)]);

  // Walk up from `to` until we intersect
  let current = toId;
  while (current != null) {
    if (fromAncestors.has(current)) return current;
    current = parentMap[current];
  }

  return null; // no common ancestor → graph root
}

/**
 * Group connections by their LCA container id.
 * '__root__' is the sentinel for edges that belong at the ELK graph root.
 */
function groupEdgesByContainer(connections, parentMap) {
  const edgesByContainer = {};

  for (const conn of connections) {
    const lca = findLCA(conn.from, conn.to, parentMap);
    const key = lca ?? '__root__';

    edgesByContainer[key] ??= [];

    const labelText = conn.label ?? conn.transaction ?? null;

    edgesByContainer[key].push({
      id:      conn.id,
      sources: [`${conn.from}__out__${conn.id}`],
      targets: [`${conn.to}__in__${conn.id}`],
      labels:  labelText ? [{ text: labelText }] : [],
      canopus: {
        type:        conn.type,
        transaction: conn.transaction ?? null,
        meta:        conn.meta ?? {},
      },
    });
  }

  return edgesByContainer;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 5 — Attach edges to the ELK tree
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Walk the ELK node tree and attach the correct edge array to each node.
 * This must be done after the tree is built (Phase 3) because ELK expects
 * edges to be children of their container node, not in a separate flat list.
 */
function attachEdges(elkNode, edgesByContainer) {
  const edges = edgesByContainer[elkNode.id];
  if (edges?.length) {
    elkNode.edges = edges;
  }

  if (elkNode.children) {
    for (const child of elkNode.children) {
      attachEdges(child, edgesByContainer);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert a parsed Canopus manifest object to an ELK JSON graph.
 *
 * Usage:
 *   import { manifestToElk } from './manifest-to-elk.js';
 *   import yaml from 'js-yaml';
 *   import ELK  from 'elkjs/lib/elk.bundled.js';
 *
 *   const manifest = yaml.load(fs.readFileSync('topology.canopus.yaml', 'utf8'));
 *   const elkGraph = manifestToElk(manifest);
 *   const laid out = await new ELK().layout(elkGraph);
 *
 * @param  {object} manifest  Parsed Canopus YAML manifest
 * @returns {object}          ELK graph JSON ready for elk.layout()
 */
export function manifestToElk(manifest) {

  // ── Phase 1: Build indexes ───────────────────────────────────────────────
  const { nodeIndex, parentMap } = buildIndexes(manifest.components);

  // ── Validate connection endpoints ────────────────────────────────────────
  for (const conn of manifest.connections) {
    if (!nodeIndex[conn.from]) {
      throw new Error(`Connection "${conn.id}": unknown source id "${conn.from}"`);
    }
    if (!nodeIndex[conn.to]) {
      throw new Error(`Connection "${conn.id}": unknown target id "${conn.to}"`);
    }
    if (!PORT_SIDES[conn.type]) {
      console.warn(`Connection "${conn.id}": unrecognised type "${conn.type}" — using default port sides (EAST/WEST)`);
    }
  }

  // ── Phase 2: Build port map ──────────────────────────────────────────────
  const portMap = buildPortMap(manifest.connections);

  // ── Phase 3: Build ELK node tree ────────────────────────────────────────
  const elkChildren = manifest.components.map(c => buildElkNode(c, portMap));

  // ── Phase 4: Group edges by LCA ─────────────────────────────────────────
  const edgesByContainer = groupEdgesByContainer(manifest.connections, parentMap);
  const rootEdges        = edgesByContainer['__root__'] ?? [];

  // ── Phase 5: Assemble graph and attach edges ─────────────────────────────
  const elkGraph = {
    id:            '__root__',
    layoutOptions: ROOT_LAYOUT_OPTIONS,
    children:      elkChildren,
    edges:         rootEdges,
  };

  for (const child of elkGraph.children) {
    attachEdges(child, edgesByContainer);
  }

  return elkGraph;
}
