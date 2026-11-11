#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# release.sh
# Canopus — Build and publish a release to the NFS share
#
# Usage:
#   ./release.sh                   Build for current platform and publish
#   ./release.sh --dry-run         Build and package but do not copy to NFS
#   ./release.sh --skip-build      Package only (reuse existing dist/)
#   ./release.sh --platform mac    Force macOS build (must run on macOS)
#   ./release.sh --platform win    Force Windows build
#   ./release.sh --platform linux  Force Linux build
#
# Prerequisites:
#   - Node.js >= 18 and npm installed
#   - .release.env configured with NFS_RELEASE_PATH
#   - NFS share mounted at NFS_RELEASE_PATH
#
# What this script does:
#   1. Reads NFS_RELEASE_PATH from .release.env
#   2. Confirms the NFS share is reachable
#   3. Runs npm run build  (tsc + vite)
#   4. Runs electron-builder for the target platform
#   5. Copies installers to NFS_RELEASE_PATH/<version>/
#   6. Writes a release manifest (release.json) to the versioned directory
#   7. Updates NFS_RELEASE_PATH/latest.json to point at the new version
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
RESET='\033[0m'

info()    { echo -e "${CYAN}  →${RESET} $*"; }
success() { echo -e "${GREEN}  ✓${RESET} $*"; }
warn()    { echo -e "${YELLOW}  ⚠${RESET} $*"; }
error()   { echo -e "${RED}  ✗${RESET} $*" >&2; }
header()  { echo -e "\n${BOLD}$*${RESET}"; }

# ── Defaults ─────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DRY_RUN=false
SKIP_BUILD=false
PLATFORM=""      # empty = auto-detect current platform

# ── Argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)      DRY_RUN=true;       shift ;;
    --skip-build)   SKIP_BUILD=true;    shift ;;
    --platform)     PLATFORM="$2";      shift 2 ;;
    --help|-h)
      sed -n '/^# Usage/,/^# ─/p' "$0" | head -n -1 | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *)
      error "Unknown argument: $1"
      exit 1 ;;
  esac
done

# ── Load .release.env ─────────────────────────────────────────────────────────
ENV_FILE="$SCRIPT_DIR/.release.env"
if [[ ! -f "$ENV_FILE" ]]; then
  error ".release.env not found."
  echo ""
  echo "  Create it by copying the example:"
  echo "    cp .release.env.example .release.env"
  echo "  Then set NFS_RELEASE_PATH to your NFS mount point."
  exit 1
fi
# shellcheck source=/dev/null
source "$ENV_FILE"

if [[ -z "${NFS_RELEASE_PATH:-}" ]]; then
  error "NFS_RELEASE_PATH is not set in .release.env"
  exit 1
fi

# ── Read version from package.json ───────────────────────────────────────────
VERSION=$(node -p "require('./package.json').version")
PRODUCT="Canopus"
RELEASE_DATE=$(date -u +"%Y-%m-%d")
RELEASE_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# ── Auto-detect platform ──────────────────────────────────────────────────────
if [[ -z "$PLATFORM" ]]; then
  case "$(uname -s)" in
    Darwin)  PLATFORM="mac"   ;;
    Linux)   PLATFORM="linux" ;;
    MINGW*|MSYS*|CYGWIN*) PLATFORM="win" ;;
    *)
      error "Cannot auto-detect platform: $(uname -s)"
      error "Use --platform mac|win|linux"
      exit 1 ;;
  esac
fi

# ── Platform-specific installer patterns ─────────────────────────────────────
case "$PLATFORM" in
  mac)
    BUILDER_FLAG="--mac"
    INSTALLER_GLOB="dist/packages/*.dmg dist/packages/*.zip"
    PLATFORM_LABEL="macOS"
    ;;
  win)
    BUILDER_FLAG="--win"
    INSTALLER_GLOB="dist/packages/*.exe"
    PLATFORM_LABEL="Windows"
    ;;
  linux)
    BUILDER_FLAG="--linux"
    INSTALLER_GLOB="dist/packages/*.AppImage"
    PLATFORM_LABEL="Linux"
    ;;
  *)
    error "Unknown platform: $PLATFORM. Use mac, win, or linux."
    exit 1 ;;
esac

# ── Print release summary ─────────────────────────────────────────────────────
header "Canopus Release Script"
echo "  Product:   $PRODUCT v$VERSION"
echo "  Platform:  $PLATFORM_LABEL"
echo "  Date:      $RELEASE_DATE"
echo "  NFS path:  $NFS_RELEASE_PATH"
[[ "$DRY_RUN"    == "true" ]] && echo -e "  ${YELLOW}Mode:      DRY RUN — nothing will be copied${RESET}"
[[ "$SKIP_BUILD" == "true" ]] && echo -e "  ${YELLOW}Build:     SKIPPED — using existing dist/${RESET}"
echo ""

