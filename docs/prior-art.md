<div align="center">
  <img src="../assets/banner.png" alt="Canopus" width="600" />
</div>

# Canopus — Prior-Art and Value Survey

**Date of survey:** 2026-11-11
**Purpose:** Determine whether Canopus has value, by establishing what already exists, what Canopus does differently, and where the gaps and risks are.
**Method:** Web search and page-by-page reading of vendor documentation, conference papers, package registries and forum threads. A full source list and search log is at the end.

> **Limits of this document.** This is an informed survey, not a legal opinion and not a patent search. It covers what was findable on the open web on the date above. Paywalled standards and journals, patent databases (beyond incidental hits), and current product builds were not reviewed. Where something could not be confirmed, it is marked **unconfirmed** rather than assumed absent. Absence from this survey is not proof of absence in the world.

---

## 1. Summary

**Is the idea novel?** Not as a general idea. Drawing a UVM testbench's component hierarchy and TLM connections is already done by several commercial tools and at least one free tool. Using a YAML/JSON manifest to describe a testbench is also established, but in the literature found it is used to *generate* testbenches, not to *visualize* them. Using ELK for hardware diagrams and using IP-XACT metadata for block diagrams are both established for RTL and SoC design.

**Is there value?** Possibly, but in a narrower place than "UVM topology viewer." Where the source code exists and the commercial licenses are available, existing tools already cover the core use case and Canopus is not differentiated. Canopus's potential value is in the cases those tools handle poorly:

1. Showing a testbench architecture **before the code exists** (design review, planning, documentation as specification).
2. Working **without a simulator, compile, or IDE license**.
3. Serving **architects who do not write SystemVerilog**.
4. Modeling **non-TLM relationships** (object handles, shared objects, register-model wiring) as first-class edge types.
5. Acting as a **view layer for the YAML/JSON metadata** that many teams already keep for testbench generation.

**Biggest risk to that value:** the manifest is hand-authored, so it can drift from the real code. Every competing tool derives its picture from the source or the running simulation. Without an import path or a reconciliation (diff) feature, this is the main weakness.

**Status caveat:** Canopus is implemented, but at the time of writing its test suite has not been executed and no real-world testbench has been modeled in it (requirements item OQ5). Claims about Canopus below describe its design, not field-proven behavior.

---

## 2. What already exists

### 2.1 Built into UVM itself (text only)

- `print_topology()` prints the component tree as text. A community question from 2014 asks how to print the interconnections between ports as well, and a 2025 reply still points to per-port query methods (`get_connected_to`, `get_provided_to`) rather than any diagram.
- Port methods such as `debug_connected_to` and `debug_provided_to` print a text view of a port's fan-out and fan-in.
- A DVCon paper by Synopsys authors describes the library's built-in tracing as covering only part of UVM and producing text logs that are hard to post-process.

**Relevance:** The repeated community question shows there is real demand for a connection view that the base library does not provide.

### 2.2 Commercial IDEs and simulator debug environments

| Tool | What it shows (per vendor material) | How it gets its data |
|---|---|---|
| **DVT IDE (AMIQ EDA)** | A UVM Components Diagram showing component containment and TLM port connections, with adjustable depth, user-defined filters and Save As for documentation. Also a Verification Hierarchy View with a TLM ports panel, and navigation between connected TLM ports. | Static source analysis in the IDE |
| **Aldec Riviera-PRO** | "UVM Graph", a graphical view of testbench architecture, introduced in the 2014.02 release; a vendor-hosted guest blog also shows it exposing an unconnected sequencer/driver pair. Listed in the LVT-SV configuration only. | Simulator |
| **Siemens Questa Visualizer** | A hierarchy browser for the UVM component hierarchy, plus a "UVM schematic" showing testbench connectivity and the interfaces to the DUT. | Questa/Veloce simulation data |
| **Synopsys Verdi** | UVM-aware debug views (the datasheet mentions resources and factory aspects) and hierarchy browsing. A Synopsys-authored DVCon paper describes a UVM hierarchy tree with a "connected path" view built from traced component creation and port connections. A dedicated TLM connectivity schematic was **not confirmed** in the material found. | Simulation database |
| **Cadence Indago / SimVision** | No UVM TLM-topology view was found in the material reviewed. **Unconfirmed**, not evidence of absence. | — |

### 2.3 Free and open-source

