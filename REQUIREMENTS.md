# Canopus — Living Requirements Document

> **Project:** Canopus — TLM Topology Visualiser
> **Status:** In Development — Pre-Renderer
> **Schema Version:** 0.1
> **Last Updated:** 2026-05-20
> **Related Project:** Cartographer (`carto`) — Register Map Manager (separate tool, no integration planned)

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Decisions Made](#2-decisions-made)
3. [Accomplished](#3-accomplished)
4. [In Progress](#4-in-progress)
5. [Remaining Work](#5-remaining-work)
6. [Open Questions / Actions Required](#6-open-questions--actions-required)
7. [Reference Artefacts](#7-reference-artefacts)
8. [Topology Archetypes](#8-topology-archetypes)

---

## 1. Project Overview

Canopus is a visualisation tool for TLM (Transaction-Level Modelling) topologies used in UVM-based hardware verification environments. It renders directed graphs of component containment hierarchies and TLM/port communication connections, enabling architects and engineers to understand, explore, and navigate complex testbench structures.

### Goals

- Visualise UVM/TLM topologies from a metadata-driven manifest (not source parsing or runtime instrumentation)
- Support the full range of real-world UVM structural idioms, not just the textbook pattern
- Provide rich interactive features for navigating complex hierarchies
- Remain accessible to non-coding architects (manifest as the primary interface)
- Lay groundwork for future AI-agent authoring of topologies

### Non-Goals (Current Phase)

- Runtime simulation hooking or SystemVerilog source parsing
- Synthesis or simulation output
- Integration with Cartographer (`carto`) — different domain, separate tool

---

## 2. Decisions Made

These decisions are settled. They should not be re-litigated without a documented reason.

| # | Decision | Rationale |
|---|---|---|
| D1 | **Metadata-driven manifest** as canonical input, not static source parsing or runtime instrumentation | Decouples tool from any simulator or language; accessible to non-coding architects; enables future AI-agent authoring |
| D2 | **YAML** as the manifest file format | Human-readable; preferred by architects without coding backgrounds; parses to the same object model as JSON |
| D3 | **elkjs** as the layout engine | Best compound/nested node support; port-constraint-aware; mature Sugiyama implementation; runs in Node and browser; integrates naturally with Electron/React |
| D4 | **Layered (Sugiyama) algorithm** as the default layout | DAG/dataflow semantics; maps naturally to initiator→target direction; LEFT-to-RIGHT default orientation |
| D5 | **Orthogonal edge routing** as default | Circuit/dataflow diagram aesthetic; familiar to hardware engineers |
| D6 | **Component IDs are globally unique** across the entire manifest, not scoped to parent | Required for cross-boundary edge references (Topology 3); simplifies the LCA algorithm |
| D7 | **Containment and communication are separate schema sections** | `components` tree = hierarchy; `connections` flat list = communication. Never conflated |
| D8 | **Connection `type` is a first-class structured field** (namespaced taxonomy), not a free-text annotation | All five interaction features branch on edge type; must be structured for reliable filtering, toggling, and path tracing |
| D9 | **`canopus` metadata key** preserved on every ELK node and edge through the layout pass | Renderer drives visual behaviour (colours, dash patterns, filtering) from this metadata without re-parsing the manifest |
| D10 | **Five-phase transform architecture** (Index → Ports → Nodes → LCA → Attach) | Separates concerns; each phase has a single responsibility; LCA phase must follow Index to have the full parentMap |
| D11 | **Canopus is a standalone tool**, separate from Carto | Carto's purpose is register map management — a different domain. Electron is the GUI shell for both tools independently; the shared technology is coincidental, not a basis for coupling. |
| D12 | **Electron as the GUI shell** | Recommended during the visualisation approach phase as the natural host for an elkjs + SVG/React rendering surface; consistent with Carto's architecture independently. |
| D13 | **React + SVG as the rendering surface** | All five interaction features are state management problems (expanded node set, visible edge families, depth filter, selected path, annotation mode). React's reconciliation handles partial re-renders correctly without rebuilding it manually. Static CLI SVG export handled via `react-dom/server` — no separate codepath needed. |
| D14 | **AJV + JSON Schema for manifest validation** | JSON Schema is a portable open standard — editors (VS Code) can use the schema to provide autocomplete and inline validation for architects authoring `.canopus.yaml` files without running any tooling. Directly serves the non-coding architect accessibility goal. Recursive component nesting handled via `$ref` and `$defs`. |
| D15 | **TypeScript adopted via gradual migration** | TypeScript is the end-game target. Infrastructure set up now (`tsconfig.json`, `types.ts`); existing `.js` files pass through unchanged via `allowJs: true` / `checkJs: false`. All new files written as `.ts`/`.tsx`. Existing files convert file-by-file when next touched for another reason. No dedicated conversion sprint. Triggered early because TypeScript types will be a precise contract for future AI-agent authoring (OQ8). |

---

## 3. Accomplished

### 3.1 Concept and Approach

- [x] Project concept defined: TLM topology visualisation
- [x] Key reference algorithms identified: Sugiyama layered layout (DAGs), force-directed (general graphs)
- [x] Evaluated build-vs-buy for layout engine — settled on elkjs (D3)
- [x] Three input strategies evaluated (static parsing, runtime instrumentation, metadata manifest) — manifest selected (D1)

### 3.2 Interaction Feature Set

All five interaction features are defined and scoped:

- [x] **Hierarchical drill-down** — top-level view of coarse blocks; click to expand compound nodes
- [x] **Communication / containment toggle** — switch between or overlay the two graph views with visual distinction
- [x] **Transaction type annotation** — edges labelled and/or coloured by TLM connection type
- [x] **Abstraction level filtering** — collapse nodes below a chosen `level` integer; show only inter-agent or inter-env connections
- [x] **Path tracing** — click a component to highlight all upstream/downstream communication paths

### 3.3 Topology Archetypes

Five representative UVM topology archetypes defined and documented (see §8), covering the full range of structural idioms:

- [x] T1 — Canonical Single-Agent (baseline)
- [x] T2 — Multi-Agent with Virtual Sequencer
- [x] T3 — Hierarchical Sub-Environments (cross-boundary edges)
- [x] T4 — RAL-Integrated (Register Abstraction Layer)
- [x] T5 — Passive Monitoring / Protocol Checker Only

Coverage matrix validated: all five archetypes collectively exercise every schema feature.

### 3.4 Manifest Schema v0.1

- [x] Schema structure defined (YAML)
- [x] Component type taxonomy defined (14 types + generic fallback)
- [x] Connection type taxonomy defined (4 families, 14 types)
- [x] `mode: active | passive` field for agents
- [x] `level` integer field for abstraction filtering
- [x] `meta` free-form key-value field on both components and connections
- [x] `boundary_cross: true` convention established in `meta` for cross-compound edges (T3)
- [x] `from_port` / `to_port` optional fields for multi-port disambiguation (T4+)
- [x] All five topology archetypes expressed as validated YAML manifests

### 3.5 Manifest-to-ELK Transform

- [x] `manifest-to-elk.js` implemented (ES module, no dependencies beyond elkjs)
- [x] Phase 1 — Index: flat `nodeIndex` and `parentMap` with duplicate ID detection
- [x] Phase 2 — Ports: port map with per-connection unique port IDs; EAST/WEST for TLM, SOUTH/NORTH for REF/REG families
- [x] Phase 3 — Nodes: recursive ELK compound node tree; compound nodes unsized (ELK computes); leaf nodes sized from type table
- [x] Phase 4 — LCA: lowest-common-ancestor algorithm for correct cross-boundary edge container assignment
- [x] Phase 5 — Attach: edge groups placed on correct container nodes in the ELK tree
- [x] Endpoint validation with actionable error messages
- [x] Unknown type warnings (graceful degradation)
- [x] `canopus` metadata preserved on all ELK nodes and edges

### 3.6 React + SVG Renderer

- [x] `tokens.js` — all visual constants (colours, sizes, fonts, interaction states); nothing hardcoded in components
- [x] `useCanopusState.js` — single React hook owning all five interaction features; `buildConnectionIndex()` pre-computes adjacency maps once for path tracing
- [x] `CanopusEdge.jsx` — renders one ELK edge from `sections` bend-point array; handles path-state dimming, family visibility, cross-boundary overlay, arrowheads, and edge labels
- [x] `CanopusNode.jsx` — renders compound (container + expand/collapse toggle) and leaf (labelled rect + port dots) nodes; reacts to path state and level visibility
- [x] `CanopusCanvas.jsx` — full layout pipeline (prune manifest → transform → `elk.layout()` → absolutise coordinates → render nodes and edges); pan/zoom; structural vs visual state separation prevents layout thrash during exploration
- [x] `CanopusToolbar.jsx` — all five interaction controls (expand/collapse, edge family toggles, level slider, annotation toggle, selection info + clear)
- [x] `CanopusApp.jsx` — root component; manifest loading (object or URL); state wiring; detail panel (connections and metadata for selected node)

### 3.6 Packaging and Distribution

- [x] `electron-builder.yml` — cross-platform packaging config: macOS (DMG + ZIP, x64 + arm64), Windows (NSIS installer), Linux (AppImage); file associations for `.canopus.yaml`
- [x] `build/entitlements.mac.plist` — macOS hardened runtime entitlements (V8 JIT, WebAssembly, user file access)
- [x] `assets/icons/` — all platform icon formats generated from source PNG: `icon.ico` (Windows), `icon.iconset/` (macOS), `icon_NxN.png` per size (Linux)
- [x] `release.sh` — NFS-based release script: build → package → copy to `$NFS_RELEASE_PATH/<version>/`; writes `release.json` and `latest.json` on the share; `--dry-run`, `--skip-build`, `--platform` flags
- [x] `.release.env.example` — NFS path config template (gitignored per machine via `.release.env`)
- [x] `RELEASING.md` — complete release process documentation: one-time setup, version bumping, NFS share structure, colleague install instructions per platform, troubleshooting, release checklist
- [x] `.vscode/settings.json` — YAML schema wiring; TypeScript workspace SDK; file associations
- [x] `.vscode/extensions.json` — recommended editor extensions
- [x] `.gitignore` — dist/, node_modules/, `.release.env`, coverage/, platform artifacts
- [x] `package.json` — `release` and `release:dry` scripts added; `electron-builder` in devDependencies

- [x] `jest.config.js` — native ESM support (`--experimental-vm-modules`); no Babel/ts-jest transform; coverage configured for transform, validate, and render-static
- [x] `tests/validate.test.js` — 30 tests across four suites:
  - Fixture suite: all five topology YAML files pass validation cleanly
  - Schema pass (Pass 1): required fields, wrong version, invalid types, bad ID patterns, unknown fields
  - Semantic pass (Pass 2): duplicate IDs (sibling and cross-sub-env), unknown connection endpoints, self-loops, mode field scope, children on leaf types
  - `formatErrors()`: empty input, filename header, path/message/hint output, pluralisation
- [x] `tests/transform.test.js` — 30 tests across six suites:
  - Smoke tests: all five fixtures complete without error, produce valid ELK graph, correct node and edge counts
  - Phase 1 (Index): duplicate ID throws, unknown from/to throws with ID in message
  - Phase 2 (Ports): TLM EAST/WEST, REF SOUTH/NORTH, REG SOUTH/NORTH, port ID convention, multi-port nodes
  - Phase 3 (Nodes): compound nodes unsized, leaf nodes sized, canopus meta on all nodes and edges, passive mode preserved, edge port ID convention
  - Phase 4 (LCA): intra-agent, intra-sub-env, cross-boundary (T3 critical path), boundary_cross meta flag, mixed connection families (T4), analysis-only graph (T5)
  - Graceful degradation: unknown connection type falls back to EAST/WEST without throwing

- [x] `electron/preload.ts` — contextBridge API surface (`window.canopus`): `openManifest()`, `exportSvg()`, `onManifestReady()`, `getVersion()`; `Window` interface augmented for renderer TypeScript
- [x] `electron/main.ts` — BrowserWindow creation (dark background, hiddenInset titlebar); application menu (File / Edit / View / Help) with keyboard shortcuts; IPC handlers for open-manifest, export-svg, get-version; CLI argument manifest loading; macOS dock drag-and-drop (`open-file` event); dev/prod URL switching
- [x] `renderer.tsx` — React shell (`CanopusShell`); manifest loading via IPC with YAML parse + validate pipeline; empty state; error state with formatted validation output; menu command forwarding (expand-all, collapse-all, zoom) via DOM custom events; export trigger wiring
- [x] `index.html` — BrowserWindow HTML template; Content Security Policy; dark background pre-mount; global scrollbar styling; monospace font stack
- [x] `vite.config.ts` — Vite renderer build config; `@vitejs/plugin-react` with automatic JSX transform; elkjs alias to pre-bundled build; `dist/renderer/` output; Electron `chrome120` target
- [x] `tsconfig.electron.json` — separate tsc config for main + preload (CommonJS, no DOM lib); extends base tsconfig.json

- [x] `package.json` — updated with TypeScript devDependencies (`typescript`, `@types/*`), Electron, Vite; `bin` points to `dist/cli.js`; build and watch scripts
- [x] `render-static.js` — programmatic SVG generator (no JSX/React/browser dependencies); shares tokens.js for visual consistency with the interactive renderer; `absolutiseAndFlatten()` exported for reuse
- [x] `cli.js` — three commands via Commander:
  - `canopus validate <manifest>` — schema + semantic validation; `--json` flag for tooling integration; exits 0/1
  - `canopus layout <manifest>` — transform + `elk.layout()`; `--output`, `--stdout`, `--skip-validate`
  - `canopus render <manifest>` — full pipeline to static SVG; `--output`, `--stdout`, `--skip-validate`

### 3.9 Branding Assets

- [x] `assets/icon.png` — app icon / favicon (1080×1080 rounded-square, compass rose on dark navy)
- [x] `assets/banner.png` — short wordmark banner (icon + "Canopus" + "See the flow. Follow the data.")
- [x] `assets/banner-full.png` — full infographic banner (adds TLM pipeline diagram + descriptive copy)
- [x] `index.html` — `<link rel="icon">` pointing to `assets/icon.png`
- [x] `electron/main.ts` — `icon` field added to BrowserWindow constructor
- [x] `renderer.tsx` — empty state placeholder `✦` replaced with `assets/icon.png`
- [x] `vite.config.ts` — `publicDir: 'assets'` so icon serves correctly in dev and is copied to `dist/renderer/` in build

### 3.10 Documentation

- [x] `README.md` — full infographic banner hero; pipeline diagram; quick start; CLI usage; project structure; interaction features table; test commands; schema version note
- [x] `docs/authoring-guide.md` — short banner header; full architect guide; VS Code schema setup; common mistakes table; complete worked example
- [x] `docs/reference.md` — short banner header; all 15 component types; all 14 connection types; visual colour family summary
- [x] `docs/schema-changelog.md` — v0.1 field inventory; design decisions recorded; v0.2/v0.3 candidates; migration policy

### 3.10 TypeScript Infrastructure
- [x] `types.ts` — complete manifest data model as TypeScript interfaces: `CanopusManifest`, `Component`, `Connection`, `ComponentType`, `ConnectionType`, `ConnectionFamily`, `CanopusNodeMeta`, `CanopusEdgeMeta`, `CanopusInteractionState`, `ValidationResult`; `connectionFamily()` helper; `COMPOUND_COMPONENT_TYPES` const set
- [x] All new files going forward authored as `.ts` / `.tsx`
- [ ] Existing `.js`/`.jsx` files — convert file-by-file when next touched for another reason (no dedicated sprint)

### 3.11 JSON Schema Validation

- [x] `manifest.schema.json` — formal JSON Schema (draft 2020-12); component and connection type enums; recursive component tree via `$ref`/`$defs`; `meta` value types constrained; `additionalProperties: false` throughout
- [x] `validate.js` — two-pass AJV validator: Pass 1 schema (structural), Pass 2 semantic (global ID uniqueness, connection endpoint references, mode field scope, children on compound types only)
- [x] `formatErrors()` — CLI-ready error formatter with path, message, and actionable hint per error
- [x] Semantic checks deferred when schema fails — avoids cascading noise

### 3.12 Topology Fixture Files

- [x] `t1_canonical_single_agent.canopus.yaml`
- [x] `t2_multi_agent_virtual_sequencer.canopus.yaml`
- [x] `t3_hierarchical_sub_envs.canopus.yaml`
- [x] `t4_ral_integrated.canopus.yaml`
- [x] `t5_passive_monitoring.canopus.yaml`

---

## 4. In Progress

Nothing currently in progress.

---

## 5. Remaining Work

Listed roughly in implementation order.

### 5.1 JSON Schema Validation

- [x] `manifest.schema.json` — complete
- [x] `validate.js` — complete
- [x] `canopus validate` CLI command — complete
- [ ] Publish schema path for VS Code YAML autocomplete for architects

### 5.2 Packaging and Distribution

- [x] `electron-builder.yml` — complete
- [x] Icon assets — all platform formats complete
- [x] `release.sh` — NFS release script complete
- [x] `RELEASING.md` — complete
- [x] `.vscode/` — complete
- [x] `.gitignore` — complete
- [ ] Code signing credentials — macOS Developer ID + Windows EV certificate at release time (`CSC_LINK`, `WIN_CSC_LINK` env vars)
- [ ] `assets/dmg-background.png` — optional macOS DMG background image

### 5.3 Testing (Remaining)

- [ ] Visual regression tests for the renderer
- [ ] Edge case tests: single-node graph, disconnected components, maximum depth

### 5.4 Documentation

- [x] `README.md` — complete
- [x] `docs/authoring-guide.md` — complete
- [x] `docs/reference.md` — complete
- [x] `docs/schema-changelog.md` — complete

---

## 6. Open Questions / Actions Required

| # | Question | Priority |
|---|---|---|
| OQ5 | **Real-world topology validation** — The five archetypes are synthesised from known UVM idioms. When should real design topologies be used to validate the schema? This is deferred for now. | Medium — deferred by decision |
| OQ6 | **Force-directed layout mode** — Defined as an option for exploratory/unknown topologies but not yet wired into the schema or transform. Should `layout_hint: force` be a manifest-level field? | Low — future feature |
| OQ7 | **Schema versioning strategy** — Migration policy defined in `docs/schema-changelog.md`: two-version support window, warn-not-error on old versions, `canopus migrate` command planned, no breaking changes without major version bump. | Low — policy set, `migrate` command not yet implemented |
| OQ8 | **AI-agent authoring** — A stated long-term goal. What constraints does this place on the manifest schema now? (e.g. should component IDs be machine-generated UUIDs or human-readable slugs?) | Low — future phase |

---

## 7. Reference Artefacts

| Artefact | Location | Status |
|---|---|---|
| `manifest-to-elk.js` | `canopus/manifest-to-elk.js` | Complete |
| `tokens.js` | `canopus/renderer/tokens.js` | Complete |
| `useCanopusState.js` | `canopus/renderer/useCanopusState.js` | Complete |
| `CanopusEdge.jsx` | `canopus/renderer/CanopusEdge.jsx` | Complete |
| `CanopusNode.jsx` | `canopus/renderer/CanopusNode.jsx` | Complete |
| `CanopusCanvas.jsx` | `canopus/renderer/CanopusCanvas.jsx` | Complete |
| `CanopusToolbar.jsx` | `canopus/renderer/CanopusToolbar.jsx` | Complete |
| `CanopusApp.jsx` | `canopus/renderer/CanopusApp.jsx` | Complete |
| Topology 1 manifest | `canopus/topologies/t1_canonical_single_agent.canopus.yaml` | Complete |
| Topology 2 manifest | `canopus/topologies/t2_multi_agent_virtual_sequencer.canopus.yaml` | Complete |
| Topology 3 manifest | `canopus/topologies/t3_hierarchical_sub_envs.canopus.yaml` | Complete |
| Topology 4 manifest | `canopus/topologies/t4_ral_integrated.canopus.yaml` | Complete |
| Topology 5 manifest | `canopus/topologies/t5_passive_monitoring.canopus.yaml` | Complete |
| `jest.config.js` | `canopus/jest.config.js` | Complete |
| `tests/validate.test.js` | `canopus/tests/validate.test.js` | Complete |
| `tests/transform.test.js` | `canopus/tests/transform.test.js` | Complete |
| `electron/preload.ts` | `canopus/electron/preload.ts` | Complete |
| `renderer.tsx` | `canopus/renderer.tsx` | Complete |
| `index.html` | `canopus/index.html` | Complete |
| `vite.config.ts` | `canopus/vite.config.ts` | Complete |
| `tsconfig.electron.json` | `canopus/tsconfig.electron.json` | Complete |
| `validate.js` | `canopus/validate.js` | Complete |
| `tsconfig.json` | `canopus/tsconfig.json` | Complete |
| `types.ts` | `canopus/types.ts` | Complete |
| `package.json` | `canopus/package.json` | Complete (updated) |
| `render-static.js` | `canopus/render-static.js` | Complete |
| `cli.js` | `canopus/cli.js` | Complete |
| `release.sh` | `canopus/release.sh` | Complete |
| `.release.env.example` | `canopus/.release.env.example` | Complete |
| `RELEASING.md` | `canopus/RELEASING.md` | Complete |
| `build/entitlements.mac.plist` | `canopus/build/entitlements.mac.plist` | Complete |
| `.vscode/settings.json` | `canopus/.vscode/settings.json` | Complete |
| `.vscode/extensions.json` | `canopus/.vscode/extensions.json` | Complete |
| `.gitignore` | `canopus/.gitignore` | Complete |
| `assets/icons/` | `canopus/assets/icons/` | Complete |
| `assets/banner.png` | `canopus/assets/banner.png` | Complete |
| `assets/banner-full.png` | `canopus/assets/banner-full.png` | Complete |
| `docs/authoring-guide.md` | `canopus/docs/authoring-guide.md` | Complete |
| `docs/reference.md` | `canopus/docs/reference.md` | Complete |
| `docs/schema-changelog.md` | `canopus/docs/schema-changelog.md` | Complete |

---

## 8. Topology Archetypes

Summary reference. Full YAML manifests exist in session history.

| ID | Name | Key Structural Features | Schema Features Exercised |
|---|---|---|---|
| T1 | Canonical Single-Agent | Single active agent, analysis broadcast | Baseline; analysis fan-out |
| T2 | Multi-Agent + Virtual Sequencer | Two agents, virtual sequencer with handle refs | `ref.handle`; multi-agent fan-in at scoreboard |
| T3 | Hierarchical Sub-Environments | Nested envs, cross-boundary analysis edges | Cross-compound edges; LCA algorithm; `meta.boundary_cross` |
| T4 | RAL-Integrated | Register block, adapter, predictor | `reg.*` types; `ref.shared_object`; mixed connection semantics |
| T5 | Passive Monitoring Only | Passive agents (no driver/sequencer), high analysis fan-out | `mode: passive`; pure analysis graph; maximum fan-out |

### Connection Type Taxonomy Reference

| Family | Type | Description |
|---|---|---|
| TLM | `tlm.blocking_get` | seq_item_port — sequencer → driver |
| TLM | `tlm.blocking_put` | put_port → put_export |
| TLM | `tlm.nonblocking_put` | nb_put_port |
| TLM | `tlm.nonblocking_get` | nb_get_port |
| TLM | `tlm.transport` | Blocking transport |
| TLM | `tlm.nb_transport` | Nonblocking transport |
| TLM | `tlm.analysis` | analysis_port — broadcast capable |
| TLM | `tlm.fifo` | TLM FIFO between components |
| REF | `ref.handle` | Object handle reference (virtual sequencer pattern) |
| REF | `ref.shared_object` | Shared utility object (e.g. reg adapter) |
| REG | `reg.frontdoor` | Register model frontdoor access path |
| REG | `reg.backdoor` | Register model backdoor access path |
| REG | `reg.adapter` | Adapter binding on sequencer / map |
| REG | `reg.predictor` | Predictor ↔ reg_block binding |

### Component Type Taxonomy Reference

| Type | Kind | Notes |
|---|---|---|
| `uvm_test` | Compound | Top-level test container |
| `uvm_env` | Compound | Environment; may be nested |
| `uvm_agent` | Compound | `mode: active \| passive` |
| `uvm_sequencer` | Leaf | |
| `uvm_virtual_sequencer` | Leaf | Uses `ref.handle` connections |
| `uvm_driver` | Leaf | |
| `uvm_monitor` | Leaf | |
| `uvm_scoreboard` | Leaf | |
| `uvm_coverage_collector` | Leaf | |
| `uvm_subscriber` | Leaf | Generic analysis subscriber |
| `uvm_protocol_checker` | Leaf | |
| `uvm_reg_block` | Leaf | RAL register block |
| `uvm_reg_adapter` | Leaf | RAL adapter; often a `ref.shared_object` hub |
| `uvm_reg_predictor` | Leaf | RAL predictor |
| `uvm_component` | Leaf | Generic fallback |
