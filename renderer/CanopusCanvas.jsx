/**
 * CanopusCanvas.jsx
 * Canopus — Main SVG Canvas
 *
 * Orchestrates the full rendering pipeline:
 *
 *   1. Receives a parsed manifest + interaction state hook
 *   2. Filters the manifest based on current interaction state
 *      (level filter, expand/collapse)
 *   3. Runs manifest-to-elk transform on the filtered graph
 *   4. Calls elk.layout()
 *   5. Absolutises all node coordinates (ELK gives relative positions)
 *   6. Renders compound nodes back-to-front (largest first so borders
 *      don't occlude children), then leaf nodes, then edges
 *
 * Re-layout is triggered by a useMemo over the interaction state that
 * affects graph structure (expandedIds, maxLevel). Visual-only state
 * (selectedId, visibleFamilies, showEdgeLabels) does NOT trigger re-layout —
 * it only affects how existing layout coordinates are rendered, keeping
 * the diagram stable during exploration.
 *
 * Props:
 *   manifest         {object}   Parsed Canopus YAML manifest
 *   state            {object}   Return value of useCanopusState()
 *   width            {number}   SVG viewport width (px)
 *   height           {number}   SVG viewport height (px)
 */

import React, { useEffect, useState, useMemo, useRef } from 'react';
import ELK from 'elkjs/lib/elk.bundled.js';
import { manifestToElk } from '../manifest-to-elk.js';
import { CanopusNode } from './CanopusNode.jsx';
import { CanopusEdge, ArrowheadDefs } from './CanopusEdge.jsx';
import { SURFACE } from './tokens.js';

const elk = new ELK();

// ─────────────────────────────────────────────────────────────────────────────
// Manifest pruning based on interaction state
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Prune the manifest component tree:
 *   - Nodes beyond maxLevel are removed
 *   - Children of collapsed compound nodes are removed (replaced by a
 *     collapsed placeholder — the compound node itself remains so ELK
 *     can size it as a leaf)
 *
 * Returns a new manifest object (does not mutate the original).
 */
function pruneManifest(manifest, expandedIds, maxLevel, isNodeVisible) {
  function pruneComponents(components) {
    return components
      .filter(c => isNodeVisible(c.level))
      .map(c => {
        if (!c.children?.length) return c;

        // Compound node: include children only if expanded
        if (!expandedIds.has(c.id)) {
          // Collapsed — return as a leaf (no children)
          return { ...c, children: [] };
        }

        return { ...c, children: pruneComponents(c.children) };
      });
  }

  // Also prune connections whose endpoints were removed
  const prunedComponents = pruneComponents(manifest.components);
  const visibleIds = collectIds(prunedComponents);

  const prunedConnections = manifest.connections.filter(
    conn => visibleIds.has(conn.from) && visibleIds.has(conn.to)
  );

  return { ...manifest, components: prunedComponents, connections: prunedConnections };
}

function collectIds(components, ids = new Set()) {
  for (const c of components) {
    ids.add(c.id);
    if (c.children?.length) collectIds(c.children, ids);
  }
  return ids;
}

