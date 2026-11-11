/**
 * electron/main.ts
 * Canopus — Electron Main Process
 *
 * Responsibilities:
 *   - Create and manage the BrowserWindow
 *   - Build the application menu (File, View, Help)
 *   - Handle IPC requests from the renderer (file open, SVG export)
 *   - Push manifests to the renderer when opened via menu or CLI argument
 *
 * Process boundary:
 *   This file runs in Node.js. It has full file system access.
 *   It never runs user-provided YAML directly — it reads the file and
 *   sends the raw string to the renderer, which parses and validates it.
 *   This keeps parsing errors contained in the renderer where they can
 *   be displayed gracefully in the UI.
 */

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  type MenuItemConstructorOptions,
}                        from 'electron';
import { readFileSync,
         writeFileSync } from 'fs';
import { join }          from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const isDev   = !app.isPackaged;
const VITE_URL = 'http://localhost:5173';   // Vite dev server
const DIST_DIR = join(__dirname, '../dist/renderer');

// ─────────────────────────────────────────────────────────────────────────────
// Window management
// ─────────────────────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width:           1400,
    height:          900,
    minWidth:        800,
    minHeight:       600,
    title:           'Canopus',
    icon:            join(__dirname, '../assets/icon.png'),
    backgroundColor: '#0f1117',     // matches SURFACE.background from tokens.js
    titleBarStyle:   'hiddenInset', // macOS native feel
    show:            false,         // show only after ready-to-show

    webPreferences: {
      preload:          join(__dirname, 'preload.js'),
      contextIsolation: true,    // renderer cannot access Node
      nodeIntegration:  false,   // renderer has no require()
      sandbox:          false,   // needed for preload to use ipcRenderer
    },
  });

  // Load the renderer
  if (isDev) {
    win.loadURL(VITE_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(join(DIST_DIR, 'index.html'));
  }

  // Show only once fully loaded — avoids white flash on dark background
  win.once('ready-to-show', () => {
    win.show();

    // If launched with a manifest file argument, open it immediately
    const argPath = getCliManifestArg();
    if (argPath) {
      sendManifestFromFile(win, argPath);
    }
  });

  win.on('closed', () => { mainWindow = null; });

  return win;
}

/**
 * Extract a .canopus.yaml argument from process.argv.
 * Supports: canopus my_topology.canopus.yaml
 */
