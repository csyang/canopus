<div align="center">
  <img src="../assets/banner.png" alt="Canopus" width="600" />
</div>

# Canopus Type Reference

Complete reference for all component types and connection types in the Canopus manifest schema v0.1.

---

## Component Types

### Container types

These types may have a `children` array. They are rendered as compound nodes (nested bounding boxes) in the diagram.

---

#### `uvm_test`

The top-level test class. There is typically one per manifest.

```yaml
- id: test
  type: uvm_test
  label: my_chip_test
  level: 0
```

**Diagram:** Outermost bounding box with a light grey border.

---

#### `uvm_env`

A verification environment. May be nested — a top-level `uvm_env` can contain sub-envs, each of which contains agents and scoreboards. This is the primary structural building block for SoC-level testbenches.

```yaml
- id: env
  type: uvm_env
  label: chip_env
  level: 1
  children:
    - id: sub_env
      type: uvm_env
      label: cpu_sub_env
      level: 2
      children:
        - ...
```

**Diagram:** Medium-weight bounding box. Nesting depth is visually distinguishable by border weight.

---

#### `uvm_agent`

A verification agent. Use the `mode` field to distinguish active from passive:

| `mode` | Contents | Use case |
|---|---|---|
| `active` (default) | sequencer, driver, monitor | Driving stimulus and observing |
| `passive` | monitor only | Observation-only (emulation, bring-up) |

```yaml
- id: apb_agent
  type: uvm_agent
  label: apb_agent
  mode: passive
  level: 2
  children:
    - id: apb_mon
      type: uvm_monitor
      level: 3
```

**Diagram:** Active agents have a blue border; passive agents have a teal border.

---

### Leaf types

These types may **not** have children. They are rendered as simple labelled rectangles.

---

#### `uvm_sequencer`

Generates and arbitrates sequence items sent to the driver. Connected to the driver via `tlm.blocking_get`.

```yaml
- id: seqr
  type: uvm_sequencer
  label: apb_sequencer
  level: 3
```

**Diagram:** Blue family. EAST output port, WEST input port.

---

#### `uvm_virtual_sequencer`

Coordinates multiple sub-sequencers via object handles rather than TLM ports. Connected to sub-sequencers using `ref.handle` connections.

```yaml
- id: vseqr
  type: uvm_virtual_sequencer
  label: virtual_sequencer
  level: 2
```

**Diagram:** Blue family. SOUTH output ports for `ref.handle` connections.

---

#### `uvm_driver`

Drives stimulus onto the DUT interface. Receives sequence items from the sequencer via `tlm.blocking_get`.

```yaml
- id: drv
  type: uvm_driver
  label: apb_driver
  level: 3
```

**Diagram:** Blue family. WEST input port.

---

#### `uvm_monitor`

Observes the DUT interface and broadcasts transactions to analysis subscribers. The primary source of `tlm.analysis` connections.

```yaml
- id: mon
  type: uvm_monitor
  label: apb_monitor
  level: 3
```

**Diagram:** Teal family. EAST output ports for each analysis connection.

---

#### `uvm_scoreboard`

Checks DUT behaviour by comparing observed transactions against expected values. Receives analysis connections from one or more monitors.

```yaml
- id: sb
  type: uvm_scoreboard
  label: chip_scoreboard
  level: 2
```

**Diagram:** Amber family. WEST input ports.

---

#### `uvm_coverage_collector`

Collects functional coverage from observed transactions. Receives analysis connections from monitors.

```yaml
- id: cov
  type: uvm_coverage_collector
  label: bus_coverage
  level: 2
```

**Diagram:** Amber family. WEST input ports.

---

#### `uvm_subscriber`

A generic analysis subscriber. Use when the component doesn't fit neatly into scoreboard or coverage roles (e.g. a transaction logger, a protocol tracer).

```yaml
- id: logger
  type: uvm_subscriber
  label: transaction_logger
  level: 2
  meta:
    log_format: csv
    log_file: transactions.csv
```

**Diagram:** Amber family. WEST input ports.

---

#### `uvm_protocol_checker`

A dedicated protocol checking component. Semantically distinct from a scoreboard — it checks protocol correctness rather than DUT functional behaviour. Receives analysis connections from monitors.

