function applyDateFormat(date, fmt) {
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return fmt
    .replace(/YYYY/g, date.getFullYear())
    .replace(/MM/g, pad(date.getMonth() + 1))
    .replace(/DD/g, pad(date.getDate()))
    .replace(/HH/g, pad(date.getHours()))
    .replace(/mm/g, pad(date.getMinutes()))
    .replace(/ss/g, pad(date.getSeconds()));
}

function extractPrompts(template) {
  const re = /\{\{prompt:([a-zA-Z0-9_]+)\}\}/g;
  const seen = new Set();
  const out = [];
  for (const m of template.matchAll(re)) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    out.push(m[1]);
  }
  return out;
}

function processTemplate(template, { now = new Date(), vars = {}, prompts = {} } = {}) {
  return template
    .replace(/\{\{date:([^}]+)\}\}/g, (_, fmt) => applyDateFormat(now, fmt))
    .replace(/\{\{date\}\}/g, applyDateFormat(now, 'YYYY-MM-DD'))
    .replace(/\{\{time\}\}/g, applyDateFormat(now, 'HH:mm:ss'))
    .replace(/\{\{now\}\}/g, now.toISOString())
    .replace(/\{\{random\}\}/g, Math.random().toString(36).slice(2, 10))
    .replace(/\{\{prompt:([a-zA-Z0-9_]+)\}\}/g, (_, name) =>
      Object.prototype.hasOwnProperty.call(prompts, name) ? prompts[name] : '',
    )
    .replace(/\{\{(\w+)\}\}/g, (m, name) =>
      Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : m,
    );
}

module.exports = { applyDateFormat, extractPrompts, processTemplate };
