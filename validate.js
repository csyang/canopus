/**
 * validate.js
 * Canopus — Manifest Validator
 *
 * Validates a parsed Canopus manifest object in two passes:
 *
 *   Pass 1 — JSON Schema (AJV)
 *     Structural validation: required fields, correct types, enum membership,
 *     ID pattern, meta value types. Catches malformed manifests before any
 *     semantic checks run.
 *
 *   Pass 2 — Semantic checks (custom)
 *     Things JSON Schema cannot express:
 *       a) All component IDs are globally unique across the entire tree
 *       b) All connection from/to values reference a declared component ID
 *       c) mode: active|passive is only used on uvm_agent components
 *       d) Children are only present on compound-capable component types
 *
 * Usage:
 *   import { validateManifest } from './validate.js';
 *
 *   const result = validateManifest(parsedYaml);
 *   if (!result.valid) {
 *     result.errors.forEach(e => console.error(e.message));
 *   }
 *
 * Returns:
 *   { valid: boolean, errors: [{ path, message, hint }] }
 *
 * Dependencies:
 *   npm install ajv ajv-formats
 */

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// AJV setup
// ─────────────────────────────────────────────────────────────────────────────

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

// Load schema relative to this file
const __dir    = dirname(fileURLToPath(import.meta.url));
const schema   = JSON.parse(readFileSync(join(__dir, 'manifest.schema.json'), 'utf8'));
const validate = ajv.compile(schema);

// ─────────────────────────────────────────────────────────────────────────────
// Component types that may have children (compound nodes)
// ─────────────────────────────────────────────────────────────────────────────

const COMPOUND_TYPES = new Set([
  'uvm_test',
  'uvm_env',
  'uvm_agent',
  'uvm_component',   // generic — allowed to be compound
]);

// ─────────────────────────────────────────────────────────────────────────────
// Error builder
// ─────────────────────────────────────────────────────────────────────────────