- **VSV (VS Code extension, free, about 180 installs at the time of survey).** The closest free comparable. It renders a UVM component containment tree as nested boxes, draws TLM `.connect()` calls as arrows, binds virtual interfaces to the DUT module, and lays everything out with ELK. It is static-analysis only. Its own documentation lists what it does not do: factory overrides are not applied, `config_db` lookups are mostly not traced, the register model is rendered as ordinary classes, and sequences and phases are not visualized.

### 2.4 Metadata-driven approaches (generation, not visualization)

The manifest idea is well established, but in the sources found it drives *code generation*:

- A DVCon paper describes a metadata-based testbench generator using YAML (chosen because IP-XACT alone could not carry the needed information) with Jinja templates.
- `uvm-tb-gen` (PyPI) and `uvmdvgen` (OpenTitan) generate testbench structure from parameters.
- Another DVCon paper uses a YAML interface spec to generate monitors, drivers and agents.
- A 2025 DVCon Europe paper uses a JSON configuration rendered through Jinja2 to build a configurable UVM environment.
- **HAVEN** (arXiv, 2026) has an LLM produce a structured JSON blueprint, then renders UVM code from templates rather than letting the LLM write HDL directly.
- An AMD DVCon paper proposes a graph data structure for SoC-level connectivity, built from JSON or yEd precursor files, with path-search functions. It is used to constrain traffic and does not visualize testbench TLM.

**Relevance:** Teams already keep testbench metadata. A visualization layer over that same metadata is a plausible gap, but no existing tool was found that does it.

### 2.5 Hardware-diagram tooling (adjacent, not UVM)

- **d3-hwschematic**, **netlistsvg** and **hdelk** draw hardware schematics from JSON. d3-hwschematic uses ELK layered layout with orthogonal routing, expandable hierarchy and net selection.
- **Kactus2** is a free, open-source IP-XACT toolset that draws hierarchical block diagrams and memory maps from metadata. IP-XACT is IEEE 1685.
- A US patent document found during the search describes displaying a self-organizing block-diagram layout from an IP-XACT description. It concerns design components, not UVM testbenches. It is mentioned only as evidence that metadata-to-diagram for hardware is an occupied area.

**Relevance:** The technique stack Canopus uses (ELK layered layout, metadata in, diagram out) is not new for hardware.

### 2.6 SystemC / TLM visualization research

- Academic groups have produced static-analysis tools that draw SystemC module hierarchies, port bindings and thread communication graphs. One 2019 paper analyzes SystemC virtual platforms including TLM-2.0 sockets, covering both structure and transaction flow.

**Relevance:** TLM structure visualization is well explored for SystemC. No peer-reviewed work specifically on UVM testbench topology visualization turned up in this survey.

### 2.7 AI integration

- DVT announced (July 2026) an MCP server that gives AI agents structured access to a compiled database of design and verification knowledge, plus debug tools, and an AI assistant for root-cause analysis of test failures.

**Relevance:** Source-derived verification knowledge is already becoming available to AI agents. That weakens the case for "a manifest so AI agents can understand the testbench" unless the manifest serves a different purpose (planning rather than analysis).

---

## 3. Feature comparison

Legend: **Yes** = shown in the sources reviewed. **No** = stated or clearly inherent. **—** = not found in the sources reviewed (unconfirmed). Canopus entries describe design intent, not validated behavior.

| Capability | Canopus | DVT IDE | Aldec UVM Graph | Questa Visualizer | VSV | UVM built-in |
|---|---|---|---|---|---|---|
| Containment hierarchy diagram | Yes | Yes | Yes | Yes | Yes | Text tree |
| TLM connections drawn | Yes | Yes | Yes | Yes | Yes | Text only |
| Works without a simulator | Yes | Yes | No | No | Yes | No |
| Works before code exists | **Yes** | No | No | No | No | No |
| Derived automatically from code | **No** | Yes | Yes | Yes | Yes | Yes |
| Reflects runtime (overrides, config) | No | — | Yes | Yes | No | Yes |
| Handle / shared-object / register edges as distinct types | **Yes** | — | — | — | Partial (virtual-interface binding) | No |
| Path tracing (up/downstream) | Yes | Navigation between connected ports | — | — | — | Text query |
| Depth / abstraction filtering | Yes | Yes (depth, filters) | — | — | Test selector only | No |
| Static SVG export from a CLI | Yes | Save As (in IDE) | — | — | — | No |
| Cost | Free / internal | Commercial | Commercial (tiered) | Commercial | Free | Free |

---

## 4. Where Canopus may add value

