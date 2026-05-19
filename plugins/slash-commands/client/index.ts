// Slash-commands plugin — minimal `suggestions` hook implementation.
//
// History: this plugin previously rendered its own absolutely-positioned
// React popup and intercepted Arrow/Enter/Esc through `onKeyDown`, because
// the host editor declared a `suggestions(state, trigger)` hook without a
// built-in UI consumer.
//
// As of Phase 4.1 (Plan: 2026-05-19-plugins-completion-plan.md), the host
// editor has a built-in suggestion popup that consumes any plugin's
// `suggestions` hook. Trigger detection (`/`, `[[`, `#`), keyboard nav, and
// applying the chosen `Suggestion.insert` to `[trigger.from..trigger.caret]`
// are all owned by the host. This plugin is now just a data source.
//
// ── Known gaps surfaced to the host (see plan §5.B) ───────────────────────
//
// 1. `$cursor` marker. Several command inserts (bold/italic/code/codeblock/
//    table) embed a literal `$cursor` marker so the caret lands inside the
//    inserted markup. The host's `applySuggestion` does NOT process this
//    marker today — it inserts the literal string and places the caret at
//    the end. As a workaround we strip the marker so the user at least gets
//    valid markup; the caret will be at the end of the insertion, not at
//    `$cursor`. A follow-up host change should honor a `$cursor` (or
//    structured `caretOffset`) field on `Suggestion`.
//
// 2. Leading `/` not replaced. The host's `SuggestionTrigger.from` for
//    slash points AFTER the `/` character (see suggestionTrigger.ts), so
//    applying a suggestion replaces only the typed query and leaves the
//    `/` in the document. With our inserts that prepend block-level syntax
//    (`# `, `## `, `> `, `- [ ] `, …) the resulting line is e.g. `/# `
//    rather than `# `. A follow-up host change should make slash triggers
//    cover the `/` itself, or expose an opt-in flag for plugins that want
//    block-replacement semantics.

import type { ClientPluginAPI } from '../../../types/client';

// ---------------------------------------------------------------------------
// Command table — kept in sync with ../commands.js (esbuild runs with
// bundle:false so we cannot import from there at runtime).
// ---------------------------------------------------------------------------

interface SlashCommand {
  id: string;
  label: string;
  description: string;
  // Either a literal insert string (possibly containing `$cursor`) or a
  // dynamic kind that we evaluate at apply-time.
  insert: string | null;
  dynamic?: 'date' | 'time' | 'datetime';
}

function todayISO(d: Date = new Date()): string {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function nowHM(d: Date = new Date()): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function nowISO(d: Date = new Date()): string {
  return d.toISOString();
}

const COMMANDS: SlashCommand[] = [
  { id: 'h1',         label: 'Heading 1',     description: 'Large heading',                       insert: '# ' },
  { id: 'h2',         label: 'Heading 2',     description: 'Medium heading',                      insert: '## ' },
  { id: 'h3',         label: 'Heading 3',     description: 'Small heading',                       insert: '### ' },
  { id: 'bold',       label: 'Bold',          description: 'Bold text',                           insert: '**$cursor**' },
  { id: 'italic',     label: 'Italic',        description: 'Italic text',                         insert: '*$cursor*' },
  { id: 'code',       label: 'Inline Code',   description: 'Inline code span',                    insert: '`$cursor`' },
  { id: 'codeblock',  label: 'Code Block',    description: 'Fenced code block',                   insert: '```lang\n$cursor\n```' },
  { id: 'quote',      label: 'Quote',         description: 'Block quote',                         insert: '> ' },
  { id: 'divider',    label: 'Divider',       description: 'Horizontal rule',                     insert: '\n---\n' },
  { id: 'table',      label: 'Table',         description: '2x2 table template',                  insert: '\n| Col1 | Col2 |\n|------|------|\n| $cursor |  |\n' },
  { id: 'todo',       label: 'Todo Item',     description: 'Task list item',                      insert: '- [ ] ' },
  { id: 'date',       label: 'Date',          description: "Insert today's date (YYYY-MM-DD)",    insert: null, dynamic: 'date' },
  { id: 'time',       label: 'Time',          description: 'Insert current time (HH:mm)',         insert: null, dynamic: 'time' },
  { id: 'datetime',   label: 'Datetime',      description: 'Insert current ISO datetime',         insert: null, dynamic: 'datetime' },
  { id: 'kanban',     label: 'Kanban Board',  description: 'Insert kanban code fence',            insert: '```kanban\n## Todo\n## In Progress\n## Done\n```' },
  { id: 'excalidraw', label: 'Excalidraw',    description: 'Insert excalidraw code fence',        insert: '```excalidraw\n{"elements":[]}\n```' },
  { id: 'mermaid',    label: 'Mermaid',       description: 'Insert mermaid diagram',              insert: '```mermaid\ngraph TD\n  A --> B\n```' },
];

function filterCommands(query: string): SlashCommand[] {
  if (!query) return COMMANDS.slice();
  const q = query.toLowerCase();
  return COMMANDS.filter((c) =>
    c.id.toLowerCase().startsWith(q) || c.label.toLowerCase().includes(q)
  );
}

function resolveInsert(cmd: SlashCommand): string {
  if (cmd.dynamic === 'date') return todayISO();
  if (cmd.dynamic === 'time') return nowHM();
  if (cmd.dynamic === 'datetime') return nowISO();
  return cmd.insert ?? '';
}

// ---------------------------------------------------------------------------
// Plugin activation
// ---------------------------------------------------------------------------

export function activate(api: ClientPluginAPI): void {
  const unregister = api.editor.registerPlugin({
    name: 'slash-commands',
    suggestions: async (_state, t) => {
      const tg = t as { kind?: string; query?: string } | undefined;
      if (!tg || tg.kind !== 'slash') return [];
      const q = String(tg.query ?? '');
      // Strip `$cursor` markers — the host popup doesn't honor them yet
      // (see file-header gap note). Until it does, the marker would land
      // verbatim in the document, which is worse than losing caret
      // placement inside the markup.
      return filterCommands(q).map((cmd) => ({
        id: cmd.id,
        label: cmd.label,
        kind: 'command',
        insert: resolveInsert(cmd).split('$cursor').join(''),
      }));
    },
  });

  (activate as { _cleanup?: () => void })._cleanup = () => {
    try { unregister(); } catch { /* ignore */ }
  };
}

export function deactivate(): void {
  const cleanup = (activate as { _cleanup?: () => void })._cleanup;
  if (cleanup) cleanup();
}
