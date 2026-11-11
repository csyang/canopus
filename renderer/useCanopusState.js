/**
 * useCanopusState.js
 * Canopus — Central Interaction State Hook
 *
 * Single source of truth for all five interaction features.
 * Components read from this hook; they never own interaction state locally.
 *
 * State shape:
 *
 *   expandedIds      Set<string>   — compound node IDs currently expanded
 *   visibleFamilies  Set<string>   — edge type family prefixes currently shown
 *                                    ('tlm', 'ref', 'reg', or all three)
 *   maxLevel         number|null   — abstraction level ceiling for filtering
 *                                    (null = show all)
 *   selectedId       string|null   — the single selected component ID
 *   tracedPaths      object        — { upstream: Set<string>, downstream: Set<string> }
 *                                    IDs reachable from selectedId via connections
 *   showEdgeLabels   boolean       — transaction type annotation on/off
 */

import { useState, useCallback, useMemo } from 'react';

const ALL_FAMILIES = new Set(['tlm', 'ref', 'reg']);

/**
 * Build a bidirectional adjacency index from the raw manifest connections.
 * Computed once from the manifest and passed into the hook.
 *
 * Returns { upstream: { id → Set<id> }, downstream: { id → Set<id> } }
 */
export function buildConnectionIndex(connections) {
  const downstream = {};
  const upstream   = {};

  for (const conn of connections) {
    downstream[conn.from] ??= new Set();
    downstream[conn.from].add(conn.to);

    upstream[conn.to] ??= new Set();
    upstream[conn.to].add(conn.from);
  }

  return { upstream, downstream };
}

/**
 * Flood-fill reachable IDs from a starting node in one direction.
 * Used for path tracing — walks the full transitive closure.
 */
function floodFill(startId, adjacency) {
  const visited = new Set();
  const queue   = [startId];

  while (queue.length) {
    const current = queue.shift();
    for (const neighbour of (adjacency[current] ?? [])) {
      if (!visited.has(neighbour)) {
        visited.add(neighbour);
        queue.push(neighbour);
      }
    }
  }

  return visited;
}

/**
 * useCanopusState
 *
 * @param {object} manifest          Parsed Canopus manifest
 * @param {object} connectionIndex   Output of buildConnectionIndex()
 * @returns {object}                 State + action dispatchers
 */
export function useCanopusState(manifest, connectionIndex) {

  // ── Hierarchical drill-down ─────────────────────────────────────────────
  const [expandedIds, setExpandedIds] = useState(() => {
    // Initially expand the top-level test node only
    const ids = new Set();
    for (const comp of manifest.components) {
      ids.add(comp.id);
    }
    return ids;
  });

  const toggleExpanded = useCallback((id) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    // Collect every compound node ID from the manifest
    const ids = new Set();
    function collect(components) {
      for (const c of components) {
        if (c.children?.length) {
          ids.add(c.id);
          collect(c.children);
        }
      }
    }
    collect(manifest.components);
    setExpandedIds(ids);
  }, [manifest]);

  const collapseAll = useCallback(() => {
    const ids = new Set();
    for (const comp of manifest.components) {
      ids.add(comp.id);
    }
    setExpandedIds(ids);
  }, [manifest]);

  // ── Edge family toggle ──────────────────────────────────────────────────
  const [visibleFamilies, setVisibleFamilies] = useState(new Set(ALL_FAMILIES));

  const toggleFamily = useCallback((family) => {
    setVisibleFamilies(prev => {
      const next = new Set(prev);
      if (next.has(family)) {
        // Never allow hiding all families simultaneously
        if (next.size > 1) next.delete(family);
      } else {
        next.add(family);
      }
      return next;
    });
  }, []);

  const showAllFamilies = useCallback(() => {
    setVisibleFamilies(new Set(ALL_FAMILIES));
  }, []);

  // ── Abstraction level filter ────────────────────────────────────────────
  const [maxLevel, setMaxLevel] = useState(null);  // null = show all

  const maxDefinedLevel = useMemo(() => {
    let max = 0;
    function walk(components) {
      for (const c of components) {
        if (c.level != null && c.level > max) max = c.level;
        if (c.children?.length) walk(c.children);
      }
    }
    walk(manifest.components);
    return max;
  }, [manifest]);

  // ── Selection and path tracing ──────────────────────────────────────────
  const [selectedId, setSelectedId] = useState(null);

  const tracedPaths = useMemo(() => {
    if (!selectedId) return { upstream: new Set(), downstream: new Set() };
    return {
      upstream:   floodFill(selectedId, connectionIndex.upstream),
      downstream: floodFill(selectedId, connectionIndex.downstream),
    };
  }, [selectedId, connectionIndex]);

  const selectNode = useCallback((id) => {
    setSelectedId(prev => prev === id ? null : id);   // click again to deselect
  }, []);

  const clearSelection = useCallback(() => setSelectedId(null), []);

  // ── Transaction type annotation ─────────────────────────────────────────
  const [showEdgeLabels, setShowEdgeLabels] = useState(true);

  const toggleEdgeLabels = useCallback(() => {
    setShowEdgeLabels(prev => !prev);
  }, []);

  // ── Derived helpers for rendering ───────────────────────────────────────

  /**
   * isEdgeVisible — should this edge be rendered at full opacity?
   * Returns false if its type family is toggled off.
   */
  const isEdgeVisible = useCallback((connType) => {
    const family = connType?.split('.')[0] ?? '';
    return visibleFamilies.has(family);
  }, [visibleFamilies]);

  /**
   * nodePathState — returns one of:
   *   'selected'   — this is the selected node
   *   'upstream'   — reachable upstream from selection
   *   'downstream' — reachable downstream from selection
   *   'dimmed'     — selection active but node is not on any path
   *   'normal'     — no selection active
   */
  const nodePathState = useCallback((id) => {
    if (!selectedId)            return 'normal';
    if (id === selectedId)      return 'selected';
    if (tracedPaths.upstream.has(id))   return 'upstream';
    if (tracedPaths.downstream.has(id)) return 'downstream';
    return 'dimmed';
  }, [selectedId, tracedPaths]);

  /**
   * isNodeVisible — should this node be included in the layout?
   * Prunes nodes whose level exceeds the current filter ceiling.
   */
  const isNodeVisible = useCallback((level) => {
    if (maxLevel === null) return true;
    if (level == null)     return true;
    return level <= maxLevel;
  }, [maxLevel]);

  return {
    // Drill-down
    expandedIds,
    toggleExpanded,
    expandAll,
    collapseAll,

    // Edge family toggle
    visibleFamilies,
    toggleFamily,
    showAllFamilies,

    // Abstraction level filter
    maxLevel,
    maxDefinedLevel,
    setMaxLevel,

    // Selection + path tracing
    selectedId,
    tracedPaths,
    selectNode,
    clearSelection,

    // Annotation
    showEdgeLabels,
    toggleEdgeLabels,

    // Derived
    isEdgeVisible,
    nodePathState,
    isNodeVisible,
  };
}