1. **Design-time use.** Every tool above needs finished code or a running simulation. A manifest can describe a testbench that has not been written yet, so it supports architecture review, planning and documentation-as-specification.
2. **No license or toolchain dependency.** It runs from a text file. This matters for teams without access to the commercial tools, and for reviewers who only need to look at a diagram.
3. **Non-coder audience.** Architects can author or edit YAML with editor autocomplete from the published JSON Schema, without reading SystemVerilog.
4. **Richer relationship model.** Handles, shared objects and register-model wiring are explicit edge types. VSV is the only comparable that touches any of this, and only partially.
5. **View over existing metadata.** Teams that already maintain YAML/JSON for testbench generation could, in principle, point Canopus at (or convert from) the same data. This is not built.
6. **A plan-level artifact for AI.** A compact, validated manifest could serve as a planning contract for AI-assisted authoring. DVT's MCP server already covers analysis of existing code, so this only has value if it focuses on authoring and review before code exists.

---

## 5. Weaknesses and risks

1. **Manual authoring and drift.** This is the main risk. Competing tools extract topology from code or simulation; a manifest can silently disagree with reality. Without an import path or diff, the diagram may be wrong with no warning.
2. **Crowded core use case.** Four commercial tools and one free tool already draw containment plus TLM connections. For teams that already have them, Canopus adds little for the common case.
3. **No runtime view.** Canopus cannot show factory overrides, configuration effects or actual runtime connections. Aldec and Siemens can.
4. **Unvalidated.** The test suite has not been run in the environment that produced it, the Electron app has not been launched, and no real testbench has been modeled (OQ5). Real topologies may expose schema gaps.
5. **Standard techniques.** ELK layered layout and lowest-common-ancestor edge placement are well-known. Any novelty is in the combination and the application, not the algorithms.
6. **Interaction features are not unique.** Drill-down and depth filtering exist elsewhere. Transitive path highlighting is the least-covered of the five, but only because it was not found in the sources reviewed.

---

## 6. Novelty assessment

| Element | Assessment |
|---|---|
| Visualizing UVM component hierarchy and TLM connections | **Not novel.** Several existing tools. |
| YAML/JSON manifest describing a testbench | **Not novel**, but found only for generation, not visualization. |
| ELK layered layout for hardware diagrams | **Not novel.** Several open-source tools. |
| Metadata-driven block diagrams for hardware | **Not novel.** IP-XACT tooling and at least one patent document exist (design-level, not UVM). |
| Manifest-driven visualization of a UVM testbench, usable before code exists, with a mixed TLM/handle/register edge taxonomy | **No exact match found** in this survey. This is the defensible claim, and it is a narrow combination rather than a new technique. |

Whether that combination is protectable or valuable is a separate question that this survey cannot answer.

---

## 7. Recommended next steps

These are ordered by how much they reduce uncertainty about value.

1. **Run what exists.** Install dependencies, run the 60 unit tests, run `canopus render` on the five fixtures, and launch the app. Fix whatever fails. Until this is done, nothing above about Canopus is field-proven.
2. **Model one real testbench (OQ5).** Author a real testbench in the manifest, time it, and note every construct the schema cannot express. This is the cheapest test of the authoring-cost risk.
3. **Try VSV on the same testbench.** It is free. A direct comparison on one real example will show quickly whether Canopus adds anything beyond it.
4. **Build an import path.** Generate a manifest from `print_topology` output, from static parsing, or from existing generator metadata. This directly attacks the drift and authoring-cost weaknesses.
5. **Add a diff mode.** Compare the manifest (intent) against an extracted topology (actual) and report disagreements. Aldec's own example of spotting an unconnected sequencer/driver pair shows the kind of finding this would produce, and none of the tools reviewed compare intent against actual.
6. **Decide the positioning.** The evidence supports "design-time architecture and documentation tool" more than "UVM debug viewer." Choose one before investing further.

---

## 8. Search log

Searches and pages reviewed on 2026-11-11 (queries paraphrased):

1. Verdi UVM TLM connection view
2. Siemens Visualizer UVM topology / TLM connectivity
3. Synopsys Verdi UVM class browser / schematic
4. Cadence Indago UVM TLM connections
5. Questa Visualizer UVM hierarchy and port connections
6. Open-source UVM topology graph generators
7. UVM testbench generators from YAML/JSON
8. Verdi UVM connectivity viewer (extended search)
9. d3-hwschematic / ELK hardware schematic tools
10. SystemC TLM visualization tools
11. UVM testbench structure extraction research
12. IP-XACT block diagram tools

Pages read in full or in part: the DVT tutorial and press release, the Aldec blog and configuration page, the Siemens Visualizer fact sheet, the VSV Marketplace page, a Verification Academy forum thread, and three DVCon papers (graphical topology info structure, extendable messaging techniques, metadata-based testbench generation).

