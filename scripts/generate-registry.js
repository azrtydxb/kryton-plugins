#!/usr/bin/env node

/**
 * Generates registry.json from plugin manifests.
 *
 * Scans the plugins/ directory, reads each manifest.json,
 * and builds the registry index. Plugin authors never edit
 * registry.json directly — this script is the source of truth.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PLUGINS_DIR = path.join(ROOT, "plugins");
const REGISTRY_PATH = path.join(ROOT, "registry.json");

// Fields to copy from manifest to registry entry
const REGISTRY_FIELDS = ["id", "name", "description", "author", "version", "minKrytonVersion"];
// Optional fields
const OPTIONAL_FIELDS = ["tags", "icon"];

function generateRegistry() {
  if (!fs.existsSync(PLUGINS_DIR)) {
    console.error("No plugins/ directory found");
    process.exit(1);
  }

  const entries = fs.readdirSync(PLUGINS_DIR, { withFileTypes: true });
  const plugins = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const manifestPath = path.join(PLUGINS_DIR, entry.name, "manifest.json");
    if (!fs.existsSync(manifestPath)) {
      console.warn(`  SKIP: ${entry.name}/ — no manifest.json`);
      continue;
    }

    let manifest;
    try {
      const raw = fs.readFileSync(manifestPath, "utf-8");
      manifest = JSON.parse(raw);
    } catch (err) {
      console.error(`  ERROR: Failed to parse ${entry.name}/manifest.json: ${err.message}`);
      process.exit(1);
    }

    // Validate manifest id matches directory
    if (manifest.id !== entry.name) {
      console.error(`  ERROR: Manifest id '${manifest.id}' does not match directory '${entry.name}'`);
      process.exit(1);
    }

    // Build registry entry from manifest
    const registryEntry = {};
    for (const field of REGISTRY_FIELDS) {
      if (!manifest[field]) {
        console.error(`  ERROR: ${entry.name}/manifest.json missing required field '${field}'`);
        process.exit(1);
      }
      registryEntry[field] = manifest[field];
    }
    for (const field of OPTIONAL_FIELDS) {
      if (manifest[field]) {
        registryEntry[field] = manifest[field];
      }
    }

    // Default tags and icon if not set
    if (!registryEntry.tags) registryEntry.tags = [];
    if (!registryEntry.icon) registryEntry.icon = "puzzle";

    plugins.push(registryEntry);
    console.log(`  OK: ${manifest.name} v${manifest.version}`);
  }

  // Sort by id for deterministic output
  plugins.sort((a, b) => a.id.localeCompare(b.id));

  const registry = {
    version: 1,
    plugins,
  };

  const output = JSON.stringify(registry, null, 2) + "\n";
  const existing = fs.existsSync(REGISTRY_PATH)
    ? fs.readFileSync(REGISTRY_PATH, "utf-8")
    : "";

  if (output === existing) {
    console.log(`\nregistry.json is up to date (${plugins.length} plugins)`);
    return false;
  }

  fs.writeFileSync(REGISTRY_PATH, output);
  console.log(`\nregistry.json updated (${plugins.length} plugins)`);
  return true;
}

const changed = generateRegistry();
process.exit(changed ? 0 : 0);
