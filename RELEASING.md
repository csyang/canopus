# Canopus — Release Process

This document describes the full process for building and publishing a Canopus release to the shared NFS drive.

---

## Who does releases

Any engineer with:
- A working Node.js ≥ 18 installation
- The Canopus source tree on their local machine
- The NFS share mounted (for publishing)

Releases are built locally and copied to the NFS share. Colleagues install directly from the share — no internet connection or accounts required.

---

## One-time setup

### 1. Install dependencies

```bash
cd canopus
npm install
```

### 2. Configure your NFS path

Copy the example environment file and set your NFS mount point:

```bash
cp .release.env.example .release.env
```

Edit `.release.env`:

```bash
# Set this to the path where the NFS share is mounted on your machine
NFS_RELEASE_PATH=/mnt/nfs/releases/canopus
```

The NFS path will differ by machine depending on how your share is mounted. Ask a colleague if you are unsure of the mount point. Common patterns:

| OS | Typical pattern |
|---|---|
| Linux | `/mnt/nfs/releases/canopus` or `/net/server/releases/canopus` |
| macOS | `/Volumes/Engineering/releases/canopus` |

### 3. Verify your setup with a dry run

```bash
./release.sh --dry-run
```

This runs the full build and package steps but copies nothing to the NFS share. Use this to confirm everything works before your first real release.

---

## Bumping the version

Before publishing a new release, update the version in `package.json`:

```bash
# Patch release (0.1.0 → 0.1.1) — bug fixes
npm version patch

# Minor release (0.1.0 → 0.2.0) — new features, backward-compatible schema
npm version minor

# Major release (0.1.0 → 1.0.0) — breaking schema changes
npm version major
```

`npm version` updates `package.json` and creates a git commit and tag automatically if you are using git.

If you are not using git, edit the `"version"` field in `package.json` directly.

---

## Building and publishing a release

```bash
./release.sh
```

The script will:

1. Check that the NFS share is reachable
2. Build the project (`tsc` + `vite`)
3. Run `electron-builder` for your current platform
4. Prompt you to confirm before copying anything
5. Copy the installer(s) to `$NFS_RELEASE_PATH/<version>/`
6. Write a `release.json` manifest in the versioned directory
7. Update `latest.json` at the root of the release share

### Targeting a specific platform

```bash
./release.sh --platform mac    # macOS .dmg and .zip
./release.sh --platform win    # Windows .exe (NSIS installer)
./release.sh --platform linux  # Linux .AppImage
```

Note: macOS packages (`.dmg`) must be built on a macOS machine. Windows and Linux packages can be built on any platform.

### Skipping the build step

If you have already built and just want to repackage or re-publish:

```bash
./release.sh --skip-build
```

---

## NFS share structure

After publishing, the NFS share looks like this:

```
$NFS_RELEASE_PATH/
├── latest.json                    ← always points to the newest version
├── 0.1.0/
│   ├── release.json               ← metadata for this release
│   ├── Canopus-0.1.0.dmg         ← macOS installer
│   ├── Canopus-0.1.0-arm64.dmg   ← macOS Apple Silicon installer
│   ├── Canopus Setup 0.1.0.exe   ← Windows NSIS installer
│   └── Canopus-0.1.0.AppImage    ← Linux AppImage
├── 0.1.1/
│   ├── release.json
│   └── ...
```

Previous versions are kept on the share indefinitely. Do not delete old versions without checking with colleagues who may be on an older install.

---

## What colleagues do to install

Point colleagues at the NFS share. They:

1. Navigate to `$NFS_RELEASE_PATH/` on the share
2. Open the folder for the latest version (or check `latest.json`)
3. Download the installer for their platform:
   - **macOS** → `.dmg` — open, drag Canopus to Applications
   - **Windows** → `.exe` — run the NSIS installer wizard
   - **Linux** → `.AppImage` — mark executable, then double-click or run directly
4. On first launch, macOS may show a Gatekeeper warning (app is not notarised). Right-click → Open to bypass it the first time.

---

## Troubleshooting

### `Cannot reach NFS share`

The NFS share is not mounted. Mount it before running the release script:

```bash
# Linux example
sudo mount -t nfs server:/exports/releases /mnt/nfs/releases

# macOS example — usually auto-mounted via Finder → Go → Connect to Server
open "nfs://server/releases"
```

### `No installer files found`

The packaging step ran but produced unexpected output. Check `dist/packages/` manually:

```bash
ls -lh dist/packages/
```

electron-builder writes a log to `electron-builder.log` in the project root if it encounters errors.

### Build errors

Run the build step in isolation to see the full output:

```bash
npm run build
```

TypeScript errors appear first (from `tsc`), followed by Vite bundling output.

### `permission denied` on NFS copy

Your user account does not have write permission to the NFS share. Ask your system administrator to grant write access to the `releases/canopus` directory.

---

## Keeping old releases

The release script never deletes old versions. The NFS share will accumulate a directory per version. A rough retention policy suggestion:

- Keep all releases from the current minor version
- Keep the last release from each previous minor version
- Archive (compress and keep) anything older than 6 months

There is no automated cleanup — this is a manual housekeeping task.

---

## Making a release from scratch (checklist)

```
□ Ensure all changes are working (npm test passes)
□ Update REQUIREMENTS.md — move In Progress items to Accomplished
□ Bump version: npm version patch|minor|major
□ Confirm NFS share is mounted
□ ./release.sh --dry-run    (confirm no errors)
□ ./release.sh              (confirm, publish)
□ Notify colleagues of the new version and NFS path
```
