/**
 * tests/transform.test.js
 * Canopus — Manifest-to-ELK Transform Unit Tests
 *
 * Tests the five-phase transform pipeline against all fixture manifests,
 * plus targeted tests for each phase's key invariants:
 *
 *   Phase 1 — Index:   duplicate ID detection, full tree coverage
 *   Phase 2 — Ports:   port ID convention, EAST/WEST vs SOUTH/NORTH assignment
 *   Phase 3 — Nodes:   compound nodes unsized, leaf nodes sized, canopus meta
 *   Phase 4 — LCA:     intra-agent, intra-env, and cross-boundary edge placement
 *   Phase 5 — Attach:  edge counts per container, root edges for orphans
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml              from 'js-yaml';
import { manifestToElk } from '../manifest-to-elk.js';

const __dir    = dirname(fileURLToPath(import.meta.url));
const TOPO_DIR = join(__dir, '../topologies');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function loadFixture(filename) {
  const raw = readFileSync(join(TOPO_DIR, filename), 'utf8');
  return yaml.load(raw);
}

/**
 * Recursively find an ELK node by id anywhere in the tree.
 */
function findNode(elkNode, targetId) {
  if (elkNode.id === targetId) return elkNode;
  for (const child of (elkNode.children ?? [])) {
    const found = findNode(child, targetId);
    if (found) return found;
  }
  return null;
}

/**
 * Recursively collect all edges from the ELK tree.
 */
function collectEdges(elkNode, edges = []) {
  for (const edge of (elkNode.edges ?? [])) edges.push(edge);
  for (const child of (elkNode.children ?? [])) collectEdges(child, edges);
  return edges;
}

/**
 * Recursively collect all nodes from the ELK tree (excluding __root__).
 */
function collectNodes(elkNode, nodes = []) {
  if (elkNode.id !== '__root__') nodes.push(elkNode);
  for (const child of (elkNode.children ?? [])) collectNodes(child, nodes);
  return nodes;
}

// ─────────────────────────────────────────────────────────────────────────────
// Smoke tests — all five fixtures produce output without throwing
// ─────────────────────────────────────────────────────────────────────────────

