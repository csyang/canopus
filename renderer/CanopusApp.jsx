/**
 * CanopusApp.jsx
 * Canopus — Root Application Component
 *
 * Wires together the manifest, state hook, toolbar, canvas, and detail panel.
 * This is the entry point for the Electron renderer process.
 *
 * Usage (Electron renderer process, e.g. renderer.jsx):
 *
 *   import React from 'react';
 *   import { createRoot } from 'react-dom/client';
 *   import { CanopusApp } from './renderer/CanopusApp.jsx';
 *   import manifest from './topologies/canonical_single_agent.canopus.json';
 *
 *   createRoot(document.getElementById('root')).render(
 *     <CanopusApp manifest={manifest} />
 *   );
 *
 * The manifest prop accepts either the raw parsed YAML/JSON object or a
 * URL string — if a string is provided, CanopusApp fetches it on mount.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { CanopusCanvas }  from './CanopusCanvas.jsx';
import { CanopusToolbar } from './CanopusToolbar.jsx';
import { useCanopusState, buildConnectionIndex } from './useCanopusState.js';
import { SURFACE, NODE_STYLE, EDGE_STYLE, TYPOGRAPHY } from './tokens.js';

// ─────────────────────────────────────────────────────────────────────────────
// Detail panel — shown when a node is selected
// ─────────────────────────────────────────────────────────────────────────────

function DetailPanel({ manifest, selectedId, onClose }) {
  if (!selectedId) return null;

  // Find the component in the manifest (recursive)
  function findComponent(components, id) {
    for (const c of components) {
      if (c.id === id) return c;
      if (c.children?.length) {
        const found = findComponent(c.children, id);
        if (found) return found;
      }
    }
    return null;
  }

  const comp = findComponent(manifest.components, selectedId);
  if (!comp) return null;

  // Find all connections involving this component
  const relatedConns = manifest.connections.filter(
    c => c.from === selectedId || c.to === selectedId
  );

  const panelStyle = {
    position:      'absolute',
    top:           0,
    right:         0,
    width:         '260px',
    height:        '100%',
    background:    SURFACE.panel,
    borderLeft:    `1px solid ${SURFACE.border}`,
    padding:       '16px',
    fontFamily:    TYPOGRAPHY.nodeFont,
    fontSize:      '11px',
    color:         '#6b7a99',
    overflowY:     'auto',
    boxSizing:     'border-box',
  };

  const fieldStyle = {
    marginBottom: '10px',
  };

  const keyStyle = {
    fontSize:      '9px',
    color:         '#3a4155',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    marginBottom:  '3px',
  };

  const valueStyle = {
    color: '#8a9abb',
  };

  const connStyle = {
    padding:      '4px 6px',
    marginBottom: '4px',
    borderRadius: '3px',
    background:   '#0d1117',
    border:       `1px solid ${SURFACE.border}`,
    fontSize:     '10px',
  };

  const getEdgeColor = (type) => EDGE_STYLE[type]?.stroke ?? '#4a5568';

  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
        <span style={{ color: '#3ab8b8', fontSize: '12px', fontWeight: 500 }}>
          Component
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none',
            color: '#3a4155', cursor: 'pointer', fontSize: '14px',
          }}
        >
          ✕
        </button>
      </div>

      <div style={fieldStyle}>
        <div style={keyStyle}>ID</div>
        <div style={valueStyle}>{comp.id}</div>
      </div>

      <div style={fieldStyle}>
        <div style={keyStyle}>Type</div>
        <div style={{ ...valueStyle, color: NODE_STYLE[comp.type]?.labelColor ?? '#8a9abb' }}>
          {comp.type}
        </div>
      </div>

      {comp.label && (
        <div style={fieldStyle}>
          <div style={keyStyle}>Class</div>
          <div style={valueStyle}>{comp.label}</div>
        </div>
      )}

      {comp.mode && (
        <div style={fieldStyle}>
          <div style={keyStyle}>Mode</div>
          <div style={{ ...valueStyle, color: comp.mode === 'passive' ? '#4a7a8a' : '#5b8fd4' }}>
            {comp.mode}
          </div>
        </div>
      )}

      {comp.level != null && (
        <div style={fieldStyle}>
          <div style={keyStyle}>Abstraction Level</div>
          <div style={valueStyle}>{comp.level}</div>
        </div>
      )}

      {comp.meta && Object.keys(comp.meta).length > 0 && (
        <div style={fieldStyle}>
          <div style={keyStyle}>Meta</div>
          {Object.entries(comp.meta).map(([k, v]) => (
            <div key={k} style={{ ...valueStyle, fontSize: '10px' }}>
              {k}: {String(v)}
            </div>
          ))}
        </div>
      )}

      {relatedConns.length > 0 && (
        <div style={fieldStyle}>
          <div style={{ ...keyStyle, marginTop: '8px', marginBottom: '6px' }}>
            Connections ({relatedConns.length})
          </div>
          {relatedConns.map(conn => (
            <div key={conn.id} style={connStyle}>
              <div style={{ color: getEdgeColor(conn.type), marginBottom: '2px', fontSize: '9px' }}>
                {conn.type}
              </div>
              <div style={{ color: '#4a5568' }}>
                {conn.from === selectedId
                  ? `→ ${conn.to}`
                  : `← ${conn.from}`
                }
              </div>
              {conn.transaction && (
                <div style={{ color: '#3a4a5a', fontSize: '9px', marginTop: '2px' }}>
                  {conn.transaction}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CanopusApp
// ─────────────────────────────────────────────────────────────────────────────

export function CanopusApp({ manifest: manifestProp }) {
  // Manifest loading — accepts object or URL string
  const [manifest, setManifest] = useState(
    typeof manifestProp === 'object' ? manifestProp : null
  );
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    if (typeof manifestProp === 'string') {
      fetch(manifestProp)
        .then(r => r.json())
        .catch(() => fetch(manifestProp).then(r => r.text()).then(t => {
          // Try YAML parse if available
          if (window.jsyaml) return window.jsyaml.load(t);
          throw new Error('YAML manifest requires js-yaml to be loaded');
        }))
        .then(setManifest)
        .catch(err => setLoadError(err.message));
    }
  }, [manifestProp]);

  // Connection index — derived once from manifest
  const connectionIndex = useMemo(() => {
    if (!manifest) return { upstream: {}, downstream: {} };
    return buildConnectionIndex(manifest.connections);
  }, [manifest]);

  // Interaction state
  const state = useCanopusState(manifest ?? { components: [], connections: [] }, connectionIndex);

  // Viewport sizing
  const [dims, setDims] = useState({ w: window.innerWidth, h: window.innerHeight - 42 });
  useEffect(() => {
    const onResize = () => setDims({
      w: window.innerWidth,
      h: window.innerHeight - 42,  // subtract toolbar height
    });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────

  const appStyle = {
    display:        'flex',
    flexDirection:  'column',
    width:          '100vw',
    height:         '100vh',
    overflow:       'hidden',
    background:     SURFACE.background,
  };

  const canvasWrapperStyle = {
    position: 'relative',
    flex:     1,
    overflow: 'hidden',
  };

  if (loadError) {
    return (
      <div style={{ ...appStyle, alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#e05252', fontFamily: TYPOGRAPHY.nodeFont, fontSize: 12 }}>
          Failed to load manifest: {loadError}
        </span>
      </div>
    );
  }

  if (!manifest) {
    return (
      <div style={{ ...appStyle, alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#3a4155', fontFamily: TYPOGRAPHY.nodeFont, fontSize: 12 }}>
          Loading manifest…
        </span>
      </div>
    );
  }

  return (
    <div style={appStyle}>
      <CanopusToolbar state={state} manifestName={manifest.name} />

      <div style={canvasWrapperStyle}>
        <CanopusCanvas
          manifest={manifest}
          state={state}
          width={dims.w}
          height={dims.h}
        />

        <DetailPanel
          manifest={manifest}
          selectedId={state.selectedId}
          onClose={state.clearSelection}
        />
      </div>
    </div>
  );
}