function err(path, message, hint = null) {
  return { path, message, hint };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pass 1 — JSON Schema via AJV
// ─────────────────────────────────────────────────────────────────────────────

function runSchemaValidation(manifest) {
  const valid = validate(manifest);
  if (valid) return [];

  return validate.errors.map(e => {
    // Translate AJV's terse error objects into actionable messages
    const path    = e.instancePath || '(root)';
    const keyword = e.keyword;

    let message = `${path}: ${e.message}`;
    let hint    = null;

    if (keyword === 'enum') {
      const allowed = e.params.allowedValues;
      hint = `Allowed values: ${allowed.join(', ')}`;
    }

    if (keyword === 'required') {
      const missing = e.params.missingProperty;
      message = `${path}: missing required field '${missing}'`;
    }

    if (keyword === 'pattern') {
      hint = 'IDs and names must start with a letter and contain only letters, digits, and underscores';
    }

    if (keyword === 'const') {
      message = `${path}: must be exactly '${e.params.allowedValue}'`;
      hint    = `Did you mean canopus: "0.1"?`;
    }

    if (keyword === 'additionalProperties') {
      const extra = e.params.additionalProperty;
      message = `${path}: unknown field '${extra}'`;
      hint    = 'Check the Canopus schema for supported fields';
    }

    return err(path, message, hint);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Pass 2 — Semantic checks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Recursively collect all component IDs from the tree.
 * Returns a Map of { id → { type, path } } for duplicate and type detection.
 */
function collectIds(components, path = 'components', idMap = new Map()) {
  for (let i = 0; i < components.length; i++) {
    const comp    = components[i];
    const compPath = `${path}[${i}]`;

    if (comp.id != null) {
      if (idMap.has(comp.id)) {
        // Mark as duplicate — both entries flagged
        idMap.get(comp.id).duplicate = true;
        idMap.set(`${comp.id}__dup__${compPath}`, {
          type: comp.type, path: compPath, duplicate: true,
        });
      } else {
        idMap.set(comp.id, { type: comp.type, path: compPath });
      }
    }

    if (Array.isArray(comp.children)) {
      collectIds(comp.children, `${compPath}.children`, idMap);
    }
  }

  return idMap;
}

function runSemanticChecks(manifest) {
  const errors = [];
  const idMap  = collectIds(manifest.components ?? []);

  // ── (a) Global ID uniqueness ─────────────────────────────────────────────
  for (const [id, info] of idMap.entries()) {
    if (info.duplicate) {
      errors.push(err(
        info.path,
        `Duplicate component id: "${id}"`,
        'Component IDs must be globally unique across the entire manifest, not just within their parent'
      ));
    }
  }

  // ── (b) Connection endpoint references ──────────────────────────────────
  for (let i = 0; i < (manifest.connections ?? []).length; i++) {
    const conn     = manifest.connections[i];
    const connPath = `connections[${i}]`;

    if (conn.from && !idMap.has(conn.from)) {
      errors.push(err(
        `${connPath}.from`,
        `Connection "${conn.id ?? i}": unknown source id "${conn.from}"`,
        'Ensure the id exists in the components tree'
      ));
    }

    if (conn.to && !idMap.has(conn.to)) {
      errors.push(err(
        `${connPath}.to`,
        `Connection "${conn.id ?? i}": unknown target id "${conn.to}"`,
        'Ensure the id exists in the components tree'
      ));
    }

    // Self-loop guard
    if (conn.from && conn.to && conn.from === conn.to) {
      errors.push(err(
        connPath,
        `Connection "${conn.id ?? i}": source and target are the same component ("${conn.from}")`,
        'A component cannot connect to itself'
      ));
    }
  }

  // ── (c) mode field only on uvm_agent ────────────────────────────────────
  function checkMode(components, path) {
    for (let i = 0; i < components.length; i++) {
      const comp     = components[i];
      const compPath = `${path}[${i}]`;

      if (comp.mode != null && comp.type !== 'uvm_agent') {
        errors.push(err(
          `${compPath}.mode`,
          `Component "${comp.id}": mode field is only valid on uvm_agent (found on ${comp.type})`,
          'Remove the mode field or change the component type to uvm_agent'
        ));
      }

      if (Array.isArray(comp.children)) {
        checkMode(comp.children, `${compPath}.children`);
      }
    }
  }
  checkMode(manifest.components ?? [], 'components');

  // ── (d) children only on compound-capable types ─────────────────────────
  function checkChildren(components, path) {
    for (let i = 0; i < components.length; i++) {
      const comp     = components[i];
      const compPath = `${path}[${i}]`;

      if (Array.isArray(comp.children) && comp.children.length > 0) {
        if (!COMPOUND_TYPES.has(comp.type)) {
          errors.push(err(
            `${compPath}.children`,
            `Component "${comp.id}" (${comp.type}) has children but is not a compound type`,
            `Only these types may contain children: ${[...COMPOUND_TYPES].join(', ')}`
          ));
        }
        checkChildren(comp.children, `${compPath}.children`);
      }
    }
  }
  checkChildren(manifest.components ?? [], 'components');

  return errors;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate a parsed Canopus manifest object.
 *
 * @param  {object} manifest   Parsed YAML/JSON manifest
 * @returns {{ valid: boolean, errors: Array<{ path, message, hint }> }}
 */
export function validateManifest(manifest) {
  // Pass 1 — schema
  const schemaErrors = runSchemaValidation(manifest);

  // Pass 2 — semantics (only if schema passed; avoids noisy cascading errors)
  const semanticErrors = schemaErrors.length === 0
    ? runSemanticChecks(manifest)
    : [];

  const errors = [...schemaErrors, ...semanticErrors];
  return { valid: errors.length === 0, errors };
}

/**
 * Format validation errors as a human-readable string for CLI output.
 *
 * @param  {Array}  errors   Output of validateManifest().errors
 * @param  {string} filename Optional filename shown at the top
 * @returns {string}
 */
export function formatErrors(errors, filename = null) {
  if (errors.length === 0) return '';

  const header = filename
    ? `✗ ${filename}: ${errors.length} error${errors.length > 1 ? 's' : ''}\n`
    : `✗ ${errors.length} error${errors.length > 1 ? 's' : ''}\n`;

  const lines = errors.map(e => {
    const hint = e.hint ? `\n    hint: ${e.hint}` : '';
    return `  • [${e.path}] ${e.message}${hint}`;
  });

  return header + lines.join('\n');
}