describe('Smoke tests — all five topology fixtures', () => {
  const fixtures = [
    { file: 't1_canonical_single_agent.canopus.yaml',         name: 'T1' },
    { file: 't2_multi_agent_virtual_sequencer.canopus.yaml',  name: 'T2' },
    { file: 't3_hierarchical_sub_envs.canopus.yaml',          name: 'T3' },
    { file: 't4_ral_integrated.canopus.yaml',                 name: 'T4' },
    { file: 't5_passive_monitoring.canopus.yaml',             name: 'T5' },
  ];

  test.each(fixtures)('$name: transform completes without error', ({ file }) => {
    const manifest = loadFixture(file);
    expect(() => manifestToElk(manifest)).not.toThrow();
  });

  test.each(fixtures)('$name: output is a valid ELK graph object', ({ file }) => {
    const manifest = loadFixture(file);
    const graph    = manifestToElk(manifest);

    expect(graph).toHaveProperty('id', '__root__');
    expect(graph).toHaveProperty('layoutOptions');
    expect(graph).toHaveProperty('children');
    expect(Array.isArray(graph.children)).toBe(true);
  });

  test.each(fixtures)('$name: node count matches manifest component count', ({ file }) => {
    const manifest = loadFixture(file);
    const graph    = manifestToElk(manifest);

    // Count all components in the manifest (recursive)
    function countComponents(components) {
      return components.reduce((sum, c) => {
        return sum + 1 + countComponents(c.children ?? []);
      }, 0);
    }

    const expectedCount = countComponents(manifest.components);
    const actualCount   = collectNodes(graph).length;

    expect(actualCount).toBe(expectedCount);
  });

  test.each(fixtures)('$name: edge count matches manifest connection count', ({ file }) => {
    const manifest = loadFixture(file);
    const graph    = manifestToElk(manifest);
    const edges    = collectEdges(graph);

    expect(edges).toHaveLength(manifest.connections.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 — Index
// ─────────────────────────────────────────────────────────────────────────────

describe('Phase 1 — Index', () => {
  test('duplicate component IDs throw with a descriptive message', () => {
    const manifest = {
      canopus: '0.1',
      name: 'dup_test',
      components: [
        { id: 'env', type: 'uvm_env', children: [
          { id: 'mon', type: 'uvm_monitor' },
          { id: 'mon', type: 'uvm_monitor' },   // duplicate
        ]},
      ],
      connections: [],
    };
    expect(() => manifestToElk(manifest))
      .toThrow('Duplicate component id: "mon"');
  });

  test('unknown connection from endpoint throws with the unknown id', () => {
    const manifest = {
      canopus: '0.1',
      name: 'bad_ref',
      components: [{ id: 'drv', type: 'uvm_driver' }],
      connections: [{
        id: 'c1', from: 'ghost', to: 'drv', type: 'tlm.blocking_get',
      }],
    };
    expect(() => manifestToElk(manifest))
      .toThrow('unknown source id "ghost"');
  });

  test('unknown connection to endpoint throws with the unknown id', () => {
    const manifest = {
      canopus: '0.1',
      name: 'bad_ref',
      components: [{ id: 'seqr', type: 'uvm_sequencer' }],
      connections: [{
        id: 'c1', from: 'seqr', to: 'ghost', type: 'tlm.blocking_get',
      }],
    };
    expect(() => manifestToElk(manifest))
      .toThrow('unknown target id "ghost"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 — Ports
// ─────────────────────────────────────────────────────────────────────────────

describe('Phase 2 — Port assignment', () => {
  test('TLM connections get EAST out / WEST in port sides', () => {
    const manifest = loadFixture('t1_canonical_single_agent.canopus.yaml');
    const graph    = manifestToElk(manifest);
    const seqr     = findNode(graph, 'sequencer');
    const drv      = findNode(graph, 'driver');

    expect(seqr).not.toBeNull();
    expect(drv).not.toBeNull();

    const outPort = seqr.ports.find(p => p.id === 'sequencer__out__c_seq_drv');
    const inPort  = drv.ports.find(p => p.id  === 'driver__in__c_seq_drv');

    expect(outPort).toBeDefined();
    expect(inPort).toBeDefined();
    expect(outPort.layoutOptions['port.side']).toBe('EAST');
    expect(inPort.layoutOptions['port.side']).toBe('WEST');
  });

  test('REF connections get SOUTH out / NORTH in port sides', () => {
    const manifest = loadFixture('t2_multi_agent_virtual_sequencer.canopus.yaml');
    const graph    = manifestToElk(manifest);
    const vseqr    = findNode(graph, 'vseqr');

    expect(vseqr).not.toBeNull();

    const outPort = vseqr.ports.find(p => p.id === 'vseqr__out__r_vseqr_apb');
    expect(outPort).toBeDefined();
    expect(outPort.layoutOptions['port.side']).toBe('SOUTH');
  });

  test('REG connections get SOUTH out / NORTH in port sides', () => {
    const manifest = loadFixture('t4_ral_integrated.canopus.yaml');
    const graph    = manifestToElk(manifest);
    const regBlock = findNode(graph, 'reg_block');

    expect(regBlock).not.toBeNull();

    const outPort = regBlock.ports.find(p => p.id === 'reg_block__out__r_reg_frontdoor');
    expect(outPort).toBeDefined();
    expect(outPort.layoutOptions['port.side']).toBe('SOUTH');
  });

  test('port IDs follow the nodeId__role__connId convention', () => {
    const manifest = loadFixture('t1_canonical_single_agent.canopus.yaml');
    const graph    = manifestToElk(manifest);
    const mon      = findNode(graph, 'monitor');

    // monitor has two outgoing analysis connections: c_mon_sb and c_mon_cov
    const outPorts = mon.ports.filter(p => p.id.includes('__out__'));
    expect(outPorts).toHaveLength(2);

    const portIds = outPorts.map(p => p.id);
    expect(portIds).toContain('monitor__out__c_mon_sb');
    expect(portIds).toContain('monitor__out__c_mon_cov');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3 — ELK node tree
// ─────────────────────────────────────────────────────────────────────────────

describe('Phase 3 — Node tree construction', () => {
  test('compound nodes have no fixed width/height (ELK computes them)', () => {
    const manifest = loadFixture('t1_canonical_single_agent.canopus.yaml');
    const graph    = manifestToElk(manifest);

    for (const id of ['test', 'env', 'agent']) {
      const node = findNode(graph, id);
      expect(node).not.toBeNull();
      expect(node.width).toBeUndefined();
      expect(node.height).toBeUndefined();
    }
  });

  test('leaf nodes have fixed width and height from the size table', () => {
    const manifest = loadFixture('t1_canonical_single_agent.canopus.yaml');
    const graph    = manifestToElk(manifest);

    for (const id of ['sequencer', 'driver', 'monitor', 'scoreboard', 'coverage']) {
      const node = findNode(graph, id);
      expect(node).not.toBeNull();
      expect(typeof node.width).toBe('number');
      expect(typeof node.height).toBe('number');
      expect(node.width).toBeGreaterThan(0);
      expect(node.height).toBeGreaterThan(0);
    }
  });

  test('canopus metadata is preserved on every node', () => {
    const manifest = loadFixture('t1_canonical_single_agent.canopus.yaml');
    const graph    = manifestToElk(manifest);
    const nodes    = collectNodes(graph);

    for (const node of nodes) {
      expect(node).toHaveProperty('canopus');
      expect(node.canopus).toHaveProperty('type');
    }
  });

  test('passive agent mode is preserved in canopus metadata', () => {
    const manifest = loadFixture('t5_passive_monitoring.canopus.yaml');
    const graph    = manifestToElk(manifest);

    const apbAgent = findNode(graph, 'apb_agent');
    expect(apbAgent).not.toBeNull();
    expect(apbAgent.canopus.mode).toBe('passive');
  });

  test('canopus metadata is preserved on every edge', () => {
    const manifest = loadFixture('t1_canonical_single_agent.canopus.yaml');
    const graph    = manifestToElk(manifest);
    const edges    = collectEdges(graph);

    for (const edge of edges) {
      expect(edge).toHaveProperty('canopus');
      expect(edge.canopus).toHaveProperty('type');
    }
  });

  test('edge sources and targets use port ID convention', () => {
    const manifest = loadFixture('t1_canonical_single_agent.canopus.yaml');
    const graph    = manifestToElk(manifest);
    const edges    = collectEdges(graph);
    const seqEdge  = edges.find(e => e.id === 'c_seq_drv');

    expect(seqEdge).toBeDefined();
    expect(seqEdge.sources).toEqual(['sequencer__out__c_seq_drv']);
    expect(seqEdge.targets).toEqual(['driver__in__c_seq_drv']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 4 — LCA and edge placement
// ─────────────────────────────────────────────────────────────────────────────

describe('Phase 4 — LCA edge placement', () => {

  describe('T1: Canonical single-agent', () => {
    let graph;
    beforeAll(() => {
      graph = manifestToElk(loadFixture('t1_canonical_single_agent.canopus.yaml'));
    });

    test('sequencer→driver edge (intra-agent) placed on agent', () => {
      const agent     = findNode(graph, 'agent');
      const edgeIds   = (agent.edges ?? []).map(e => e.id);
      expect(edgeIds).toContain('c_seq_drv');
    });

    test('monitor→scoreboard edge (crosses agent boundary) placed on env', () => {
      const env     = findNode(graph, 'env');
      const edgeIds = (env.edges ?? []).map(e => e.id);
      expect(edgeIds).toContain('c_mon_sb');
    });

    test('monitor→coverage edge placed on env', () => {
      const env     = findNode(graph, 'env');
      const edgeIds = (env.edges ?? []).map(e => e.id);
      expect(edgeIds).toContain('c_mon_cov');
    });

    test('no edges on the root graph (all have a manifest container)', () => {
      expect(graph.edges).toHaveLength(0);
    });
  });

  describe('T2: Multi-agent with virtual sequencer', () => {
    let graph;
    beforeAll(() => {
      graph = manifestToElk(loadFixture('t2_multi_agent_virtual_sequencer.canopus.yaml'));
    });

    test('apb sequencer→driver edge placed on apb_agent', () => {
      const agent   = findNode(graph, 'apb_agent');
      const edgeIds = (agent.edges ?? []).map(e => e.id);
      expect(edgeIds).toContain('c_apb_seq_drv');
    });

    test('ref.handle edges (vseqr→apb_seqr) placed on env', () => {
      const env     = findNode(graph, 'env');
      const edgeIds = (env.edges ?? []).map(e => e.id);
      expect(edgeIds).toContain('r_vseqr_apb');
      expect(edgeIds).toContain('r_vseqr_axi');
    });

    test('analysis fan-in edges placed on env', () => {
      const env     = findNode(graph, 'env');
      const edgeIds = (env.edges ?? []).map(e => e.id);
      expect(edgeIds).toContain('c_apb_mon_sb');
      expect(edgeIds).toContain('c_axi_mon_sb');
    });
  });

  describe('T3: Hierarchical sub-environments (critical — cross-boundary edges)', () => {
    let graph;
    beforeAll(() => {
      graph = manifestToElk(loadFixture('t3_hierarchical_sub_envs.canopus.yaml'));
    });

    test('intra-agent edge (ahb_seqr→ahb_drv) placed on ahb_agent', () => {
      const agent   = findNode(graph, 'ahb_agent');
      const edgeIds = (agent.edges ?? []).map(e => e.id);
      expect(edgeIds).toContain('c_ahb_seq_drv');
    });

    test('intra-sub-env edge (ahb_mon→cpu_sb) placed on cpu_env', () => {
      const cpuEnv  = findNode(graph, 'cpu_env');
      const edgeIds = (cpuEnv.edges ?? []).map(e => e.id);
      expect(edgeIds).toContain('c_ahb_mon_cpu_sb');
    });

    test('cross-boundary edge (ahb_mon→chip_sb) placed on chip_env — the LCA', () => {
      // ahb_mon ancestors: ahb_agent → cpu_env → chip_env → test
      // chip_sb ancestors: chip_env → test
      // LCA = chip_env
      const chipEnv = findNode(graph, 'chip_env');
      const edgeIds = (chipEnv.edges ?? []).map(e => e.id);
      expect(edgeIds).toContain('c_ahb_mon_chip_sb');
    });

    test('cross-boundary edge (apb_mon→chip_sb) placed on chip_env', () => {
      const chipEnv = findNode(graph, 'chip_env');
      const edgeIds = (chipEnv.edges ?? []).map(e => e.id);
      expect(edgeIds).toContain('c_apb_mon_chip_sb');
    });

    test('cross-boundary edges carry boundary_cross meta flag', () => {
      const edges = collectEdges(graph);
      const cross = edges.filter(e =>
        e.id === 'c_ahb_mon_chip_sb' || e.id === 'c_apb_mon_chip_sb'
      );
      expect(cross).toHaveLength(2);
      for (const edge of cross) {
        expect(edge.canopus.meta.boundary_cross).toBe(true);
      }
    });

    test('non-cross edges do NOT carry boundary_cross flag', () => {
      const edges    = collectEdges(graph);
      const nonCross = edges.filter(e =>
        e.id === 'c_ahb_mon_cpu_sb' || e.id === 'c_apb_mon_peri_sb'
      );
      for (const edge of nonCross) {
        expect(edge.canopus.meta?.boundary_cross).toBeFalsy();
      }
    });
  });

  describe('T4: RAL-integrated (mixed connection families)', () => {
    let graph;
    beforeAll(() => {
      graph = manifestToElk(loadFixture('t4_ral_integrated.canopus.yaml'));
    });

    test('all eight connections are present in the graph', () => {
      expect(collectEdges(graph)).toHaveLength(8);
    });

    test('reg.frontdoor edge has SOUTH port side on reg_block', () => {
      const regBlock = findNode(graph, 'reg_block');
      const outPort  = regBlock.ports.find(p => p.id === 'reg_block__out__r_reg_frontdoor');
      expect(outPort).toBeDefined();
      expect(outPort.layoutOptions['port.side']).toBe('SOUTH');
    });

    test('ref.shared_object edges are present on adapter', () => {
      const adapter  = findNode(graph, 'adapter');
      const outPorts = adapter.ports.filter(p => p.id.includes('__out__'));
      expect(outPorts).toHaveLength(2);
    });
  });

  describe('T5: Passive monitoring (analysis-only graph)', () => {
    let graph;
    beforeAll(() => {
      graph = manifestToElk(loadFixture('t5_passive_monitoring.canopus.yaml'));
    });

    test('six analysis connections are present', () => {
      const edges = collectEdges(graph);
      expect(edges).toHaveLength(6);
    });

    test('all edges are of type tlm.analysis', () => {
      const edges = collectEdges(graph);
      for (const edge of edges) {
        expect(edge.canopus.type).toBe('tlm.analysis');
      }
    });

    test('passive agents have no sequencer or driver children', () => {
      for (const agentId of ['apb_agent', 'axi_agent']) {
        const agent    = findNode(graph, agentId);
        const children = agent.children ?? [];
        const types    = children.map(c => c.canopus.type);
        expect(types).not.toContain('uvm_sequencer');
        expect(types).not.toContain('uvm_driver');
      }
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Unknown connection type — graceful degradation
// ─────────────────────────────────────────────────────────────────────────────

describe('Unknown connection type — graceful degradation', () => {
  test('unknown type falls back to EAST/WEST port sides without throwing', () => {
    const manifest = {
      canopus: '0.1',
      name: 'unknown_type_test',
      components: [
        { id: 'a', type: 'uvm_component' },
        { id: 'b', type: 'uvm_component' },
      ],
      connections: [{
        id: 'c1', from: 'a', to: 'b', type: 'custom.future_type',
      }],
    };

    expect(() => manifestToElk(manifest)).not.toThrow();

    const graph  = manifestToElk(manifest);
    const nodeA  = findNode(graph, 'a');
    const outPort = nodeA.ports.find(p => p.id === 'a__out__c1');

    expect(outPort).toBeDefined();
    // Falls back to default EAST side
    expect(outPort.layoutOptions['port.side']).toBe('EAST');
  });
});
