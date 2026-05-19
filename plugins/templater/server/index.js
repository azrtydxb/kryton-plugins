"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var index_exports = {};
__export(index_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(index_exports);
const { processTemplate, extractPrompts } = require("../template-engine.js");
function collectPaths(entries) {
  const paths = [];
  for (const entry of entries) {
    if (entry.type === "file") {
      paths.push(entry.path);
    } else if (entry.children) {
      paths.push(...collectPaths(entry.children));
    }
  }
  return paths;
}
function activate(api) {
  api.log.info("Templater plugin activated");
  api.routes.register("post", "/process", async (req, res) => {
    try {
      const { template, variables, vars, prompts } = req.body;
      if (typeof template !== "string") {
        res.status(400).json({ error: "template (string) is required" });
        return;
      }
      const processed = processTemplate(template, {
        vars: vars ?? variables ?? {},
        prompts: prompts ?? {}
      });
      res.json({ content: processed });
    } catch (err) {
      api.log.error("Templater /process error", err);
      res.status(500).json({ error: "Failed to process template" });
    }
  });
  api.routes.register("post", "/extract-prompts", async (req, res) => {
    try {
      const { template } = req.body;
      if (typeof template !== "string") {
        res.status(400).json({ error: "template (string) is required" });
        return;
      }
      res.json({ prompts: extractPrompts(template) });
    } catch (err) {
      api.log.error("Templater /extract-prompts error", err);
      res.status(500).json({ error: "Failed to extract prompts" });
    }
  });
  api.routes.register("get", "/template", async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const tpath = String(req.query?.path ?? "");
      if (!tpath) {
        res.status(400).json({ error: "path query param required" });
        return;
      }
      const logicalPath = tpath.replace(/\.md$/i, "");
      const note = await api.notes.get(userId, logicalPath);
      res.json({ content: note.content });
    } catch (err) {
      api.log.error("Templater /template error", err);
      res.status(500).json({ error: err.message ?? "Failed to read template" });
    }
  });
  api.routes.register("get", "/templates", async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      let entries = [];
      try {
        entries = await api.notes.list(userId, "Templates");
      } catch {
        res.json({ templates: [] });
        return;
      }
      const paths = collectPaths(entries);
      const templates = paths.filter((p) => p.endsWith(".md")).map((p) => {
        const parts = p.split("/");
        const filename = parts[parts.length - 1] ?? p;
        const name = filename.replace(/\.md$/i, "");
        return { name, path: p };
      });
      res.json({ templates });
    } catch (err) {
      api.log.error("Templater /templates error", err);
      res.status(500).json({ error: "Failed to list templates" });
    }
  });
}
function deactivate() {
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