function getCliManifestArg(): string | null {
  const args = process.argv.slice(isDev ? 2 : 1);
  const path = args.find(a => /\.(yaml|yml|json)$/i.test(a));
  return path ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// File handling helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read a manifest file and push its raw content to the renderer.
 * The renderer is responsible for parsing and validating.
 */
function sendManifestFromFile(win: BrowserWindow, filePath: string): void {
  try {
    const raw = readFileSync(filePath, 'utf8');
    win.webContents.send('canopus:manifest-ready', { raw, filePath });
    app.addRecentDocument(filePath);
  } catch (err) {
    dialog.showErrorBox(
      'Cannot open file',
      `Could not read: ${filePath}\n\n${String(err)}`
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Application menu
// ─────────────────────────────────────────────────────────────────────────────

function buildMenu(): void {
  const isMac = process.platform === 'darwin';

  const template: MenuItemConstructorOptions[] = [
    // ── macOS app menu ──────────────────────────────────────────────────
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        { role: 'services' as const },
        { type: 'separator' as const },
        { role: 'hide' as const },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const },
      ],
    }] : []),

    // ── File ────────────────────────────────────────────────────────────
    {
      label: 'File',
      submenu: [
        {
          label:       'Open Manifest…',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            if (!mainWindow) return;
            const result = await dialog.showOpenDialog(mainWindow, {
              title:       'Open Canopus Manifest',
              filters:     [
                { name: 'Canopus Manifests', extensions: ['yaml', 'yml'] },
                { name: 'JSON Manifests',    extensions: ['json'] },
                { name: 'All Files',         extensions: ['*'] },
              ],
              properties: ['openFile'],
            });
            if (!result.canceled && result.filePaths[0]) {
              sendManifestFromFile(mainWindow, result.filePaths[0]);
            }
          },
        },
        {
          label:       'Open Recent',
          role:        'recentDocuments' as const,
          submenu: [
            { label: 'Clear Recent', role: 'clearRecentDocuments' as const },
          ],
        },
        { type: 'separator' as const },
        {
          label:       'Export SVG…',
          accelerator: 'CmdOrCtrl+Shift+E',
          click: () => {
            mainWindow?.webContents.send('canopus:trigger-export');
          },
        },
        { type: 'separator' as const },
        isMac
          ? { role: 'close' as const }
          : { role: 'quit'  as const },
      ],
    },

    // ── Edit ────────────────────────────────────────────────────────────
    {
      label: 'Edit',
      submenu: [
        { role: 'undo'      as const },
        { role: 'redo'      as const },
        { type: 'separator' as const },
        { role: 'cut'       as const },
        { role: 'copy'      as const },
        { role: 'paste'     as const },
        { role: 'selectAll' as const },
      ],
    },

    // ── View ────────────────────────────────────────────────────────────
    {
      label: 'View',
      submenu: [
        {
          label:       'Expand All',
          accelerator: 'CmdOrCtrl+Shift+E',
          click: () => mainWindow?.webContents.send('canopus:expand-all'),
        },
        {
          label:       'Collapse All',
          accelerator: 'CmdOrCtrl+Shift+C',
          click: () => mainWindow?.webContents.send('canopus:collapse-all'),
        },
        { type: 'separator' as const },
        {
          label:       'Zoom In',
          accelerator: 'CmdOrCtrl+Plus',
          click: () => mainWindow?.webContents.send('canopus:zoom-in'),
        },
        {
          label:       'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click: () => mainWindow?.webContents.send('canopus:zoom-out'),
        },
        {
          label:       'Reset Zoom',
          accelerator: 'CmdOrCtrl+0',
          click: () => mainWindow?.webContents.send('canopus:zoom-reset'),
        },
        { type: 'separator' as const },
        { role: 'toggleDevTools' as const },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─────────────────────────────────────────────────────────────────────────────
// IPC handlers
// ─────────────────────────────────────────────────────────────────────────────

function registerIpcHandlers(): void {

  // ── canopus:open-manifest ────────────────────────────────────────────
  // Renderer-initiated file open (e.g. drag prompt in empty state)
  ipcMain.handle('canopus:open-manifest', async () => {
    if (!mainWindow) return null;

    const result = await dialog.showOpenDialog(mainWindow, {
      title:   'Open Canopus Manifest',
      filters: [
        { name: 'Canopus Manifests', extensions: ['yaml', 'yml'] },
        { name: 'JSON Manifests',    extensions: ['json'] },
        { name: 'All Files',         extensions: ['*'] },
      ],
      properties: ['openFile'],
    });

    if (result.canceled || !result.filePaths[0]) return null;

    const filePath = result.filePaths[0];
    try {
      const raw = readFileSync(filePath, 'utf8');
      app.addRecentDocument(filePath);
      // Return raw string — renderer parses and validates
      return { raw, filePath };
    } catch (err) {
      return { error: String(err) };
    }
  });

  // ── canopus:export-svg ───────────────────────────────────────────────
  ipcMain.handle('canopus:export-svg', async (_event, {
    svgContent,
    defaultName,
  }: { svgContent: string; defaultName: string }) => {
    if (!mainWindow) return null;

    const result = await dialog.showSaveDialog(mainWindow, {
      title:       'Export SVG Diagram',
      defaultPath: defaultName.endsWith('.svg') ? defaultName : `${defaultName}.svg`,
      filters:     [{ name: 'SVG Files', extensions: ['svg'] }],
    });

    if (result.canceled || !result.filePath) return null;

    try {
      writeFileSync(result.filePath, svgContent, 'utf8');
      return result.filePath;
    } catch (err) {
      dialog.showErrorBox('Export failed', String(err));
      return null;
    }
  });

  // ── canopus:get-version ──────────────────────────────────────────────
  ipcMain.handle('canopus:get-version', () => app.getVersion());
}

// ─────────────────────────────────────────────────────────────────────────────
// App lifecycle
// ─────────────────────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  registerIpcHandlers();
  buildMenu();
  mainWindow = createWindow();

  // macOS: re-create window when dock icon is clicked with no windows open
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    }
  });
});

// Quit on all windows closed (except macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// macOS: open file by dragging onto dock icon
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (mainWindow) {
    sendManifestFromFile(mainWindow, filePath);
  } else {
    // App not ready yet — store and open once window is created
    app.once('browser-window-created', (_, win) => {
      sendManifestFromFile(win, filePath);
    });
  }
});