**Not confirmed or not covered:** a Cadence UVM topology view; a Verdi TLM connectivity schematic; patent databases; paywalled IEEE/ACM full texts; GitHub-wide code search; non-English sources; current product builds (vendor pages may describe older releases).

---

## 9. Sources

- Verification Academy forum, "Can we print all TLM connections available in the test bench?" — https://verificationacademy.com/forums/t/can-we-print-all-tlm-connections-available-in-the-test-bench/29337
- Verification Academy forum, "Printing detailed UVM testbench topology" — https://verificationacademy.com/forums/t/printing-detailed-uvm-testbench-toplogy/49053
- Neurealm, "Top UVM debugging hacks" — https://www.neurealm.com/blogs/top-uvm-debugging-hacks-that-will-transform-your-workflow/
- AMIQ EDA, "Understanding UVM verification environments using DVT Eclipse IDE" — https://eda.amiq.com/tutorials/understanding-uvm-verification-environments-using-dvt-eclipse-ide
- AMIQ EDA, "How to navigate between connected TLM ports" — https://eda.amiq.com/tutorials/how-to-navigate-between-connected-tlm-ports-in-the-dvt-eclipse-ide
- AMIQ EDA press release (2026-07-27), AI assistance and DVT MCP Server — https://eda.amiq.com/press-releases/amiq-eda-integrates-code-development-and-debug-with-ai-assistance
- Aldec blog, "Visualizing UVM Environments: Debug Features Deliver a Clearer View" — https://aldec.com/en/company/blog/68--visualizing-uvm-environments-debug-features-deliver-a-clearer-view
- Aldec Riviera-PRO configurations (UVM Graph & Toolbox) — https://www.aldec.com/en/products/functional_verification/riviera-pro/configuration/print_page
- Siemens, Visualizer Debug Environment fact sheet — https://resources.sw.siemens.com/en-US/fact-sheet-visualizer-tm-debug-environment/
- Synopsys, Verdi datasheet — https://www.synopsys.com/content/dam/synopsys/verification/datasheets/verdi-ds.pdf
- DVCon, "Extendable Messaging Techniques for Debugging and Analyzing UVM Testbench Structure and Transaction Flow" — https://dvcon-proceedings.org/wp-content/uploads/extendable-messaging-techniques-for-debugging-and-analyzing-uvm-testbench-structure-and-transaction-flow.pdf
- VSV, Visual Studio Marketplace — https://marketplace.visualstudio.com/items?itemName=rrroooyyywang.vsv
- DVCon, "Metadata Based Testbench Generation" — https://dvcon-proceedings.org/wp-content/uploads/Metadata-Based-Testbench-Generation-1.pdf
- DVCon, "Testing the Testbench" — https://dvcon-proceedings.org/wp-content/uploads/testing-the-testbench.pdf
- DVCon Europe 2025, paper 101 (configurable UVM architecture) — https://dvcon-proceedings.org/wp-content/uploads/DVConEU_2025_paper_101.pdf
- uvm-tb-gen (PyPI) — https://pypi.org/project/uvm-tb-gen/
- OpenTitan uvmdvgen — https://opensecura.googlesource.com/3p/lowrisc/opentitan/+show/b4d815468b338ea6daa03374331edd228b8a3e31/util/uvmdvgen/README.md
- HAVEN (arXiv) — https://arxiv.org/pdf/2604.27643
- DVCon, "Graphical Topology Info Structure for Constrained Random Verification in SoC/Subsystem Tests" — https://dvcon-proceedings.org/wp-content/uploads/graphical-topology-info-structure-for-constrained-random-verification-in-socsubsystem-tests.pdf
- d3-hwschematic — https://github.com/nic30/d3-hwschematic
- Kactus2 — https://www.Github.com/kactus2/kactus2dev
- US patent document on IP-XACT-driven block-diagram display — https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/10120972
- Schmidt, Liu, Dömer, "Automatic Generation of Thread Communication Graphs from SystemC Source Code" — https://www.cecs.uci.edu/~doemer/publications/SCOPES_16.pdf
- Mendoza, Dömer, "A Tool for Visualization of SystemC Modules" — https://websrv.cecs.uci.edu/~doemer/publications/CECS_TR_17_06.pdf
- Bremen, SystemC virtual platform analysis (GLSVLSI 2019) — https://agra.informatik.uni-bremen.de/doc/konf/GLSVLSI_2019_GHGD.pdf
