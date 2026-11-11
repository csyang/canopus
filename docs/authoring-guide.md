<div align="center">
  <img src="../assets/banner.png" alt="Canopus" width="600" />
</div>

# Canopus Manifest Authoring Guide

This guide is written for hardware architects and verification engineers who want to describe a UVM testbench topology using a Canopus manifest file. No programming knowledge is required.

---

## What is a manifest?

A Canopus manifest is a plain text file (`.canopus.yaml`) that describes:

1. **Which components exist** in your testbench and how they are nested inside each other (the containment hierarchy)
2. **How those components communicate** with each other via TLM ports, object references, and register model connections

Canopus reads this file and produces an interactive diagram. The manifest is the single source of truth — you edit the manifest, the diagram updates.

---

## Setting up your editor

If you are using **VS Code**, you can get autocomplete and inline validation while editing manifest files by adding one line at the top of your file:

```yaml
# yaml-language-server: $schema=../../manifest.schema.json
canopus: "0.1"
```

Adjust the relative path to point to `manifest.schema.json` in your Canopus installation. After adding this line, VS Code will suggest valid field names and values as you type, and will underline invalid entries in red.

---

## File naming convention

Name your manifest files using the pattern:

```
<topology_name>.canopus.yaml
```

Examples:
```
chip_level_tb.canopus.yaml
apb_agent_env.canopus.yaml
passive_monitor_tb.canopus.yaml
```

---

## Manifest structure

Every manifest has four top-level sections:

```yaml
canopus: "0.1"            # always this exact value
name: my_topology         # unique name, letters/digits/underscores
description: >            # optional — describe what this topology is for
  A brief explanation of this testbench.
tags:                     # optional — for filtering and grouping
  - my_project
  - baseline

components:               # the component containment hierarchy
  - ...

connections:              # the communication connections between components
  - ...
```

---

## Writing the components section

The `components` section describes your testbench hierarchy as a nested list. Each component has an **id** (a unique name you choose), a **type** (what kind of UVM component it is), and optionally a **label** (the actual SystemVerilog class name).

### A simple example

Here is the classic single-agent environment:

```yaml
components:
  - id: test
    type: uvm_test
    label: my_chip_test
    level: 0
    children:
      - id: env
        type: uvm_env
        label: my_chip_env
        level: 1
        children:
          - id: agent
            type: uvm_agent
            label: my_apb_agent
            mode: active
            level: 2
            children:
              - id: sequencer
                type: uvm_sequencer
                label: apb_sequencer
                level: 3
              - id: driver
                type: uvm_driver
                label: apb_driver
                level: 3
              - id: monitor
                type: uvm_monitor
                label: apb_monitor
                level: 3
          - id: scoreboard
            type: uvm_scoreboard
            label: apb_scoreboard
            level: 2
```

### Component fields explained

