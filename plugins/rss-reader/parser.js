// CJS module — used by server/index.js (CJS) and parser.test.js (vitest).
// Requires fast-xml-parser at runtime. Plugin server is loaded via require()
// from the host Node process, so the host must have fast-xml-parser available
// in a node_modules resolvable from the plugin file location.
const { XMLParser } = require('fast-xml-parser');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  cdataPropName: '__cdata',
  trimValues: true,
});

function stripCdata(v) {
  if (v && typeof v === 'object' && v.__cdata !== undefined) return v.__cdata;
  if (v && typeof v === 'object' && v['#text'] !== undefined) return v['#text'];
  return v;
}

function normalizeItems(items, kind) {
  return items.map((it) => {
    if (kind === 'atom') {
      const linkHref =
        (it.link && typeof it.link === 'object' && it.link['@href']) ||
        (Array.isArray(it.link) && it.link[0] && it.link[0]['@href']) ||
        '';
      const linkStr = typeof it.link === 'string' ? it.link : linkHref;
      return {
        guid: it.id || linkStr || stripCdata(it.title) || '',
        title: stripCdata(it.title) || '',
        link: linkStr || '',
        description: stripCdata(it.summary || it.content) || '',
        pubDate: it.updated || it.published || null,
      };
    }
    let guidVal = '';
    if (it.guid && typeof it.guid === 'object') {
      guidVal = String(it.guid['#text'] ?? it.guid.__cdata ?? '');
    } else if (it.guid !== undefined && it.guid !== null && it.guid !== '') {
      guidVal = String(it.guid);
    }
    if (!guidVal) {
      guidVal = String(it.link ?? stripCdata(it.title) ?? '');
    }
    const linkVal =
      typeof it.link === 'string' || typeof it.link === 'number'
        ? String(it.link)
        : (it.link && it.link['@href']) || '';
    return {
      guid: guidVal,
      title: String(stripCdata(it.title) ?? ''),
      link: linkVal,
      description: String(stripCdata(it.description) ?? ''),
      pubDate: it.pubDate || null,
    };
  });
}

function parseFeed(xml) {
  const doc = parser.parse(xml);
  if (doc && doc.rss && doc.rss.channel) {
    const ch = doc.rss.channel;
    const items = Array.isArray(ch.item) ? ch.item : (ch.item ? [ch.item] : []);
    return { title: stripCdata(ch.title) || 'Untitled', items: normalizeItems(items, 'rss') };
  }
  if (doc && doc.feed) {
    const items = Array.isArray(doc.feed.entry) ? doc.feed.entry : (doc.feed.entry ? [doc.feed.entry] : []);
    return { title: stripCdata(doc.feed.title) || 'Untitled', items: normalizeItems(items, 'atom') };
  }
  throw new Error('Unrecognized feed format');
}

module.exports = { parseFeed };
