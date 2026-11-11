/**
 * electron/preload.ts
 * Canopus — Electron Preload Script
 *
 * Runs in a privileged context with access to both Node.js APIs and the
 * renderer's DOM. Uses Electron's contextBridge to expose a narrow,
 * explicit API surface to the renderer process under window.canopus.
 *
 * Security model:
 *   - contextIsolation: true  (renderer cannot access Node directly)
 *   - nodeIntegration: false  (renderer has no require())
 *   - All file system and dialog operations go through the main process
 *     via IPC — the renderer never touches the file system directly
 *
 * IPC channels:
 *   canopus:open-manifest   renderer → main  → renderer  (request + response)
 *   canopus:export-svg      renderer → main              (fire and forget)
 *   canopus:manifest-ready  main     → renderer          (push after file open)
 */

import { contextBridge, ipcRenderer } from 'electron';
import type { CanopusManifest }        from '../types.js';

// ─────────────────────────────────────────────────────────────────────────────
// API surface exposed to the renderer as window.canopus
// ─────────────────────────────────────────────────────────────────────────────

export interface CanopusElectronAPI {
  /**
   * Open the native file picker and load a .canopus.yaml manifest.
   * Returns the parsed manifest object, or null if the user cancelled.
   */
  openManifest: () => Promise<CanopusManifest | null>;

  /**
   * Write an SVG string to disk via the native save dialog.
   * Returns the path written, or null if the user cancelled.
   */
  exportSvg: (svgContent: string, defaultName: string) => Promise<string | null>;

  /**
   * Register a callback invoked when the main process pushes a manifest
   * (e.g. opened via the File menu or drag-and-drop onto the dock icon).
   * Returns an unsubscribe function.
   */
  onManifestReady: (
    callback: (manifest: CanopusManifest) => void
  ) => () => void;

  /**
   * Request the app version string from the main process.
   */
  getVersion: () => Promise<string>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

const api: CanopusElectronAPI = {

  openManifest: () =>
    ipcRenderer.invoke('canopus:open-manifest'),

  exportSvg: (svgContent, defaultName) =>
    ipcRenderer.invoke('canopus:export-svg', { svgContent, defaultName }),

  onManifestReady: (callback) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      manifest: CanopusManifest
    ) => callback(manifest);

    ipcRenderer.on('canopus:manifest-ready', handler);

    // Return unsubscribe function
    return () => ipcRenderer.removeListener('canopus:manifest-ready', handler);
  },

  getVersion: () =>
    ipcRenderer.invoke('canopus:get-version'),
};

contextBridge.exposeInMainWorld('canopus', api);

// ─────────────────────────────────────────────────────────────────────────────
// Type augmentation for the renderer
// ─────────────────────────────────────────────────────────────────────────────

// This declaration makes window.canopus typed in all renderer TypeScript files.
// Kept here so it co-locates with the implementation.
declare global {
  interface Window {
    canopus: CanopusElectronAPI;
  }
}