| Field | Required | Description |
|---|---|---|
| `id` | **Yes** | A unique name for this component. Used in connections. Must start with a letter; letters, digits, and underscores only. Must be unique across the **entire** manifest, not just within its parent. |
| `type` | **Yes** | What kind of UVM component this is. See the [Component Type Reference](reference.md#component-types). |
| `label` | No | The actual SystemVerilog class name. Shown in the diagram. |
| `mode` | No | `active` or `passive`. Only used on `uvm_agent` components. Defaults to `active` if omitted. |
| `level` | No | An integer representing this component's depth in the hierarchy. `0` = top-level test, `1` = env, `2` = agent, etc. Used for the abstraction level filter in the diagram. |
| `meta` | No | Free-form notes. See [Adding metadata](#adding-metadata). |
| `children` | No | Nested sub-components. Only valid on container types (`uvm_test`, `uvm_env`, `uvm_agent`). |

### ID rules

**IDs must be globally unique** across the entire manifest. If you have two sub-environments each containing a monitor, you cannot give both monitors the id `monitor` — you must give them distinct ids such as `apb_mon` and `axi_mon`.

```yaml
# ✗ Wrong — duplicate id 'monitor' across two sub-envs
children:
  - id: cpu_env
    type: uvm_env
    children:
      - id: monitor          # duplicate!
        type: uvm_monitor
  - id: peri_env
    type: uvm_env
    children:
      - id: monitor          # duplicate!
        type: uvm_monitor

# ✓ Correct — unique ids
children:
  - id: cpu_env
    type: uvm_env
    children:
      - id: cpu_monitor
        type: uvm_monitor
  - id: peri_env
    type: uvm_env
    children:
      - id: peri_monitor
        type: uvm_monitor
```

### Passive agents

A passive agent has no sequencer or driver — only a monitor. Declare it with `mode: passive` and only include the monitor as a child:

```yaml
- id: apb_agent
  type: uvm_agent
  mode: passive
  level: 2
  children:
    - id: apb_mon
      type: uvm_monitor
      level: 3
```

The diagram will visually distinguish passive agents from active ones.

### The `level` field

The `level` field is an integer you assign to control the **abstraction level filter** in the diagram. A suggested convention:

| Level | What it represents |
|---|---|
| 0 | `uvm_test` |
| 1 | `uvm_env` (top-level) |
| 2 | Sub-envs, agents, scoreboards, coverage at the env level |
| 3 | Components inside agents (sequencer, driver, monitor) |
| 4 | Components inside nested sub-envs |

When you drag the Level slider in the diagram, components with a level number higher than the slider value are hidden. This lets you zoom out to see the high-level structure without the internal agent details.

---

## Writing the connections section

The `connections` section is a flat list of directed connections between components. Unlike the `components` section, connections are **not nested** — every connection goes in this flat list regardless of where the components live in the hierarchy.

### Basic connection structure

```yaml
connections:
  - id: c_seq_drv                  # unique connection id
    from: sequencer                 # id of the source component
    to: driver                      # id of the target component
    type: tlm.blocking_get          # connection type (see reference)
    transaction: apb_seq_item       # optional — transaction type name
```

### Connection fields explained

| Field | Required | Description |
|---|---|---|
| `id` | **Yes** | Unique connection identifier. Same naming rules as component ids. |
| `from` | **Yes** | The id of the source (sending) component. |
| `to` | **Yes** | The id of the target (receiving) component. |
| `type` | **Yes** | The connection type. See [Connection Type Reference](reference.md#connection-types). |
| `transaction` | No | The transaction type that flows on this connection (e.g. `apb_seq_item`). Shown as an edge label when annotations are enabled. |
| `label` | No | A display label override — shown instead of `transaction` when both are present. |
| `from_port` | No | Named port on the source, when a component has multiple ports of the same type. |
| `to_port` | No | Named port on the target. |
| `meta` | No | Free-form notes. Use `boundary_cross: true` for edges that cross sub-environment boundaries (see below). |

### Common connection patterns

**Sequencer to driver** (the stimulus path):
```yaml
- id: c_seq_drv
  from: sequencer
  to: driver
  type: tlm.blocking_get
  transaction: apb_seq_item
```

**Monitor to scoreboard** (analysis):
```yaml
- id: c_mon_sb
  from: monitor
  to: scoreboard
  type: tlm.analysis
  transaction: apb_seq_item
```

**Analysis broadcast** (one monitor, multiple sinks):
```yaml
- id: c_mon_sb
  from: monitor
  to: scoreboard
  type: tlm.analysis
  transaction: apb_seq_item

- id: c_mon_cov
  from: monitor
  to: coverage
  type: tlm.analysis
  transaction: apb_seq_item
```

**Virtual sequencer handles** (not TLM ports — use `ref.handle`):
```yaml
- id: r_vseqr_apb
  from: vseqr
  to: apb_seqr
  type: ref.handle
  label: apb_seqr_h

- id: r_vseqr_axi
  from: vseqr
  to: axi_seqr
  type: ref.handle
  label: axi_seqr_h
```

**Cross-boundary analysis** (monitor inside a sub-env, scoreboard in the parent env):
```yaml
- id: c_mon_chip_sb
  from: cpu_monitor
  to: chip_scoreboard
  type: tlm.analysis
  transaction: ahb_seq_item
  meta:
    boundary_cross: true    # draws as a dashed edge
```

The `boundary_cross: true` flag tells the diagram to render this edge with a dashed line to make it visually obvious that it crosses a sub-environment boundary.

---

## Adding metadata

Both components and connections accept a `meta` field for free-form notes. These appear in the detail panel when you click a component in the diagram.

```yaml
- id: reg_block
  type: uvm_reg_block
  label: dut_reg_block
  level: 2
  meta:
    reg_count: 32
    base_address: "0x0000_0000"
    revision: 3

- id: logger
  type: uvm_subscriber
  label: transaction_logger
  level: 2
  meta:
    log_format: csv
    log_file: transactions.csv
```

Meta values can be text, numbers, true/false, or lists of text values.

---

## Validating your manifest

Before opening a manifest in the Canopus app, you can validate it from the command line:

```bash
node cli.js validate my_topology.canopus.yaml
```

A valid manifest prints:
```
✓ my_topology.canopus.yaml: valid
  12 components · 8 connections
```

An invalid manifest prints the errors with their location and a hint for fixing them:
```
✗ my_topology.canopus.yaml: 2 errors
  • [connections[3].to] Connection "c_mon_sb": unknown target id "scorebord"
    hint: Ensure the id exists in the components tree
  • [components[1].children[0].id] Duplicate component id: "monitor"
    hint: Component IDs must be globally unique across the entire manifest
```

---

## Complete worked example

This is the full manifest for a two-agent environment with a virtual sequencer, equivalent to the `t2_multi_agent_virtual_sequencer.canopus.yaml` fixture:

```yaml
canopus: "0.1"
name: multi_agent_virtual_sequencer
description: >
  Two active agents (APB, AXI) coordinated by a virtual sequencer.
tags:
  - multi-agent
  - virtual-sequencer

components:
  - id: test
    type: uvm_test
    label: chip_test
    level: 0
    children:
      - id: env
        type: uvm_env
        label: chip_env
        level: 1
        children:
          - id: vseqr
            type: uvm_virtual_sequencer
            label: virtual_sequencer
            level: 2

          - id: apb_agent
            type: uvm_agent
            label: apb_agent
            mode: active
            level: 2
            children:
              - id: apb_seqr
                type: uvm_sequencer
                level: 3
              - id: apb_drv
                type: uvm_driver
                level: 3
              - id: apb_mon
                type: uvm_monitor
                level: 3

          - id: axi_agent
            type: uvm_agent
            label: axi_agent
            mode: active
            level: 2
            children:
              - id: axi_seqr
                type: uvm_sequencer
                level: 3
              - id: axi_drv
                type: uvm_driver
                level: 3
              - id: axi_mon
                type: uvm_monitor
                level: 3

          - id: scoreboard
            type: uvm_scoreboard
            label: chip_scoreboard
            level: 2

          - id: coverage
            type: uvm_coverage_collector
            label: chip_coverage
            level: 2

connections:
  - { id: c_apb_seq_drv, from: apb_seqr, to: apb_drv, type: tlm.blocking_get, transaction: apb_seq_item }
  - { id: c_axi_seq_drv, from: axi_seqr, to: axi_drv, type: tlm.blocking_get, transaction: axi_seq_item }
  - { id: c_apb_mon_sb,  from: apb_mon,  to: scoreboard, type: tlm.analysis,  transaction: apb_seq_item }
  - { id: c_axi_mon_sb,  from: axi_mon,  to: scoreboard, type: tlm.analysis,  transaction: axi_seq_item }
  - { id: c_apb_mon_cov, from: apb_mon,  to: coverage,   type: tlm.analysis,  transaction: apb_seq_item }
  - { id: c_axi_mon_cov, from: axi_mon,  to: coverage,   type: tlm.analysis,  transaction: axi_seq_item }
  - { id: r_vseqr_apb,   from: vseqr,    to: apb_seqr,   type: ref.handle,    label: apb_seqr_h }
  - { id: r_vseqr_axi,   from: vseqr,    to: axi_seqr,   type: ref.handle,    label: axi_seqr_h }
```

---

## Common mistakes

| Mistake | Error message | Fix |
|---|---|---|
| Two components with the same id | `Duplicate component id: "monitor"` | Give each component a unique id |
| Typo in a connection `from` or `to` | `unknown source id "monitro"` | Check the spelling matches the component id exactly |
| Using `mode` on a non-agent | `mode field is only valid on uvm_agent` | Remove `mode` or change the component type |
| Putting children on a leaf type | `has children but is not a compound type` | Only `uvm_test`, `uvm_env`, `uvm_agent` may have children |
| Wrong schema version | `must be exactly '0.1'` | Change to `canopus: "0.1"` |
