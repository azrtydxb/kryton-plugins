// Pure data + filtering for slash-command suggestions. Kept in CJS so the
// vitest unit tests (which run under Node) can require() it directly without
// pulling in the browser-only client bundle.
//
// IMPORTANT: client/index.ts inlines this same data because the client bundle
// is built with `bundle: false`, so cross-file imports would not resolve at
// runtime in the browser. If you change a command here, update the matching
// table in client/index.ts as well — and vice versa.

'use strict';

function todayISO(date) {
  const d = date || new Date();
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function nowHM(date) {
  const d = date || new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function nowISO(date) {
  const d = date || new Date();
  return d.toISOString();
}

// `$cursor` is a marker the client uses to place the caret after applying.
// If absent, caret lands at the end of the inserted text.
const COMMANDS = [
  { id: 'h1',         label: 'Heading 1',     description: 'Large heading',                            insert: '# ' },
  { id: 'h2',         label: 'Heading 2',     description: 'Medium heading',                           insert: '## ' },
  { id: 'h3',         label: 'Heading 3',     description: 'Small heading',                            insert: '### ' },
  { id: 'bold',       label: 'Bold',          description: 'Bold text',                                insert: '**$cursor**' },
  { id: 'italic',     label: 'Italic',        description: 'Italic text',                              insert: '*$cursor*' },
  { id: 'code',       label: 'Inline Code',   description: 'Inline code span',                         insert: '`$cursor`' },
  { id: 'codeblock',  label: 'Code Block',    description: 'Fenced code block',                        insert: '```lang\n$cursor\n```' },
  { id: 'quote',      label: 'Quote',         description: 'Block quote',                              insert: '> ' },
  { id: 'divider',    label: 'Divider',       description: 'Horizontal rule',                          insert: '\n---\n' },
  { id: 'table',      label: 'Table',         description: '2x2 table template',                       insert: '\n| Col1 | Col2 |\n|------|------|\n| $cursor |  |\n' },
  { id: 'todo',       label: 'Todo Item',     description: 'Task list item',                           insert: '- [ ] ' },
  { id: 'date',       label: 'Date',          description: "Insert today's date (YYYY-MM-DD)",         insert: null, dynamic: 'date' },
  { id: 'time',       label: 'Time',          description: 'Insert current time (HH:mm)',              insert: null, dynamic: 'time' },
  { id: 'datetime',   label: 'Datetime',      description: 'Insert current ISO datetime',              insert: null, dynamic: 'datetime' },
  { id: 'kanban',     label: 'Kanban Board',  description: 'Insert kanban code fence',                 insert: '```kanban\n## Todo\n## In Progress\n## Done\n```' },
  { id: 'excalidraw', label: 'Excalidraw',    description: 'Insert excalidraw code fence',             insert: '```excalidraw\n{"elements":[]}\n```' },
  { id: 'mermaid',    label: 'Mermaid',       description: 'Insert mermaid diagram',                   insert: '```mermaid\ngraph TD\n  A --> B\n```' },
];

/**
 * Resolve the actual text to insert for a command, evaluating any dynamic
 * placeholder (date/time/datetime) at call-time.
 */
function resolveInsert(cmd, now) {
  if (cmd.dynamic === 'date') return todayISO(now);
  if (cmd.dynamic === 'time') return nowHM(now);
  if (cmd.dynamic === 'datetime') return nowISO(now);
  return cmd.insert;
}

/**
 * Filter the command list by a free-text query. Matching is case-insensitive
 * and checks both the id prefix and a substring match on the label. Empty
 * query returns the full list in declaration order.
 */
function filterCommands(query) {
  if (!query) return COMMANDS.slice();
  const q = String(query).toLowerCase();
  return COMMANDS.filter((c) =>
    c.id.toLowerCase().startsWith(q) || c.label.toLowerCase().includes(q)
  );
}

module.exports = {
  COMMANDS,
  filterCommands,
  resolveInsert,
  todayISO,
  nowHM,
  nowISO,
};