// ─────────────────────────────────────────────────────────────────────────────
// Coordinate absolutisation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ELK gives each node's (x, y) relative to its parent container.
 * For flat SVG rendering we need absolute coordinates.
 *
 * Mutates the layouted graph in-place (safe — it's a fresh object from ELK).
 * Also flattens the full node tree and full edge list for the renderer.
 *
 * Returns { nodes: [...], edges: [...] } both in render order.
 */
function absolutiseAndFlatten(elkNode, parentX = 0, parentY = 0, nodes = [], edges = []) {
  // Skip the invisible root
  if (elkNode.id !== '__root__') {
    elkNode.x = (elkNode.x ?? 0) + parentX;
    elkNode.y = (elkNode.y ?? 0) + parentY;

    // Absolutise port positions too
    if (elkNode.ports) {
      for (const port of elkNode.ports) {
        port.x = (port.x ?? 0);  // already relative to node origin — keep as-is
        port.y = (port.y ?? 0);
      }
    }

    nodes.push(elkNode);
  }

  // Absolutise edges — ELK section coordinates are already absolute
  // within the container's coordinate frame; add parent offset
  if (elkNode.edges) {
    for (const edge of elkNode.edges) {
      if (elkNode.id !== '__root__') {
        for (const section of (edge.sections ?? [])) {
          const offset = (pt) => ({ x: pt.x + parentX, y: pt.y + parentY });
          section.startPoint  = offset(section.startPoint);
          section.endPoint    = offset(section.endPoint);
          section.bendPoints  = (section.bendPoints ?? []).map(offset);
        }
      }
      edges.push(edge);
    }
  }

  const absX = elkNode.id === '__root__' ? 0 : elkNode.x;
  const absY = elkNode.id === '__root__' ? 0 : elkNode.y;

  for (const child of (elkNode.children ?? [])) {
    absolutiseAndFlatten(child, absX, absY, nodes, edges);
  }

  return { nodes, edges };
}

// ─────────────────────────────────────────────────────────────────────────────
// CanopusCanvas
// ─────────────────────────────────────────────────────────────────────────────

export function CanopusCanvas({ manifest, state, width = 1200, height = 800 }) {
  const [layoutResult, setLayoutResult] = useState(null);
  const [layoutError,  setLayoutError]  = useState(null);
  const [isLoading,    setIsLoading]    = useState(true);

  // Viewport pan/zoom state
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: width, h: height });
  const svgRef  = useRef(null);
  const panRef  = useRef(null);  // { startX, startY, origVB }

  // ── Layout inputs — only structural state drives re-layout ───────────────
  const layoutInputKey = useMemo(() => {
    return JSON.stringify({
      expandedIds: [...state.expandedIds].sort(),
      maxLevel:    state.maxLevel,
    });
  }, [state.expandedIds, state.maxLevel]);

  useEffect(() => {
    setIsLoading(true);
    setLayoutError(null);

    const pruned  = pruneManifest(
      manifest,
      state.expandedIds,
      state.maxLevel,
      state.isNodeVisible
    );

    let elkGraph;
    try {
      elkGraph = manifestToElk(pruned);
    } catch (err) {
      setLayoutError(`Transform error: ${err.message}`);
      setIsLoading(false);
      return;
    }

    elk.layout(elkGraph)
      .then(laid => {
        const { nodes, edges } = absolutiseAndFlatten(laid);
        setLayoutResult({ nodes, edges });
        setIsLoading(false);
      })
      .catch(err => {
        setLayoutError(`ELK layout error: ${err.message}`);
        setIsLoading(false);
      });
  }, [layoutInputKey, manifest]);  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pan / zoom interaction ────────────────────────────────────────────────
  const handleWheel = (e) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.1 : 0.9;
    setViewBox(vb => {
      const cx = vb.x + vb.w / 2;
      const cy = vb.y + vb.h / 2;
      const nw = Math.max(200, Math.min(8000, vb.w * factor));
      const nh = Math.max(200, Math.min(8000, vb.h * factor));
      return { x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh };
    });
  };

  const handleMouseDown = (e) => {
    if (e.button !== 1 && !(e.button === 0 && e.altKey)) return;  // middle or alt+left
    panRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origVB: { ...viewBox },
    };
    e.preventDefault();
  };

  const handleMouseMove = (e) => {
    if (!panRef.current) return;
    const { startX, startY, origVB } = panRef.current;
    const svgRect = svgRef.current?.getBoundingClientRect();
    if (!svgRect) return;
    const scaleX = origVB.w / svgRect.width;
    const scaleY = origVB.h / svgRect.height;
    setViewBox({
      ...origVB,
      x: origVB.x - (e.clientX - startX) * scaleX,
      y: origVB.y - (e.clientY - startY) * scaleY,
    });
  };

  const handleMouseUp = () => { panRef.current = null; };

  // ── Render order: compounds back-to-front, then leaves, then edges ────────
  const { compoundNodes, leafNodes } = useMemo(() => {
    if (!layoutResult) return { compoundNodes: [], leafNodes: [] };

    const compounds = layoutResult.nodes
      .filter(n => n.children !== undefined)   // ELK keeps children array even if empty
      .sort((a, b) => (b.width * b.height) - (a.width * a.height));  // largest first

    const leaves = layoutResult.nodes.filter(n => n.children === undefined);
    return { compoundNodes: compounds, leafNodes: leaves };
  }, [layoutResult]);

  // ── Node id → path state index for edges ─────────────────────────────────
  const hasSelection = state.selectedId != null;

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
      style={{
        background: SURFACE.background,
        display: 'block',
        cursor: panRef.current ? 'grabbing' : 'default',
      }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={(e) => {
        // Click on canvas background → clear selection
        if (e.target === svgRef.current) state.clearSelection();
      }}
    >
      <defs>
        <ArrowheadDefs />
      </defs>

      {isLoading && (
        <text x="50%" y="50%" textAnchor="middle" fill="#4a5568" fontSize={13}>
          Computing layout…
        </text>
      )}

      {layoutError && (
        <text x="50%" y="50%" textAnchor="middle" fill="#e05252" fontSize={12}>
          {layoutError}
        </text>
      )}

      {!isLoading && !layoutError && layoutResult && (
        <>
          {/* 1. Compound nodes — back to front */}
          {compoundNodes.map(node => (
            <CanopusNode
              key={node.id}
              node={node}
              isCompound={true}
              isExpanded={state.expandedIds.has(node.id)}
              pathState={state.nodePathState(node.id)}
              isLevelVisible={state.isNodeVisible(node.canopus?.level)}
              onToggle={state.toggleExpanded}
              onSelect={state.selectNode}
            />
          ))}

          {/* 2. Leaf nodes */}
          {leafNodes.map(node => (
            <CanopusNode
              key={node.id}
              node={node}
              isCompound={false}
              isExpanded={false}
              pathState={state.nodePathState(node.id)}
              isLevelVisible={state.isNodeVisible(node.canopus?.level)}
              onToggle={() => {}}
              onSelect={state.selectNode}
            />
          ))}

          {/* 3. Edges */}
          {layoutResult.edges.map(edge => (
            <CanopusEdge
              key={edge.id}
              edge={edge}
              isVisible={state.isEdgeVisible(edge.canopus?.type)}
              fromPathState={state.nodePathState(
                // Recover source node id from port id convention: nodeId__out__connId
                edge.sources?.[0]?.split('__out__')?.[0] ?? ''
              )}
              toPathState={state.nodePathState(
                edge.targets?.[0]?.split('__in__')?.[0] ?? ''
              )}
              showLabel={state.showEdgeLabels}
              hasActiveSelection={hasSelection}
            />
          ))}
        </>
      )}
    </svg>
  );
}
