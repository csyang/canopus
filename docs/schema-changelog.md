# Canopus Schema Changelog

This document records all changes to the Canopus manifest schema, in reverse chronological order. Each version describes what changed, why, and how to migrate existing manifests.

All manifests declare their schema version at the top:

```yaml
canopus: "0.1"
```

---

## v0.1 — Initial release

**Status:** Current

This is the initial schema version. All manifests must declare `canopus: "0.1"`.

### What v0.1 defines

**Top-level fields:**

| Field | Type | Required |
|---|---|---|
| `canopus` | `"0.1"` (literal) | Yes |
| `name` | string — letters, digits, underscores; starts with a letter | Yes |
| `description` | string | No |
| `tags` | array of strings | No |
| `components` | array of component objects | Yes |
| `connections` | array of connection objects | No |

**Component fields:**

| Field | Type | Required |
|---|---|---|
| `id` | string — globally unique, letters/digits/underscores | Yes |
| `type` | one of 15 component types (see Reference) | Yes |
| `label` | string | No |
| `mode` | `"active"` or `"passive"` — agents only | No |
| `level` | integer ≥ 0 | No |
| `meta` | object with string/number/boolean/string-array values | No |
| `children` | array of component objects — compound types only | No |

**Connection fields:**

| Field | Type | Required |
|---|---|---|
| `id` | string — unique | Yes |
| `from` | string — must reference a component id | Yes |
| `to` | string — must reference a component id | Yes |
| `type` | one of 14 connection types (see Reference) | Yes |
| `transaction` | string | No |
| `label` | string | No |
| `from_port` | string | No |
| `to_port` | string | No |
| `meta` | object — `boundary_cross: boolean` is a known key | No |

**Component type taxonomy (v0.1):**
`uvm_test`, `uvm_env`, `uvm_agent`, `uvm_sequencer`, `uvm_virtual_sequencer`, `uvm_driver`, `uvm_monitor`, `uvm_scoreboard`, `uvm_coverage_collector`, `uvm_subscriber`, `uvm_protocol_checker`, `uvm_reg_block`, `uvm_reg_adapter`, `uvm_reg_predictor`, `uvm_component`

**Connection type taxonomy (v0.1):**
`tlm.blocking_get`, `tlm.blocking_put`, `tlm.nonblocking_put`, `tlm.nonblocking_get`, `tlm.transport`, `tlm.nb_transport`, `tlm.analysis`, `tlm.fifo`, `ref.handle`, `ref.shared_object`, `reg.frontdoor`, `reg.backdoor`, `reg.adapter`, `reg.predictor`

### Design decisions recorded at v0.1

- **Global ID uniqueness** — component IDs must be unique across the entire manifest, not just within their parent container. Required for cross-boundary edge references (e.g. a monitor inside a sub-env connecting to a scoreboard in the parent env).
- **Flat connections list** — all connections are declared at the top level of the manifest regardless of where the components reside in the hierarchy. The transform computes each edge's container using a lowest-common-ancestor algorithm.
- **`boundary_cross` meta convention** — cross-sub-environment edges are flagged with `meta.boundary_cross: true` by the author rather than auto-detected. This is explicit and keeps the schema stable regardless of how the renderer chooses to style these edges.
- **`mode` field scoped to agents** — the schema permits `mode` on any component at the JSON level but the semantic validator enforces it only on `uvm_agent`. This is a deliberate choice to keep the JSON Schema simple and put the semantic constraint in the second validation pass where it produces a better error message.

---

## Future versions — anticipated changes

The following are candidate additions for future schema versions. None are committed; they are recorded here for planning purposes.

### Candidate additions for v0.2

**`layout_hint` field on the manifest root**
Allow authors to suggest an alternative ELK layout algorithm for specific topologies. Proposed values: `layered` (default), `force` (for exploratory/unknown topologies).
```yaml
canopus: "0.2"
layout_hint: force
```

**`color` field on connections**
Allow explicit colour override on individual edges, for cases where the type-based colouring is insufficient (e.g. two `tlm.analysis` connections that need to be visually distinguished).
```yaml
- id: c_mon_sb
  from: monitor
  to: scoreboard
  type: tlm.analysis
  color: "#e05252"
```

**`group` field on components**
Allow arbitrary grouping of sibling components within a container for layout hints (e.g. keep all passive agents on one side of the env).

**`deprecated: true` flag on connections**
Mark connections that are present for legacy reasons and should be removed in a future iteration. Rendered with reduced opacity.

### Candidate additions for v0.3

**AI-agent authoring support**
Machine-generated component IDs (UUID format) alongside human-readable labels. The current `id` field requires human-readable slugs; a future version may allow a `uid` field for stable machine-generated identity while keeping `id` as the display slug.

---

## Migration policy

When a new schema version is released:

1. The previous version continues to be supported for at least two minor versions.
2. The `canopus validate` command will warn (not error) when it encounters an older schema version.
3. A migration command will be provided: `canopus migrate <manifest.yaml>` — rewrites the manifest to the current schema version in-place, with a backup.
4. Breaking changes (field removals, renamed types) will not be introduced without a major version bump and a full deprecation cycle.

---

## Reporting schema issues

If you encounter a real UVM topology that cannot be expressed in the current schema, please open an issue with:

- A description of the topology
- The specific construct that cannot be represented
- A proposed schema addition or modification

The five topology archetypes (T1–T5) that drove the v0.1 design are documented in the project requirements document and serve as the baseline test cases for any schema change.