# ── Confirm ───────────────────────────────────────────────────────────────────
if [[ "$DRY_RUN" == "false" ]]; then
  read -r -p "  Proceed with release? [y/N] " CONFIRM
  [[ "${CONFIRM,,}" == "y" ]] || { echo "  Cancelled."; exit 0; }
  echo ""
fi

# ── Step 1: NFS reachability check ───────────────────────────────────────────
header "Step 1 — NFS share check"
if [[ "$DRY_RUN" == "true" ]]; then
  info "Dry run: skipping NFS check"
else
  if [[ ! -d "$NFS_RELEASE_PATH" ]]; then
    # Try to create the base directory — will fail cleanly if NFS not mounted
    if ! mkdir -p "$NFS_RELEASE_PATH" 2>/dev/null; then
      error "Cannot reach NFS share: $NFS_RELEASE_PATH"
      error "Ensure the NFS share is mounted before running release."
      exit 1
    fi
  fi
  success "NFS share reachable: $NFS_RELEASE_PATH"
fi

# ── Step 2: Build ─────────────────────────────────────────────────────────────
header "Step 2 — Build"
if [[ "$SKIP_BUILD" == "true" ]]; then
  warn "Skipping build — using existing dist/"
  if [[ ! -d "dist/electron" ]] || [[ ! -d "dist/renderer" ]]; then
    error "dist/electron or dist/renderer not found. Run without --skip-build."
    exit 1
  fi
else
  info "Running npm run build..."
  npm run build
  success "Build complete"
fi

# ── Step 3: Package ───────────────────────────────────────────────────────────
header "Step 3 — Package ($PLATFORM_LABEL)"
info "Running electron-builder $BUILDER_FLAG..."
npx electron-builder $BUILDER_FLAG --config electron-builder.yml
success "Packaging complete"

# ── Step 4: Collect installer files ──────────────────────────────────────────
header "Step 4 — Collect installers"
INSTALLERS=()
for PATTERN in $INSTALLER_GLOB; do
  # shellcheck disable=SC2086
  for FILE in $PATTERN; do
    [[ -f "$FILE" ]] && INSTALLERS+=("$FILE")
  done
done

if [[ ${#INSTALLERS[@]} -eq 0 ]]; then
  error "No installer files found matching: $INSTALLER_GLOB"
  error "Check dist/packages/ for what was actually produced."
  exit 1
fi

info "Found ${#INSTALLERS[@]} installer file(s):"
for F in "${INSTALLERS[@]}"; do
  SIZE=$(du -sh "$F" | cut -f1)
  echo "    $SIZE  $(basename "$F")"
done

# ── Step 5: Copy to NFS ───────────────────────────────────────────────────────
header "Step 5 — Publish to NFS"
VERSIONED_DIR="$NFS_RELEASE_PATH/$VERSION"

if [[ "$DRY_RUN" == "true" ]]; then
  info "Dry run: would copy to $VERSIONED_DIR/"
  for F in "${INSTALLERS[@]}"; do
    echo "    $(basename "$F")"
  done
else
  mkdir -p "$VERSIONED_DIR"

  for F in "${INSTALLERS[@]}"; do
    DEST="$VERSIONED_DIR/$(basename "$F")"
    info "Copying $(basename "$F")..."
    cp "$F" "$DEST"
    success "$(basename "$F") → $VERSIONED_DIR/"
  done

  # ── Step 6: Write release manifest ────────────────────────────────────────
  header "Step 6 — Write release manifest"

  RELEASE_JSON="$VERSIONED_DIR/release.json"
  cat > "$RELEASE_JSON" <<EOF
{
  "product":   "$PRODUCT",
  "version":   "$VERSION",
  "platform":  "$PLATFORM_LABEL",
  "date":      "$RELEASE_DATE",
  "timestamp": "$RELEASE_TIME",
  "files": [
$(printf '    "%s"' "$(basename "${INSTALLERS[0]}")"
for ((i=1; i<${#INSTALLERS[@]}; i++)); do
  printf ',\n    "%s"' "$(basename "${INSTALLERS[$i]}")"
done)
  ]
}
EOF
  success "release.json written"

  # ── Step 7: Update latest.json ────────────────────────────────────────────
  LATEST_JSON="$NFS_RELEASE_PATH/latest.json"
  cat > "$LATEST_JSON" <<EOF
{
  "version":   "$VERSION",
  "platform":  "$PLATFORM_LABEL",
  "date":      "$RELEASE_DATE",
  "timestamp": "$RELEASE_TIME",
  "path":      "$VERSION"
}
EOF
  success "latest.json updated → v$VERSION"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
header "Release complete"
if [[ "$DRY_RUN" == "true" ]]; then
  echo -e "  ${YELLOW}Dry run — no files were copied.${RESET}"
else
  echo -e "  ${GREEN}Canopus v$VERSION ($PLATFORM_LABEL) published to:${RESET}"
  echo "  $VERSIONED_DIR/"
  echo ""
  echo "  Colleagues can install from:"
  echo "  $NFS_RELEASE_PATH/$VERSION/"
fi
echo ""
