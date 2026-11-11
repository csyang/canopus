#!/usr/bin/env node
/**
 * cli.js
 * Canopus — Command Line Interface
 *
 * Commands:
 *   canopus validate <manifest>          Validate a manifest against the schema
 *   canopus layout   <manifest> [opts]   Run transform + ELK layout, emit JSON
 *   canopus render   <manifest> [opts]   Emit a static SVG diagram
 *
 * All commands accept either a .yaml or .json manifest file.
 * Exit code 0 = success, 1 = validation/runtime error.
 */

import { program }              from 'commander';
import { readFileSync,
         writeFileSync }        from 'fs';
import { resolve, extname,
         basename }             from 'path';
import yaml                     from 'js-yaml';
import ELK                      from 'elkjs/lib/elk.bundled.js';
import { validateManifest,
         formatErrors }         from './validate.js';
import { manifestToElk }        from './manifest-to-elk.js';
import { absolutiseAndFlatten,
         renderStaticSvg }      from './render-static.js';

// ─────────────────────────────────────────────────────────────────────────────
// Shared utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load and parse a manifest file (.yaml or .json).
 * Exits with code 1 on parse error.
 */
function loadManifest(filePath) {
  const abs = resolve(filePath);
  let raw;

  try {
    raw = readFileSync(abs, 'utf8');
  } catch {
    console.error(`✗ Cannot read file: ${filePath}`);
    process.exit(1);
  }

  const ext = extname(filePath).toLowerCase();

  try {
    if (ext === '.json') {
      return { manifest: JSON.parse(raw), filename: basename(filePath) };
    } else {
      // Default to YAML for .yaml, .yml, or unknown extensions
      return { manifest: yaml.load(raw), filename: basename(filePath) };
    }
  } catch (e) {
    console.error(`✗ Parse error in ${filePath}:\n  ${e.message}`);
    process.exit(1);
  }
}

/**
 * Validate a manifest, print results, and return validity boolean.
 * Shared between the validate command and the layout/render commands
 * (which validate implicitly before proceeding).
 */
function runValidation(manifest, filename, { silent = false } = {}) {
  const result = validateManifest(manifest);

  if (result.valid) {
    if (!silent) {
      console.log(`✓ ${filename}: valid`);
    }
    return true;
  }

  console.error(formatErrors(result.errors, filename));
  return false;
}

/**
 * Determine output path: use --output if given, otherwise derive from input.
 */
function resolveOutput(inputPath, fallbackExt, outputOpt) {
  if (outputOpt) return resolve(outputOpt);
  const base = basename(inputPath).replace(/\.(canopus\.)?(yaml|yml|json)$/i, '');
  return resolve(`${base}${fallbackExt}`);
}

/**
 * Write a file and print a confirmation line.
 */
function writeOutput(filePath, content) {
  try {
    writeFileSync(filePath, content, 'utf8');
    console.log(`  → written to ${filePath}`);
  } catch (e) {
    console.error(`✗ Could not write output: ${e.message}`);
    process.exit(1);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI definition
// ─────────────────────────────────────────────────────────────────────────────

program
  .name('canopus')
  .description('TLM topology visualiser — validate, layout, and render UVM manifests')
  .version('0.1.0');

// ── canopus validate ─────────────────────────────────────────────────────────

program
  .command('validate <manifest>')
  .description('Validate a Canopus manifest file against the schema')
  .option('--json', 'Output results as JSON (for tooling integration)')
  .action((manifestPath, opts) => {
    const { manifest, filename } = loadManifest(manifestPath);
    const result = validateManifest(manifest);

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.valid ? 0 : 1);
    }

    if (result.valid) {
      console.log(`✓ ${filename}: valid`);
      console.log(`  ${countComponents(manifest)} components · ${manifest.connections?.length ?? 0} connections`);
      process.exit(0);
    } else {
      console.error(formatErrors(result.errors, filename));
      process.exit(1);
    }
  });

// ── canopus layout ───────────────────────────────────────────────────────────

program
  .command('layout <manifest>')
  .description('Run the manifest-to-ELK transform and layout, emit JSON')
  .option('-o, --output <file>', 'Output file path (default: <name>.layout.json)')
  .option('--stdout',            'Print JSON to stdout instead of a file')
  .option('--skip-validate',     'Skip manifest validation before layout')
  .action(async (manifestPath, opts) => {
    const { manifest, filename } = loadManifest(manifestPath);

    if (!opts.skipValidate) {
      const ok = runValidation(manifest, filename, { silent: true });
      if (!ok) process.exit(1);
    }

    // Transform
    let elkGraph;
    try {
      elkGraph = manifestToElk(manifest);
    } catch (e) {
      console.error(`✗ Transform error: ${e.message}`);
      process.exit(1);
    }

    // Layout
    let laid;
    try {
      const elk = new ELK();
      laid = await elk.layout(elkGraph);
    } catch (e) {
      console.error(`✗ ELK layout error: ${e.message}`);
      process.exit(1);
    }

    const json = JSON.stringify(laid, null, 2);

    if (opts.stdout) {
      process.stdout.write(json + '\n');
    } else {
      const outPath = resolveOutput(manifestPath, '.layout.json', opts.output);
      console.log(`✓ ${filename}: layout complete`);
      writeOutput(outPath, json);
    }
  });

// ── canopus render ───────────────────────────────────────────────────────────

program
  .command('render <manifest>')
  .description('Render a manifest to a static SVG diagram')
  .option('-o, --output <file>', 'Output file path (default: <name>.svg)')
  .option('--stdout',            'Print SVG to stdout instead of a file')
  .option('--skip-validate',     'Skip manifest validation before rendering')
  .action(async (manifestPath, opts) => {
    const { manifest, filename } = loadManifest(manifestPath);

    if (!opts.skipValidate) {
      const ok = runValidation(manifest, filename, { silent: true });
      if (!ok) process.exit(1);
    }

    // Transform
    let elkGraph;
    try {
      elkGraph = manifestToElk(manifest);
    } catch (e) {
      console.error(`✗ Transform error: ${e.message}`);
      process.exit(1);
    }

    // Layout
    let laid;
    try {
      const elk = new ELK();
      laid = await elk.layout(elkGraph);
    } catch (e) {
      console.error(`✗ ELK layout error: ${e.message}`);
      process.exit(1);
    }

    // Absolutise and render
    const { nodes, edges } = absolutiseAndFlatten(laid);
    const svg = renderStaticSvg(nodes, edges, manifest.name);

    if (opts.stdout) {
      process.stdout.write(svg);
    } else {
      const outPath = resolveOutput(manifestPath, '.svg', opts.output);
      console.log(`✓ ${filename}: render complete`);
      writeOutput(outPath, svg);
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function countComponents(manifest) {
  let count = 0;
  function walk(components) {
    for (const c of (components ?? [])) {
      count++;
      if (c.children?.length) walk(c.children);
    }
  }
  walk(manifest.components);
  return count;
}

// ─────────────────────────────────────────────────────────────────────────────
// Parse and run
// ─────────────────────────────────────────────────────────────────────────────

program.parse(process.argv);
