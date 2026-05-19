import type { PluginAPI } from '../../../types/server';

export function activate(api: PluginAPI): void {
  api.log.info("Word Count plugin activated");

  api.routes.register("get", "/count/:userId/*", async (req, res) => {
    try {
      const params = req.params as Record<string, string>;
      const userId = params.userId;
      const notePath = params["*"];
      const note = await api.notes.get(userId, notePath);
      const words = note.content.trim().split(/\s+/).filter(Boolean).length;
      const chars = note.content.length;
      const lines = note.content.split("\n").length;
      res.json({ words, chars, lines });
    } catch {
      res.status(404).json({ error: "Note not found" });
    }
  });

  api.events.on("note:afterSave", (ctx: any) => {
    api.log.info(`Note saved: ${ctx.path}`);
  });
}

export function deactivate(): void {
  // Nothing to clean up
}
