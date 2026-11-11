/**
 * renderer.tsx
 * Canopus — Renderer Process Entry Point
 *
 * Mounts the React application and wires the Electron IPC bridge into
 * the CanopusApp component. When running outside Electron (e.g. browser
 * dev server for UI development), the window.canopus API is absent and
 * a stub is used so the app renders without crashing.
 *
 * Manifest loading flow:
 *   1. Main process opens file dialog (menu or IPC request from renderer)
 *   2. Main reads file, sends raw YAML string via IPC
 *   3. Renderer parses YAML with js-yaml, validates via validateManifest()
 *   4. Valid manifest → CanopusApp renders the topology
 *   5. Invalid manifest → error state shown inline
 */

import React, {
  useState,
  useEffect,
  useCallback,
}                          from 'react';
import { createRoot }      from 'react-dom/client';
import yaml                from 'js-yaml';
import { CanopusApp }      from './renderer/CanopusApp.jsx';
import { validateManifest,
         formatErrors }    from './validate.js';
import type {
  CanopusManifest,
}                          from './types.js';
import { SURFACE, TYPOGRAPHY } from './renderer/tokens.js';

// ─────────────────────────────────────────────────────────────────────────────
// Electron API stub for browser-only development
// ─────────────────────────────────────────────────────────────────────────────

const isElectron = typeof window !== 'undefined' && 'canopus' in window;

const electronAPI = isElectron
  ? window.canopus
  : {
      openManifest:    async () => null,
      exportSvg:       async () => null,
      onManifestReady: () => () => {},
      getVersion:      async () => '0.1.0-dev',
    };

// ─────────────────────────────────────────────────────────────────────────────
// Manifest loading helpers
// ─────────────────────────────────────────────────────────────────────────────

type LoadResult =
  | { status: 'idle' }
  | { status: 'loaded';  manifest: CanopusManifest; filePath: string }
  | { status: 'error';   message: string; filePath?: string };

