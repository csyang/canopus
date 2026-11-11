/**
 * tests/validate.test.js
 * Canopus — Validator Unit Tests
 *
 * Tests the two-pass validation pipeline (JSON Schema + semantic checks)
 * against:
 *   - All five topology fixture manifests (must pass cleanly)
 *   - Targeted invalid manifests covering every error path
 *
 * Fixture manifests are loaded from disk so validation tests stay in sync
 * with the actual YAML files rather than duplicating them inline.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml              from 'js-yaml';
import {
  validateManifest,
  formatErrors,
}                        from '../validate.js';

const __dir      = dirname(fileURLToPath(import.meta.url));
const TOPO_DIR   = join(__dir, '../topologies');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function loadFixture(filename) {
  const raw = readFileSync(join(TOPO_DIR, filename), 'utf8');
  return yaml.load(raw);
}

function expectValid(manifest) {
  const result = validateManifest(manifest);
  if (!result.valid) {
    throw new Error(
      `Expected manifest to be valid but got errors:\n${formatErrors(result.errors)}`
    );
  }
  expect(result.valid).toBe(true);
  expect(result.errors).toHaveLength(0);
}

function expectInvalid(manifest, { count, paths = [], messages = [] } = {}) {
  const result = validateManifest(manifest);
  expect(result.valid).toBe(false);
  expect(result.errors.length).toBeGreaterThan(0);

  if (count !== undefined) {
    expect(result.errors).toHaveLength(count);
  }

  for (const path of paths) {
    const found = result.errors.some(e => e.path.includes(path));
    if (!found) {
      throw new Error(
        `Expected an error at path containing "${path}" but none found.\n` +
        `Errors: ${JSON.stringify(result.errors, null, 2)}`
      );
    }
  }

  for (const fragment of messages) {
    const found = result.errors.some(e => e.message.includes(fragment));
    if (!found) {
      throw new Error(
        `Expected an error message containing "${fragment}" but none found.\n` +
        `Errors: ${JSON.stringify(result.errors, null, 2)}`
      );
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixture validation — all five topologies must pass cleanly
// ─────────────────────────────────────────────────────────────────────────────

describe('Fixture manifests — all five topologies', () => {
  const fixtures = [
    't1_canonical_single_agent.canopus.yaml',
    't2_multi_agent_virtual_sequencer.canopus.yaml',
    't3_hierarchical_sub_envs.canopus.yaml',
    't4_ral_integrated.canopus.yaml',
    't5_passive_monitoring.canopus.yaml',
  ];

  test.each(fixtures)('%s is valid', (filename) => {
    const manifest = loadFixture(filename);
    expectValid(manifest);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Schema validation — Pass 1
// ─────────────────────────────────────────────────────────────────────────────

describe('Schema validation (Pass 1)', () => {

  describe('Required top-level fields', () => {
    test('missing canopus version is caught', () => {
      const m = { name: 'test', components: [], connections: [] };
      expectInvalid(m, { paths: ['canopus'] });
    });

    test('wrong canopus version is caught', () => {
      const m = { canopus: '0.2', name: 'test', components: [
        { id: 'test', type: 'uvm_test' }
      ], connections: [] };
      expectInvalid(m, { messages: ["must be exactly '0.1'"] });
    });

    test('missing name is caught', () => {
      const m = { canopus: '0.1', components: [], connections: [] };
      expectInvalid(m, { paths: ['name'] });
    });

    test('missing components is caught', () => {
      const m = { canopus: '0.1', name: 'test', connections: [] };
      expectInvalid(m, { paths: ['components'] });
    });

    test('missing connections is caught', () => {
      const m = { canopus: '0.1', name: 'test', components: [
        { id: 'test', type: 'uvm_test' }
      ] };
      expectInvalid(m, { paths: ['connections'] });
    });

    test('unknown top-level field is caught', () => {
      const m = {
        canopus: '0.1', name: 'test',
        components: [{ id: 'test', type: 'uvm_test' }],
        connections: [],
        unknownField: true,
      };
      expectInvalid(m, { messages: ["unknown field 'unknownField'"] });
    });
  });

  describe('Component validation', () => {
    const base = {
      canopus: '0.1',
      name: 'test',
      connections: [],
    };

    test('missing component id is caught', () => {
      const m = { ...base, components: [{ type: 'uvm_test' }] };
      expectInvalid(m, { paths: ['id'] });
    });

    test('missing component type is caught', () => {
      const m = { ...base, components: [{ id: 'test' }] };
      expectInvalid(m, { paths: ['type'] });
    });

    test('invalid component type is caught', () => {
      const m = { ...base, components: [{ id: 'test', type: 'uvm_invalid_type' }] };
      expectInvalid(m, { messages: ['uvm_invalid_type'] });
    });

    test('ID with invalid pattern (spaces) is caught', () => {
      const m = { ...base, components: [{ id: 'my component', type: 'uvm_test' }] };
      expectInvalid(m);
    });

    test('ID starting with a digit is caught', () => {
      const m = { ...base, components: [{ id: '1test', type: 'uvm_test' }] };
      expectInvalid(m);
    });

    test('invalid mode value is caught', () => {
      const m = { ...base, components: [{
        id: 'agent', type: 'uvm_agent', mode: 'hybrid',
      }]};
      expectInvalid(m, { messages: ['hybrid'] });
    });

    test('negative level is caught', () => {
      const m = { ...base, components: [{
        id: 'test', type: 'uvm_test', level: -1,
      }]};
      expectInvalid(m, { paths: ['level'] });
    });

    test('unknown component field is caught', () => {
      const m = { ...base, components: [{
        id: 'test', type: 'uvm_test', unknownProp: true,
      }]};
      expectInvalid(m, { messages: ["unknown field 'unknownProp'"] });
    });
  });

  describe('Connection validation', () => {
    const base = {
      canopus: '0.1',
      name: 'test',
      components: [
        { id: 'seqr', type: 'uvm_sequencer' },
        { id: 'drv',  type: 'uvm_driver' },
      ],
    };

    test('missing connection id is caught', () => {
      const m = { ...base, connections: [{ from: 'seqr', to: 'drv', type: 'tlm.blocking_get' }] };
      expectInvalid(m, { paths: ['id'] });
    });

    test('missing connection from is caught', () => {
      const m = { ...base, connections: [{ id: 'c1', to: 'drv', type: 'tlm.blocking_get' }] };
      expectInvalid(m, { paths: ['from'] });
    });

    test('missing connection to is caught', () => {
      const m = { ...base, connections: [{ id: 'c1', from: 'seqr', type: 'tlm.blocking_get' }] };
      expectInvalid(m, { paths: ['to'] });
    });

    test('missing connection type is caught', () => {
      const m = { ...base, connections: [{ id: 'c1', from: 'seqr', to: 'drv' }] };
      expectInvalid(m, { paths: ['type'] });
    });

    test('invalid connection type is caught', () => {
      const m = { ...base, connections: [{ id: 'c1', from: 'seqr', to: 'drv', type: 'tlm.magic' }] };
      expectInvalid(m, { messages: ['tlm.magic'] });
    });
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// Semantic validation — Pass 2
// ─────────────────────────────────────────────────────────────────────────────

describe('Semantic validation (Pass 2)', () => {

  const minimal = (components, connections = []) => ({
    canopus: '0.1',
    name: 'test',
    components,
    connections,
  });

  describe('Global ID uniqueness', () => {
    test('duplicate sibling IDs are caught', () => {
      const m = minimal([
        { id: 'env', type: 'uvm_env', children: [
          { id: 'mon', type: 'uvm_monitor' },
          { id: 'mon', type: 'uvm_monitor' },   // duplicate
        ]},
      ]);
      expectInvalid(m, { messages: ['Duplicate component id: "mon"'] });
    });

    test('duplicate IDs across sub-envs are caught', () => {
      // This is the T3 failure mode — two monitors with the same ID
      const m = minimal([
        { id: 'env', type: 'uvm_env', children: [
          { id: 'sub_a', type: 'uvm_env', children: [
            { id: 'mon', type: 'uvm_monitor' },    // first
          ]},
          { id: 'sub_b', type: 'uvm_env', children: [
            { id: 'mon', type: 'uvm_monitor' },    // duplicate across sub-envs
          ]},
        ]},
      ]);
      expectInvalid(m, { messages: ['Duplicate component id: "mon"'] });
    });

    test('unique IDs across sub-envs pass', () => {
      const m = minimal([
        { id: 'env', type: 'uvm_env', children: [
          { id: 'sub_a', type: 'uvm_env', children: [
            { id: 'ahb_mon', type: 'uvm_monitor' },
          ]},
          { id: 'sub_b', type: 'uvm_env', children: [
            { id: 'apb_mon', type: 'uvm_monitor' },
          ]},
        ]},
      ]);
      expectValid(m);
    });
  });

  describe('Connection endpoint references', () => {
    test('unknown from reference is caught', () => {
      const m = minimal(
        [{ id: 'drv', type: 'uvm_driver' }],
        [{ id: 'c1', from: 'ghost_seqr', to: 'drv', type: 'tlm.blocking_get' }],
      );
      expectInvalid(m, { messages: ['unknown source id "ghost_seqr"'] });
    });

    test('unknown to reference is caught', () => {
      const m = minimal(
        [{ id: 'seqr', type: 'uvm_sequencer' }],
        [{ id: 'c1', from: 'seqr', to: 'ghost_drv', type: 'tlm.blocking_get' }],
      );
      expectInvalid(m, { messages: ['unknown target id "ghost_drv"'] });
    });

    test('valid cross-boundary reference passes', () => {
      // T3 pattern: monitor inside sub-env → scoreboard in parent env
      const m = minimal([
        { id: 'env', type: 'uvm_env', children: [
          { id: 'sub', type: 'uvm_env', children: [
            { id: 'mon', type: 'uvm_monitor' },
          ]},
          { id: 'sb', type: 'uvm_scoreboard' },
        ]},
      ], [
        { id: 'c1', from: 'mon', to: 'sb', type: 'tlm.analysis',
          meta: { boundary_cross: true } },
      ]);
      expectValid(m);
    });

    test('self-loop is caught', () => {
      const m = minimal(
        [{ id: 'seqr', type: 'uvm_sequencer' }],
        [{ id: 'c1', from: 'seqr', to: 'seqr', type: 'tlm.blocking_get' }],
      );
      expectInvalid(m, { messages: ['cannot connect to itself'] });
    });
  });

  describe('mode field scope', () => {
    test('mode on uvm_agent is valid', () => {
      const m = minimal([{ id: 'agent', type: 'uvm_agent', mode: 'passive' }]);
      expectValid(m);
    });

    test('mode on uvm_env is caught', () => {
      const m = minimal([{ id: 'env', type: 'uvm_env', mode: 'passive' }]);
      expectInvalid(m, { messages: ['mode field is only valid on uvm_agent'] });
    });

    test('mode on uvm_monitor is caught', () => {
      const m = minimal([{ id: 'mon', type: 'uvm_monitor', mode: 'active' }]);
      expectInvalid(m, { messages: ['mode field is only valid on uvm_agent'] });
    });
  });

  describe('Children on compound types only', () => {
    test('children on uvm_env are valid', () => {
      const m = minimal([{
        id: 'env', type: 'uvm_env',
        children: [{ id: 'mon', type: 'uvm_monitor' }],
      }]);
      expectValid(m);
    });

    test('children on uvm_monitor are caught', () => {
      const m = minimal([{
        id: 'mon', type: 'uvm_monitor',
        children: [{ id: 'child', type: 'uvm_component' }],
      }]);
      expectInvalid(m, { messages: ['has children but is not a compound type'] });
    });

    test('children on uvm_scoreboard are caught', () => {
      const m = minimal([{
        id: 'sb', type: 'uvm_scoreboard',
        children: [{ id: 'child', type: 'uvm_component' }],
      }]);
      expectInvalid(m, { messages: ['has children but is not a compound type'] });
    });
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// Error formatting
// ─────────────────────────────────────────────────────────────────────────────

describe('formatErrors()', () => {
  test('returns empty string for no errors', () => {
    expect(formatErrors([], 'test.yaml')).toBe('');
  });

  test('includes filename in header', () => {
    const errors = [{ path: 'name', message: 'missing name', hint: null }];
    const output = formatErrors(errors, 'my_topology.yaml');
    expect(output).toContain('my_topology.yaml');
  });

  test('includes error path and message', () => {
    const errors = [{ path: 'components[0].id', message: 'missing id', hint: null }];
    const output = formatErrors(errors);
    expect(output).toContain('components[0].id');
    expect(output).toContain('missing id');
  });

  test('includes hint when present', () => {
    const errors = [{
      path: 'connections[0].from',
      message: 'unknown source',
      hint: 'Check the components tree',
    }];
    const output = formatErrors(errors);
    expect(output).toContain('hint:');
    expect(output).toContain('Check the components tree');
  });

  test('pluralises error count correctly', () => {
    const one  = [{ path: 'x', message: 'm', hint: null }];
    const many = [...one, ...one];
    expect(formatErrors(one)).toContain('1 error\n');
    expect(formatErrors(many)).toContain('2 errors\n');
  });
});