```yaml
- id: checker
  type: uvm_protocol_checker
  label: apb_checker
  level: 2
  meta:
    checks:
      - no_idle_during_transfer
      - burst_length_limit
```

**Diagram:** Amber family, slightly brighter border than scoreboard.

---

#### `uvm_reg_block`

The UVM register abstraction layer (RAL) register block. Represents the `uvm_reg_block` hierarchy for a DUT's register map. Connected via `reg.frontdoor`, `reg.predictor`, and `ref.shared_object` (adapter).

```yaml
- id: reg_block
  type: uvm_reg_block
  label: dut_reg_block
  level: 2
  meta:
    reg_count: 32
    base_address: "0x0000_0000"
```

**Diagram:** Violet family. SOUTH output ports for REG connections.

---

#### `uvm_reg_adapter`

Translates between the generic `uvm_reg_bus_op` and the protocol-specific sequence item. Typically referenced by both the register block and the predictor via `ref.shared_object`.

```yaml
- id: adapter
  type: uvm_reg_adapter
  label: dut_adapter
  level: 2
```

**Diagram:** Violet family. SOUTH output ports.

---

#### `uvm_reg_predictor`

Updates the register model mirror based on observed bus transactions. Receives analysis from the monitor and updates the register block via `reg.predictor`.

```yaml
- id: predictor
  type: uvm_reg_predictor
  label: dut_predictor
  level: 2
```

**Diagram:** Violet family. SOUTH output ports.

---

#### `uvm_component`

A generic fallback for any component that does not fit one of the specific types above. Use sparingly — prefer the specific type where possible.

```yaml
- id: custom_checker
  type: uvm_component
  label: my_custom_checker
  level: 2
```

**Diagram:** Grey. May have children (treated as a compound node if children are present).

---

## Connection Types

Connection types are grouped into three families. The family determines port placement and edge colour in the diagram:

| Family | Port sides | Colour |
|---|---|---|
| `tlm` | EAST out → WEST in | Blue / Teal |
| `ref` | SOUTH out → NORTH in | Grey |
| `reg` | SOUTH out → NORTH in | Violet |

---

### TLM family — `tlm.*`

Physical TLM port and export pairs. These represent actual SystemVerilog/SystemC TLM connections established at `connect_phase`.

---

#### `tlm.blocking_get`

The sequencer-to-driver connection. The driver calls `get()` on the sequencer to pull the next sequence item.

```yaml
- id: c_seq_drv
  from: sequencer
  to: driver
  type: tlm.blocking_get
  transaction: apb_seq_item
```

**Direction:** sequencer → driver
**Diagram:** Solid blue line with arrowhead.

---

#### `tlm.analysis`

A one-to-many broadcast connection via `uvm_analysis_port`. A single source can fan out to many sinks without any modification.

```yaml
- id: c_mon_sb
  from: monitor
  to: scoreboard
  type: tlm.analysis
  transaction: apb_seq_item
```

**Direction:** monitor → scoreboard / coverage / subscriber / checker
**Diagram:** Solid teal line. Multiple edges from the same source represent broadcast.

---

#### `tlm.blocking_put`

A blocking put connection. The sender calls `put()` and blocks until the receiver accepts.

```yaml
- id: c_put
  from: producer
  to: consumer
  type: tlm.blocking_put
  transaction: my_item
```

---

#### `tlm.nonblocking_put`

A non-blocking put. Returns immediately whether or not the item was accepted.

```yaml
- id: c_nb_put
  from: producer
  to: consumer
  type: tlm.nonblocking_put
  transaction: my_item
```

**Diagram:** Dashed blue line.

---

#### `tlm.nonblocking_get`

A non-blocking get. Returns immediately whether or not an item was available.

```yaml
- id: c_nb_get
  from: sequencer
  to: driver
  type: tlm.nonblocking_get
  transaction: my_item
```

**Diagram:** Dashed blue line.

---

#### `tlm.transport`

Blocking bidirectional transport. The initiator sends a request and waits for the response in a single call.

```yaml
- id: c_transport
  from: initiator
  to: target
  type: tlm.transport
  transaction: my_payload
```