function parseAndValidate(raw: string, filePath: string): LoadResult {
  let parsed: unknown;

  try {
    parsed = yaml.load(raw);
  } catch (e) {
    return {
      status:   'error',
      message:  `YAML parse error in ${filePath}:\n${String(e)}`,
      filePath,
    };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return {
      status:   'error',
      message:  `${filePath}: manifest must be a YAML/JSON object`,
      filePath,
    };
  }

  const result = validateManifest(parsed as Record<string, unknown>);

  if (!result.valid) {
    return {
      status:   'error',
      message:  formatErrors(result.errors, filePath),
      filePath,
    };
  }

  return {
    status:   'loaded',
    manifest: parsed as CanopusManifest,
    filePath,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Root application shell
// ─────────────────────────────────────────────────────────────────────────────

function CanopusShell(): React.ReactElement {
  const [loadResult, setLoadResult] = useState<LoadResult>({ status: 'idle' });

  // ── Handle manifest pushed from main process ─────────────────────────
  useEffect(() => {
    const unsub = electronAPI.onManifestReady((payload) => {
      // Main sends { raw, filePath } — parse and validate in renderer
      const { raw, filePath } = payload as unknown as {
        raw: string;
        filePath: string;
      };
      setLoadResult(parseAndValidate(raw, filePath));
    });
    return unsub;
  }, []);

  // ── Handle SVG export trigger from menu ──────────────────────────────
  useEffect(() => {
    if (!isElectron) return;

    const handler = async () => {
      if (loadResult.status !== 'loaded') return;

      // Request SVG from the canvas via a custom DOM event
      // CanopusApp listens for this and calls window.canopus.exportSvg()
      window.dispatchEvent(new CustomEvent('canopus:export-svg-request'));
    };

    // Listen for the menu-triggered export
    window.addEventListener('canopus:export-svg-triggered', handler);
    return () => window.removeEventListener('canopus:export-svg-triggered', handler);
  }, [loadResult]);

  // ── Handle keyboard shortcuts forwarded from main ────────────────────
  useEffect(() => {
    if (!isElectron) return;

    const ipc = window.canopus;

    // View menu commands forward as custom window events
    // CanopusApp / useCanopusState responds to these
    const events = [
      'canopus:expand-all',
      'canopus:collapse-all',
      'canopus:zoom-in',
      'canopus:zoom-out',
      'canopus:zoom-reset',
    ] as const;

    // Electron IPC events from main → forward as DOM events for CanopusApp
    // (ipcRenderer.on is behind the preload; main sends via webContents.send)
    // CanopusApp registers listeners for these DOM events
    const forwards = events.map(channel => {
      const fn = () => window.dispatchEvent(new CustomEvent(channel));
      window.addEventListener(channel, fn);
      return { channel, fn };
    });

    return () => {
      forwards.forEach(({ channel, fn }) =>
        window.removeEventListener(channel, fn)
      );
    };
  }, []);

  // ── Open manifest from renderer (empty state button) ─────────────────
  const handleOpenRequest = useCallback(async () => {
    const result = await electronAPI.openManifest();
    if (!result) return;   // user cancelled

    const { raw, filePath, error } = result as {
      raw?: string;
      filePath?: string;
      error?: string;
    };

    if (error || !raw || !filePath) {
      setLoadResult({
        status:  'error',
        message: error ?? 'Unknown error reading file',
      });
      return;
    }

    setLoadResult(parseAndValidate(raw, filePath));
  }, []);

  // ─────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────

  if (loadResult.status === 'idle') {
    return <EmptyState onOpen={handleOpenRequest} />;
  }

  if (loadResult.status === 'error') {
    return (
      <ErrorState
        message={loadResult.message}
        onOpen={handleOpenRequest}
      />
    );
  }

  return (
    <CanopusApp
      manifest={loadResult.manifest}
      onExportSvg={async (svgContent: string) => {
        const name = loadResult.manifest.name ?? 'canopus-topology';
        await electronAPI.exportSvg(svgContent, `${name}.svg`);
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty state — shown before any manifest is loaded
// ─────────────────────────────────────────────────────────────────────────────

function EmptyState({ onOpen }: { onOpen: () => void }): React.ReactElement {
  const style: React.CSSProperties = {
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    justifyContent: 'center',
    width:          '100vw',
    height:         '100vh',
    background:     SURFACE.background,
    gap:            '24px',
    fontFamily:     TYPOGRAPHY.nodeFont,
  };

  return (
    <div style={style}>
      <img
        src="/assets/icon.png"
        alt="Canopus"
        style={{ width: 96, height: 96, opacity: 0.7, borderRadius: 20 }}
      />
      <div style={{ color: '#3a4155', fontSize: '14px' }}>
        No topology loaded
      </div>
      <button
        onClick={onOpen}
        style={{
          padding:      '8px 20px',
          borderRadius: '4px',
          border:       '1px solid #2a4a7f',
          background:   '#0d1e36',
          color:        '#4a90d9',
          fontFamily:   TYPOGRAPHY.nodeFont,
          fontSize:     '12px',
          cursor:       'pointer',
        }}
      >
        Open Manifest…
      </button>
      <div style={{ color: '#2a3040', fontSize: '10px' }}>
        or use File → Open Manifest  (⌘O)
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Error state — shown when a manifest fails to load or validate
// ─────────────────────────────────────────────────────────────────────────────

function ErrorState({
  message,
  onOpen,
}: {
  message: string;
  onOpen: () => void;
}): React.ReactElement {
  const style: React.CSSProperties = {
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'flex-start',
    justifyContent: 'center',
    width:          '100vw',
    height:         '100vh',
    background:     SURFACE.background,
    padding:        '48px',
    boxSizing:      'border-box',
    fontFamily:     TYPOGRAPHY.nodeFont,
  };

  return (
    <div style={style}>
      <div style={{ color: '#e05252', fontSize: '12px', marginBottom: '16px' }}>
        ✗ Failed to load manifest
      </div>
      <pre style={{
        color:       '#8a4040',
        fontSize:    '11px',
        lineHeight:  1.6,
        whiteSpace:  'pre-wrap',
        maxWidth:    '720px',
        marginBottom: '24px',
      }}>
        {message}
      </pre>
      <button
        onClick={onOpen}
        style={{
          padding:      '6px 16px',
          borderRadius: '4px',
          border:       '1px solid #3a2020',
          background:   'transparent',
          color:        '#6a4040',
          fontFamily:   TYPOGRAPHY.nodeFont,
          fontSize:     '11px',
          cursor:       'pointer',
        }}
      >
        Try another file…
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mount
// ─────────────────────────────────────────────────────────────────────────────

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

createRoot(container).render(
  <React.StrictMode>
    <CanopusShell />
  </React.StrictMode>
);