---

#### `tlm.nb_transport`

Non-blocking bidirectional transport. Used in TLM-2.0 loosely-timed and approximately-timed models.

```yaml
- id: c_nb_transport
  from: initiator
  to: target
  type: tlm.nb_transport
  transaction: my_payload
```

**Diagram:** Dashed teal line.

---

#### `tlm.fifo`

A `tlm_fifo` buffer between two components. The producer puts items into the FIFO; the consumer gets them out. The FIFO decouples their timing.

```yaml
- id: c_fifo
  from: producer
  to: consumer
  type: tlm.fifo
  transaction: my_item
```

**Diagram:** Dashed teal line, longer dash pattern.

---

### REF family — `ref.*`

Object references — not TLM port connections. These represent handles or shared objects passed at `build_phase` or `connect_phase` rather than established TLM bindings.

---

#### `ref.handle`

An object handle held by the source that refers to the target. The canonical use case is a virtual sequencer holding handles to sub-sequencers.

```yaml
- id: r_vseqr_apb
  from: vseqr
  to: apb_seqr
  type: ref.handle
  label: apb_seqr_h
```

**Direction:** holder → referenced object
**Diagram:** Dashed grey line. Visually distinct from TLM connections to signal that no TLM port binding is involved.

---

#### `ref.shared_object`

A shared utility object referenced by multiple components. The canonical use case is a `uvm_reg_adapter` referenced by both the register block and the predictor.

```yaml
- id: r_adapt_reg
  from: adapter
  to: reg_block
  type: ref.shared_object
  label: reg2bus

- id: r_adapt_pred
  from: adapter
  to: predictor
  type: ref.shared_object
  label: bus2reg
```

**Direction:** shared object → consumer (draw one edge per consumer)
**Diagram:** Short-dash grey line.

---

### REG family — `reg.*`

Register model connections. These represent the implicit wiring established when configuring the UVM RAL.

---

#### `reg.frontdoor`

The register model launches sequences through the sequencer for frontdoor register access.

```yaml
- id: r_reg_frontdoor
  from: reg_block
  to: sequencer
  type: reg.frontdoor
  label: frontdoor_access
```

**Direction:** reg_block → sequencer
**Diagram:** Solid violet line.

---

#### `reg.backdoor`

Direct HDL path access to the register without going through the bus protocol.

```yaml
- id: r_reg_backdoor
  from: reg_block
  to: dut_hdl_path
  type: reg.backdoor
```

**Diagram:** Short-dash violet line.

---

#### `reg.adapter`

The adapter binding on a register map — connects the register model's generic bus operations to the protocol-specific sequence item format.

```yaml
- id: r_adapter
  from: reg_block
  to: adapter
  type: reg.adapter
```

**Diagram:** Long-dash-dot violet line.

---

#### `reg.predictor`

The predictor updates the register model mirror based on observed bus transactions.

```yaml
- id: r_pred_reg
  from: predictor
  to: reg_block
  type: reg.predictor
  label: mirror_update
```

**Direction:** predictor → reg_block
**Diagram:** Long-dash-dot violet line.

---

## Visual Summary

```
Component colour families:

  Blue   — Stimulus path:    uvm_sequencer, uvm_virtual_sequencer, uvm_driver
  Teal   — Observation:      uvm_monitor
  Amber  — Analysis sinks:   uvm_scoreboard, uvm_coverage_collector,
                             uvm_subscriber, uvm_protocol_checker
  Violet — Register model:   uvm_reg_block, uvm_reg_adapter, uvm_reg_predictor
  Grey   — Generic:          uvm_component

Edge colour families:

  Blue  (solid)  — tlm.blocking_get, tlm.blocking_put, tlm.transport
  Blue  (dashed) — tlm.nonblocking_put, tlm.nonblocking_get, tlm.nb_transport
  Teal  (solid)  — tlm.analysis
  Teal  (dashed) — tlm.fifo
  Grey  (dashed) — ref.handle, ref.shared_object
  Violet (solid) — reg.frontdoor
  Violet (dashed)— reg.backdoor, reg.adapter, reg.predictor
```
